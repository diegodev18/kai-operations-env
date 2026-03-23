import type { Context } from "hono";
import type { QueryDocumentSnapshot } from "firebase-admin/firestore";

import {
  PROPERTY_DEFAULTS,
  PROPERTY_DOC_IDS,
  type PropertyDocId,
} from "@/constants/agentPropertyDefaults";
import { getFirestore } from "@/lib/firestore";
import type { AgentsInfoAuthContext } from "@/types/agents";
import {
  parseAgentDoc,
  userCanAccessAgent,
} from "@/utils/agents";
import {
  extractFirestoreIndexUrl,
  firestoreFailureHint,
  isFirebaseConfigError,
} from "@/utils/firestore/errors";
import { isOperationsAdmin } from "@/utils/operations-access";

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

async function requireAgentAccess(
  c: Context,
  authCtx: AgentsInfoAuthContext,
  agentId: string,
): Promise<Response | null> {
  try {
    const database = getFirestore();
    const ok = await userCanAccessAgent(database, authCtx, agentId);
    if (!ok) {
      return c.json({ error: "No autorizado para este agente" }, 403);
    }
    return null;
  } catch (error) {
    const r = handleFirestoreError(c, error, "[agent access]");
    return r ?? c.json({ error: "Error de acceso" }, 500);
  }
}

export async function getAgentById(
  c: Context,
  authCtx: AgentsInfoAuthContext,
  agentId: string,
) {
  const denied = await requireAgentAccess(c, authCtx, agentId);
  if (denied) return denied;

  try {
    const database = getFirestore();
    const docRef = database.collection("agent_configurations").doc(agentId);
    const snapshot = await docRef.get();
    if (!snapshot.exists) {
      return c.json({ error: "Agente no encontrado" }, 404);
    }
    const agent = parseAgentDoc(snapshot as QueryDocumentSnapshot, true);
    if (!agent) {
      return c.json({ error: "No se pudo leer el agente" }, 500);
    }
    return c.json(agent);
  } catch (error) {
    const r = handleFirestoreError(c, error, "[agents/:id GET]");
    return r ?? c.json({ error: "Error al leer agente" }, 500);
  }
}

export async function getAgentProperties(
  c: Context,
  authCtx: AgentsInfoAuthContext,
  agentId: string,
) {
  const denied = await requireAgentAccess(c, authCtx, agentId);
  if (denied) return denied;

  try {
    const database = getFirestore();
    const agentRef = database.collection("agent_configurations").doc(agentId);
    const agentSnap = await agentRef.get();
    if (!agentSnap.exists) {
      return c.json({ error: "Agente no encontrado" }, 404);
    }

    const propertiesRef = agentRef.collection("properties");
    const result: Record<string, unknown> = {};

    for (const docId of PROPERTY_DOC_IDS) {
      const snap = await propertiesRef.doc(docId).get();
      const data = snap.exists ? snap.data() : undefined;
      result[docId] = mergeWithDefaults(
        docId,
        data as Record<string, unknown> | undefined,
      );
    }

    const promptMerged = result.prompt as Record<string, unknown>;
    const aiMerged = result.ai as Record<string, unknown> | undefined;
    const hasModelInAi =
      aiMerged &&
      typeof aiMerged.model === "string" &&
      aiMerged.model.trim() !== "";
    const hasTempInAi =
      aiMerged?.temperature !== undefined &&
      aiMerged.temperature !== null &&
      Number.isFinite(Number(aiMerged.temperature));
    if (aiMerged && hasModelInAi) promptMerged.model = aiMerged.model as string;
    if (aiMerged && hasTempInAi) {
      promptMerged.temperature = Number(aiMerged.temperature);
    }
    if (!hasModelInAi || !hasTempInAi) {
      const agentData = agentSnap.data() as Record<string, unknown> | undefined;
      const ai = agentData?.ai as Record<string, unknown> | undefined;
      if (!hasModelInAi && ai?.model != null && typeof ai.model === "string") {
        promptMerged.model = ai.model;
      }
      if (
        !hasTempInAi &&
        ai?.temperature !== undefined &&
        ai?.temperature !== null &&
        Number.isFinite(Number(ai.temperature))
      ) {
        promptMerged.temperature = Number(ai.temperature);
      }
    }

    const agentResult = result.agent as Record<string, unknown> | undefined;
    if (agentResult && typeof agentResult === "object") {
      const inject =
        agentResult.injectCommandsInPrompt === true ||
        agentResult.isCommandsEnable === true;
      agentResult.injectCommandsInPrompt = inject;
      delete agentResult.isCommandsEnable;
    }

    return c.json(result);
  } catch (error) {
    const r = handleFirestoreError(c, error, "[agents/:id/properties GET]");
    return r ?? c.json({ error: "Error al leer propiedades" }, 500);
  }
}

