import type { Context } from "hono";

import {
  PROPERTY_DEFAULTS,
  PROPERTY_DOC_IDS,
  type PropertyDocId,
} from "@/constants/agentPropertyDefaults";
import { getFirestore } from "@/lib/firestore";
import type { AgentsInfoAuthContext } from "@/types/agents";
import { appendImplementationActivityEntry } from "@/services/implementation-activity.service";
import {
  extractFirestoreIndexUrl,
  firestoreFailureHint,
  isFirebaseConfigError,
} from "@/utils/firestore/errors";
import { userCanAccessAgent } from "@/utils/agents";

function handleFirestoreError(c: Context, error: unknown, logPrefix: string) {
  if (isFirebaseConfigError(error)) {
    return c.json(
      {
        error:
          "Firebase no configurado. Define credenciales de servicio (env o tokens).",
      },
      503,
    );
  }
  const hint = firestoreFailureHint(error);
  const msg = error instanceof Error ? error.message : String(error);
  const createIndexUrl = extractFirestoreIndexUrl(msg);
  console.error(`${logPrefix} Firestore:`, msg);
  if (hint) {
    return c.json(
      { error: hint, ...(createIndexUrl ? { createIndexUrl } : {}) },
      503,
    );
  }
  return c.json({ error: "Error al acceder a Firestore." }, 500);
}

const TESTING_PATCH_SKIP_KEYS = new Set(["_createdAt", "_updatedAt"]);

function isPlainRecord(v: unknown): v is Record<string, unknown> {
  return (
    v !== null &&
    typeof v === "object" &&
    !Array.isArray(v) &&
    Object.getPrototypeOf(v) === Object.prototype
  );
}

/**
 * Rutas tipo `isMultiMessageEnable` o `mcp_configuration.model` a partir del JSON del PATCH (merge).
 */
function collectTestingPropertyPatchPaths(body: Record<string, unknown>): string[] {
  const out: string[] = [];

  function walk(node: unknown, prefix: string): void {
    if (node === null || node === undefined) {
      if (prefix) out.push(prefix);
      return;
    }
    if (Array.isArray(node)) {
      if (prefix) out.push(prefix);
      return;
    }
    if (!isPlainRecord(node)) {
      if (prefix) out.push(prefix);
      return;
    }
    const entries = Object.entries(node).filter(([k]) => !TESTING_PATCH_SKIP_KEYS.has(k));
    if (entries.length === 0) {
      if (prefix) out.push(prefix);
      return;
    }
    for (const [k, v] of entries) {
      const next = prefix ? `${prefix}.${k}` : k;
      if (isPlainRecord(v)) {
        walk(v, next);
      } else {
        out.push(next);
      }
    }
  }

  walk(body, "");
  return [...new Set(out)].sort();
}

function mergeWithDefaults<T extends PropertyDocId>(
  docId: T,
  data: Record<string, unknown> | undefined,
): (typeof PROPERTY_DEFAULTS)[T] {
  const defaults = PROPERTY_DEFAULTS[docId] as Record<string, unknown>;
  if (!data || typeof data !== "object")
    return PROPERTY_DEFAULTS[docId] as (typeof PROPERTY_DEFAULTS)[T];
  if (docId === "ai") {
    const defAi = PROPERTY_DEFAULTS.ai;
    const thinkingData = data.thinking as Record<string, unknown> | undefined;
    const thinking = {
      includeThoughts:
        typeof thinkingData?.includeThoughts === "boolean"
          ? thinkingData.includeThoughts
          : defAi.thinking.includeThoughts,
      level:
        typeof thinkingData?.level === "string"
          ? thinkingData.level
          : defAi.thinking.level,
    };
    const model =
      typeof data.model === "string" && data.model.trim() !== ""
        ? data.model
        : defAi.model;
    const temperature =
      typeof data.temperature === "number"
        ? data.temperature
        : typeof data.temperature === "string"
          ? Number(data.temperature)
          : defAi.temperature;
    return {
      ...defaults,
      ...data,
      model,
      temperature: Number.isFinite(temperature) ? temperature : defAi.temperature,
      thinking,
    } as (typeof PROPERTY_DEFAULTS)[T];
  }
  if (docId === "prompt") {
    const defPrompt = PROPERTY_DEFAULTS.prompt;
    const authData = data.auth as Record<string, string> | undefined;
    const model =
      typeof data.model === "string" && data.model.trim() !== ""
        ? data.model
        : defPrompt.model;
    const temperature =
      typeof data.temperature === "number"
        ? data.temperature
        : typeof data.temperature === "string"
          ? Number(data.temperature)
          : defPrompt.temperature;
    return {
      ...defaults,
      ...data,
      auth: {
        auth:
          typeof authData?.auth === "string"
            ? authData.auth
            : defPrompt.auth.auth,
        unauth:
          typeof authData?.unauth === "string"
            ? authData.unauth
            : defPrompt.auth.unauth,
      },
      model,
      temperature: Number.isFinite(temperature) ? temperature : defPrompt.temperature,
    } as (typeof PROPERTY_DEFAULTS)[T];
  }
  return { ...defaults, ...data } as (typeof PROPERTY_DEFAULTS)[T];
}

