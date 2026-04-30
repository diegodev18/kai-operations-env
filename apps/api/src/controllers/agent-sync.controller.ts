import type { Context } from "hono";
import { z } from "zod";
import { Timestamp } from "firebase-admin/firestore";

import { getFirestore } from "@/lib/firestore";
import type { AgentsInfoAuthContext } from "@/types/agents-types";
import { appendImplementationActivityEntry } from "@/services/implementation-activity.service";
import {
  extractFirestoreIndexUrl,
  firestoreFailureHint,
  isFirebaseConfigError,
} from "@/utils/firestore/errors";
import { userCanAccessAgent } from "@/utils/agents";
import {
  computeAgentTestingDiff,
  normalizeForDiff,
  testingDiffEntryKey,
} from "@/utils/agents/agent-testing-diff";

const syncFromProductionBodySchema = z
  .object({
    collections: z
      .array(z.enum(["properties", "tools", "collaborators"]))
      .min(1)
      .optional(),
  })
  .optional();

type SyncFromProductionCollection = NonNullable<
  NonNullable<z.infer<typeof syncFromProductionBodySchema>>["collections"]
>[number];

function handleError(c: Context, error: unknown, logPrefix: string) {
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
  console.error(`${logPrefix}`, msg);
  if (hint) {
    return c.json(
      { error: hint, ...(createIndexUrl ? { createIndexUrl } : {}) },
      503,
    );
  }
  return c.json({ error: msg }, 500);
}

export async function postSyncFromProduction(
  c: Context,
  authCtx: AgentsInfoAuthContext,
  agentId: string,
) {
  let requestedCollections: Set<SyncFromProductionCollection> | null = null;
  const contentType = c.req.header("content-type") ?? "";
  if (contentType.includes("application/json")) {
    let raw: unknown;
    try {
      raw = await c.req.json();
    } catch {
      return c.json({ error: "JSON inválido" }, 400);
    }

    const parsed = syncFromProductionBodySchema.safeParse(raw);
    if (!parsed.success) {
      const msg = parsed.error.issues.map((i) => i.message).join("; ");
      return c.json({ error: msg }, 400);
    }

    if (parsed.data?.collections?.length) {
      requestedCollections = new Set(parsed.data.collections);
    }
  }

  const shouldSyncCollection = (collection: SyncFromProductionCollection) =>
    requestedCollections === null || requestedCollections.has(collection);

  try {
    const ok = await userCanAccessAgent(authCtx, agentId);
    if (!ok) {
      return c.json({ error: "No autorizado para este agente" }, 403);
    }
    const db = getFirestore();
    const prodSnap = await db
      .collection("agent_configurations")
      .doc(agentId)
      .get();
    if (!prodSnap.exists) {
      return c.json({ error: "El agente no existe en producción" }, 404);
    }

    const testingDataRef = db
      .collection("agent_configurations")
      .doc(agentId)
      .collection("testing")
      .doc("data");

    const prodPropertiesRef = prodSnap.ref.collection("properties");
    const prodToolsRef = prodSnap.ref.collection("tools");
    const prodGrowersRef = prodSnap.ref.collection("growers");

    const testingPropertiesRef = testingDataRef.collection("properties");
    const testingToolsRef = testingDataRef.collection("tools");
    const testingCollaboratorsRef = testingDataRef.collection("collaborators");

    const [propsSnap, toolsSnap, growersSnap] = await Promise.all([
      shouldSyncCollection("properties") ? prodPropertiesRef.get() : null,
      shouldSyncCollection("tools") ? prodToolsRef.get() : null,
      shouldSyncCollection("collaborators") ? prodGrowersRef.get() : null,
    ]);

    await testingDataRef.set({ _syncedAt: new Date().toISOString() }, { merge: true });

    if (propsSnap) {
      for (const doc of propsSnap.docs) {
        await testingPropertiesRef.doc(doc.id).set(doc.data(), { merge: true });
      }
    }

    if (toolsSnap) {
      for (const doc of toolsSnap.docs) {
        await testingToolsRef.doc(doc.id).set(doc.data(), { merge: true });
      }
    }

    if (growersSnap) {
      for (const doc of growersSnap.docs) {
        const collaboratorData = {
          email: doc.data()?.email,
          name: doc.data()?.name,
        };
        await testingCollaboratorsRef
          .doc(doc.id)
          .set(collaboratorData, { merge: true });
      }
    }

    return c.json({ ok: true });
  } catch (error) {
    const r = handleError(c, error, "[agents sync-from-production]");
    return r ?? c.json({ error: "No se pudo sincronizar desde producción." }, 500);
  }
}