export async function updateAgentPropertyDocument(
  c: Context,
  authCtx: AgentsInfoAuthContext,
  agentId: string,
  documentId: string,
) {
  const denied = await requireAgentAccess(c, authCtx, agentId);
  if (denied) return denied;

  if (
    !PROPERTY_DOC_IDS.includes(documentId as PropertyDocId)
  ) {
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

  const bodyObj = body as Record<string, unknown>;
  if (
    documentId === "agent" &&
    bodyObj.enabled === false &&
    !isOperationsAdmin(authCtx.userRole)
  ) {
    return c.json(
      { error: "Solo un administrador puede apagar el agente" },
      403,
    );
  }

  try {
    const database = getFirestore();
    const agentRef = database.collection("agent_configurations").doc(agentId);
    const agentSnap = await agentRef.get();
    if (!agentSnap.exists) {
      return c.json({ error: "Agente no encontrado" }, 404);
    }

    const docRef = agentRef.collection("properties").doc(documentId);
    await docRef.set(body as Record<string, unknown>, { merge: true });

    if (documentId === "ai") {
      const aiBody = body as Record<string, unknown>;
      const model =
        typeof aiBody.model === "string" && aiBody.model.trim() !== ""
          ? aiBody.model
          : null;
      const temperature =
        aiBody.temperature !== undefined &&
        aiBody.temperature !== null &&
        Number.isFinite(Number(aiBody.temperature))
          ? Number(aiBody.temperature)
          : null;
      const updateData: Record<string, unknown> = {};
      if (model !== null) updateData["ai.model"] = model;
      if (temperature !== null) updateData["ai.temperature"] = temperature;
      if (Object.keys(updateData).length > 0) {
        await agentRef.update(updateData);
      }
    }

    return c.json({ documentId, success: true });
  } catch (error) {
    const r = handleFirestoreError(c, error, "[agents/:id/properties PATCH]");
    return r ?? c.json({ error: "Error al guardar propiedades" }, 500);
  }
}

export async function updateAgentPrompt(
  c: Context,
  authCtx: AgentsInfoAuthContext,
  agentId: string,
) {
  const denied = await requireAgentAccess(c, authCtx, agentId);
  if (denied) return denied;

  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "JSON inválido" }, 400);
  }

  const prompt =
    body != null && typeof (body as { prompt?: unknown }).prompt === "string"
      ? (body as { prompt: string }).prompt
      : null;

  if (prompt == null) {
    return c.json({ error: "prompt es obligatorio (string)" }, 400);
  }

  try {
    const database = getFirestore();
    const docRef = database.collection("agent_configurations").doc(agentId);
    const snapshot = await docRef.get();
    if (!snapshot.exists) {
      return c.json({ error: "Agente no encontrado" }, 404);
    }

    await docRef.update({
      "mcp_configuration.system_prompt": prompt,
    });

    return c.json({ prompt, success: true });
  } catch (error) {
    const r = handleFirestoreError(c, error, "[agents/:id/prompt PATCH]");
    return r ?? c.json({ error: "Error al actualizar prompt" }, 500);
  }
}