export async function getTestingProperties(
  c: Context,
  authCtx: AgentsInfoAuthContext,
  agentId: string,
) {
  try {
    const ok = await userCanAccessAgent(authCtx, agentId);
    if (!ok) {
      return c.json({ error: "No autorizado para este agente" }, 403);
    }
    const db = getFirestore();
    const agentRef = db.collection("agent_configurations").doc(agentId);
    const testingDataRef = agentRef.collection("testing").doc("data");
    const testingDataSnap = await testingDataRef.get();
    if (!testingDataSnap.exists) {
      return c.json({ error: "No hay datos de testing" }, 404);
    }

    const propertiesRef = testingDataRef.collection("properties");
    const result: Record<string, unknown> = {};

    for (const docId of PROPERTY_DOC_IDS) {
      const snap = await propertiesRef.doc(docId).get();
      const data = snap.exists ? snap.data() : undefined;
      result[docId] = mergeWithDefaults(
        docId,
        data as Record<string, unknown> | undefined,
      );
    }

    const allPropsSnap = await propertiesRef.get();
    for (const doc of allPropsSnap.docs) {
      if (result[doc.id] !== undefined) continue;
      result[doc.id] = doc.data();
    }

    return c.json(result);
  } catch (error) {
    const r = handleFirestoreError(c, error, "[testing properties GET]");
    return r ?? c.json({ error: "Error al leer propiedades de testing" }, 500);
  }
}

export async function updateTestingPropertyDocument(
  c: Context,
  authCtx: AgentsInfoAuthContext,
  agentId: string,
  documentId: string,
) {
  try {
    const ok = await userCanAccessAgent(authCtx, agentId);
    if (!ok) {
      return c.json({ error: "No autorizado para este agente" }, 403);
    }

    const isKnownDoc = PROPERTY_DOC_IDS.includes(documentId as PropertyDocId);
    const isValidDynamicDoc = /^[a-zA-Z0-9_-]{1,64}$/.test(documentId);
    if (!isKnownDoc && !isValidDynamicDoc) {
      return c.json({ error: "documentId inválido" }, 400);
    }

    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: "JSON inválido" }, 400);
    }

    if (body == null || typeof body !== "object" || Array.isArray(body)) {
      return c.json({ error: "El cuerpo debe ser un objeto" }, 400);
    }

    const db = getFirestore();
    const agentRef = db.collection("agent_configurations").doc(agentId);
    const testingDataRef = agentRef.collection("testing").doc("data");
    const testingDataSnap = await testingDataRef.get();
    if (!testingDataSnap.exists) {
      await testingDataRef.set({ _createdAt: new Date().toISOString() }, { merge: true });
    }

    const docRef = testingDataRef.collection("properties").doc(documentId);
    const bodyObj = body as Record<string, unknown>;
    await docRef.set(bodyObj, { merge: true });

    const patchPaths = collectTestingPropertyPatchPaths(bodyObj);
    const actorEmail = authCtx.userEmail?.toLowerCase().trim() ?? null;

    // Más de 2 propiedades en un mismo PATCH: un registro de bitácora por cada ruta.
    if (patchPaths.length > 2) {
      for (const p of patchPaths) {
        void appendImplementationActivityEntry(db, agentId, {
          kind: "system",
          actorEmail,
          action: "testing_properties_updated",
          summary: `Actualizó propiedades de testing (${documentId} -> ${p}).`,
          metadata: { documentId, fields: [p] },
        });
      }
    } else {
      const detail =
        patchPaths.length > 0
          ? patchPaths.map((path) => `${documentId} -> ${path}`).join(", ")
          : documentId;
      void appendImplementationActivityEntry(db, agentId, {
        kind: "system",
        actorEmail,
        action: "testing_properties_updated",
        summary: `Actualizó propiedades de testing (${detail}).`,
        metadata: { documentId, fields: patchPaths },
      });
    }

    return c.json({ documentId, success: true });
  } catch (error) {
    const r = handleFirestoreError(c, error, "[testing properties PATCH]");
    return r ?? c.json({ error: "Error al guardar propiedades de testing" }, 500);
  }
}