const promoteBodySchema = z.object({
  fields: z.array(z.object({
    collection: z.string(),
    documentId: z.string(),
    fieldKey: z.string(),
    value: z.any(),
  })).min(1),
  confirmation_agent_name: z.string().trim().min(1),
});

/** Strip internal / synthetic keys before copying a testing tool doc to production. */
function sanitizeToolDocForProduction(
  data: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(data)) {
    if (k.startsWith("_")) continue;
    if (k === "__exists") continue;
    out[k] = v;
  }
  return out;
}

function isSerializedTimestamp(value: unknown): value is {
  _seconds: number;
  _nanoseconds?: number;
} {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const typed = value as Record<string, unknown>;
  return typeof typed._seconds === "number";
}

/** Rebuild Firestore-native types from serialized payload values sent by the diff UI. */
function reviveFirestoreValue(value: unknown): unknown {
  if (isSerializedTimestamp(value)) {
    const nanos = typeof value._nanoseconds === "number" ? value._nanoseconds : 0;
    return new Timestamp(value._seconds, nanos);
  }
  if (Array.isArray(value)) {
    return value.map((item) => reviveFirestoreValue(item));
  }
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = reviveFirestoreValue(v);
    }
    return out;
  }
  return value;
}

export async function postPromoteToProduction(
  c: Context,
  authCtx: AgentsInfoAuthContext,
  agentId: string,
) {
  let raw: unknown;
  try {
    raw = await c.req.json();
  } catch {
    return c.json({ error: "JSON inválido" }, 400);
  }
  const parsed = promoteBodySchema.safeParse(raw);
  if (!parsed.success) {
    const msg = parsed.error.issues.map((i) => i.message).join("; ");
    return c.json({ error: msg }, 400);
  }

  try {
    const ok = await userCanAccessAgent(authCtx, agentId);
    if (!ok) {
      return c.json({ error: "No autorizado para este agente" }, 403);
    }
    const db = getFirestore();
    const agentRef = db.collection("agent_configurations").doc(agentId);
    const snap = await agentRef.get();
    if (!snap.exists) {
      return c.json(
        { error: "El agente no existe en producción" },
        404,
      );
    }
    const normalizedInput = parsed.data.confirmation_agent_name
      .trim()
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");
    if (normalizedInput !== "confirmar") {
      return c.json(
        {
          error:
            "Escribe CONFIRMAR (en mayúsculas o minúsculas) para confirmar la promoción a producción.",
          code: "INVALID_CONFIRMATION",
        },
        400,
      );
    }

    const collectionsWithServerDiff = new Set(["properties", "tools"]);
    const fieldsToValidate = parsed.data.fields.filter((f) =>
      collectionsWithServerDiff.has(f.collection),
    );

    if (fieldsToValidate.length > 0) {
      let currentDiff: Awaited<ReturnType<typeof computeAgentTestingDiff>>;
      try {
        currentDiff = await computeAgentTestingDiff(db, agentId);
      } catch (e) {
        if (e instanceof Error && e.message === "NO_TESTING_DATA") {
          return c.json(
            { error: "No hay datos de testing", code: "NO_TESTING_DATA" },
            404,
          );
        }
        throw e;
      }

      const diffByKey = new Map(
        currentDiff.map((d) => [testingDiffEntryKey(d), d] as const),
      );

      const invalid: string[] = [];
      for (const field of fieldsToValidate) {
        const key = testingDiffEntryKey(field);
        const entry = diffByKey.get(key);
        if (!entry) {
          invalid.push(key);
          continue;
        }
        const sentNorm = normalizeForDiff(field.value);
        if (JSON.stringify(sentNorm) !== JSON.stringify(entry.testingValue)) {
          invalid.push(`${key} (valor distinto al diff actual)`);
        }
      }

      if (invalid.length === fieldsToValidate.length) {
        return c.json(
          {
            error:
              "No hay diferencias vigentes para transferir o la selección ya no coincide con testing. Recarga el panel y vuelve a intentar.",
            code: "NO_DIFF_TO_TRANSFER",
          },
          409,
        );
      }

      if (invalid.length > 0) {
        return c.json(
          {
            error: `Algunos campos ya no coinciden con el diff actual de testing: ${invalid.slice(0, 5).join("; ")}.`,
            code: "STALE_PROMOTE_SELECTION",
          },
          409,
        );
      }
    }

    const testingToolsRef = agentRef.collection("testing").doc("data").collection("tools");

    const toolFields = parsed.data.fields.filter((f) => f.collection === "tools");
    for (const field of toolFields) {
      if (field.fieldKey !== "__exists") continue;
      const prodToolRef = agentRef.collection("tools").doc(field.documentId);
      if (field.value === true) {
        const testingSnap = await testingToolsRef.doc(field.documentId).get();
        if (!testingSnap.exists) {
          return c.json(
            {
              error: `Tool de testing no encontrada (id: ${field.documentId}).`,
            },
            404,
          );
        }
        const raw = testingSnap.data() as Record<string, unknown>;
        await prodToolRef.set(sanitizeToolDocForProduction(raw));
      } else {
        await prodToolRef.delete();
      }
    }

    for (const field of parsed.data.fields) {
      const fieldValue = reviveFirestoreValue(field.value);
      if (field.collection === "properties") {
        const prodDocRef = agentRef.collection("properties").doc(field.documentId);
        await prodDocRef.set({ [field.fieldKey]: fieldValue }, { merge: true });

        if (
          field.documentId === "prompt" &&
          field.fieldKey === "base" &&
          typeof fieldValue === "string"
        ) {
          await agentRef.update({
            "mcp_configuration.system_prompt": fieldValue,
          });
        }
      } else if (field.collection === "tools") {
        if (field.fieldKey === "__exists") continue;
        const prodToolRef = agentRef.collection("tools").doc(field.documentId);
        await prodToolRef.set({ [field.fieldKey]: fieldValue }, { merge: true });
      } else if (field.collection === "collaborators") {
        const prodGrowerRef = agentRef.collection("growers").doc(field.documentId);
        await prodGrowerRef.set({ [field.fieldKey]: fieldValue }, { merge: true });
      }
    }

    const collectionLabelEs: Record<string, string> = {
      properties: "propiedades",
      tools: "herramientas",
      collaborators: "colaboradores",
    };
    const actorEmail = authCtx.userEmail?.toLowerCase().trim() ?? null;
    const loggedCollections = new Set(["properties", "tools", "collaborators"]);
    for (const field of parsed.data.fields) {
      if (!loggedCollections.has(field.collection)) continue;
      const collectionEs =
        collectionLabelEs[field.collection] ?? field.collection;
      void appendImplementationActivityEntry(db, agentId, {
        kind: "system",
        actorEmail,
        action: "promoted_to_production",
        summary: `Subió a producción (${collectionEs}: ${field.documentId} -> ${field.fieldKey}).`,
        metadata: {
          collection: field.collection,
          documentId: field.documentId,
          fieldKey: field.fieldKey,
        },
      });
    }

    return c.json({ ok: true });
  } catch (error) {
    const r = handleError(c, error, "[agents promote-to-production]");
    return r ?? c.json({ error: "No se pudo promover a producción." }, 500);
  }
}

export async function getTestingDiff(
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
    try {
      const diff = await computeAgentTestingDiff(db, agentId);
      return c.json({ diff });
    } catch (e) {
      if (e instanceof Error && e.message === "NO_TESTING_DATA") {
        return c.json({ error: "No hay datos de testing" }, 404);
      }
      throw e;
    }
  } catch (error) {
    const r = handleError(c, error, "[agents testing diff]");
    return r ?? c.json({ error: "No se pudo obtener el diff." }, 500);
  }
}
