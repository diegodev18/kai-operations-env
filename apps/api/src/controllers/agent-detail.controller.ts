import type { Context } from "hono";
import type { QueryDocumentSnapshot } from "firebase-admin/firestore";

import { ApiErrors } from "@/lib/api-error";
import {
  PROPERTY_DEFAULTS,
  PROPERTY_DOC_IDS,
  type PropertyDocId,
} from "@/constants/agentPropertyDefaults";
import { getFirestore } from "@/lib/firestore";
import logger, { formatError } from "@/lib/logger";
import {
  runSystemPromptGenerationJob,
  setSystemPromptGeneratingFlags,
} from "@/services/system-prompt-generation-job";
import type { AgentsInfoAuthContext } from "@/types/agents";
import {
  getAgentDeploymentFlags,
  parseAgentDoc,
  resolveAgentWriteDatabase,
  userCanAccessAgent,
  userCanEditAgent,
} from "@/utils/agents";
import {
  extractFirestoreIndexUrl,
  firestoreFailureHint,
  isFirebaseConfigError,
} from "@/utils/firestore/errors";
import { isOperationsAdmin, isOperationsCommercial } from "@/utils/operations-access";

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
  return ApiErrors.internal(c, "Error al acceder a Firestore.");
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
    const ok = await userCanAccessAgent(authCtx, agentId);
    if (!ok) {
      return ApiErrors.forbidden(c, "No autorizado para este agente");
    }
    return null;
  } catch (error) {
    const r = handleFirestoreError(c, error, "[agent access]");
    return r ?? ApiErrors.internal(c, "Error de acceso");
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
    const flags = await getAgentDeploymentFlags(agentId);
    if (!flags.hasTestingData && !flags.inProduction) {
      return ApiErrors.notFound(c, "Agente no encontrado");
    }
    const db = getFirestore();
    const docRef = db.collection("agent_configurations").doc(agentId);
    const [snapshot, agentPropSnap] = await Promise.all([
      docRef.get(),
      docRef.collection("properties").doc("agent").get(),
    ]);
    if (!snapshot.exists) {
      return ApiErrors.notFound(c, "Agente no encontrado");
    }
    const agent = parseAgentDoc(snapshot as QueryDocumentSnapshot, true);
    if (!agent) {
      return ApiErrors.internal(c, "No se pudo leer el agente");
    }
    const agentData = agentPropSnap.exists ? agentPropSnap.data() : undefined;
    const enabled = (agentData?.enabled as boolean | undefined) !== false;
    return c.json({
      ...agent,
      enabled,
      in_commercial: flags.hasTestingData,
      in_production: flags.inProduction,
      primary_source: flags.hasTestingData ? "commercial" : "production",
    });
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
    const { db: database, hasTestingData, inProduction } =
      await resolveAgentWriteDatabase(agentId);
    if (!hasTestingData && !inProduction) {
      return ApiErrors.notFound(c, "Agente no encontrado");
    }
    const agentRef = database.collection("agent_configurations").doc(agentId);
    const agentSnap = await agentRef.get();

    const propertiesRef = hasTestingData
      ? agentRef.collection("testing").doc("data").collection("properties")
      : agentRef.collection("properties");
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

    return c.json({
      ...result,
      in_commercial: hasTestingData,
      in_production: inProduction,
      primary_source: hasTestingData ? "commercial" : "production",
    });
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

  const canEdit = await userCanEditAgent(authCtx, agentId);
  if (!canEdit) {
    return c.json(
      { error: "No tienes permisos para editar este agente" },
      403,
    );
  }

  const isKnownDoc = PROPERTY_DOC_IDS.includes(documentId as PropertyDocId);
  const isValidDynamicDoc = /^[a-zA-Z0-9_-]{1,64}$/.test(documentId);
  if (!isKnownDoc && !isValidDynamicDoc) {
    return ApiErrors.validation(c, "documentId inválido");
  }

  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return ApiErrors.validation(c, "JSON inválido");
  }

  if (body == null || typeof body !== "object" || Array.isArray(body)) {
    return ApiErrors.validation(c, "El cuerpo debe ser un objeto");
  }

  const bodyObj = body as Record<string, unknown>;
  if (
    documentId === "agent" &&
    bodyObj.enabled === false &&
    !isOperationsAdmin(authCtx.userRole)
  ) {
    return ApiErrors.forbidden(c, "Solo un administrador puede apagar el agente");
  }

  try {
    const { db: database, hasTestingData, inProduction } =
      await resolveAgentWriteDatabase(agentId);
    if (!hasTestingData && !inProduction) {
      return ApiErrors.notFound(c, "Agente no encontrado");
    }
    const agentRef = database.collection("agent_configurations").doc(agentId);

    const docRef = hasTestingData
      ? agentRef.collection("testing").doc("data").collection("properties").doc(documentId)
      : agentRef.collection("properties").doc(documentId);
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

/**
 * Reintenta generación multi-fase de `mcp_configuration.system_prompt` para un agente publicado.
 */
export async function postAgentSystemPromptRegenerate(
  c: Context,
  authCtx: AgentsInfoAuthContext,
  agentId: string,
) {
  const denied = await requireAgentAccess(c, authCtx, agentId);
  if (denied) return denied;

  try {
    const db = getFirestore();
    const ref = db.collection("agent_configurations").doc(agentId);
    const snap = await ref.get();
    if (!snap.exists) {
      return c.json(
        {
          error:
            "El agente no existe. Sincroniza desde producción primero.",
        },
        404,
      );
    }
    const data = snap.data() ?? {};
    const mcp = data.mcp_configuration as Record<string, unknown> | undefined;
    const st =
      typeof mcp?.system_prompt_generation_status === "string"
        ? mcp.system_prompt_generation_status
        : "";
    if (st === "generating") {
      return c.json(
        { error: "La generación del system prompt ya está en curso." },
        409,
      );
    }
    await setSystemPromptGeneratingFlags(agentId);
    void runSystemPromptGenerationJob(agentId).catch((e) => {
      logger.error(
        "[agents/:id/system-prompt/regenerate] job",
        formatError(e),
      );
    });
    return c.json({ ok: true });
  } catch (error) {
    const r = handleFirestoreError(c, error, "[agents/:id system-prompt POST]");
    return r ?? c.json({ error: "No se pudo reintentar la generación." }, 500);
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
    return ApiErrors.validation(c, "JSON inválido");
  }

  const prompt =
    body != null && typeof (body as { prompt?: unknown }).prompt === "string"
      ? (body as { prompt: string }).prompt
      : null;

  if (prompt == null) {
    return ApiErrors.validation(c, "prompt es obligatorio (string)");
  }

  try {
    const { db: database, hasTestingData, inProduction } =
      await resolveAgentWriteDatabase(agentId);
    if (!hasTestingData && !inProduction) {
      return ApiErrors.notFound(c, "Agente no encontrado");
    }
    const docRef = database.collection("agent_configurations").doc(agentId);

    await Promise.all([
      docRef.update({
        "mcp_configuration.system_prompt": prompt,
      }),
      docRef.collection("properties").doc("prompt").set(
        {
          base: prompt,
        },
        { merge: true },
      ),
    ]);

    return c.json({ prompt, success: true });
  } catch (error) {
    const r = handleFirestoreError(c, error, "[agents/:id/prompt PATCH]");
    return r ?? c.json({ error: "Error al actualizar prompt" }, 500);
  }
}

/**
 * Actualiza campos del documento raíz del agente (agent_configurations/{agentId}).
 * Solo permite campos seguros: version.
 */
export async function getProductionPrompt(
  c: Context,
  authCtx: AgentsInfoAuthContext,
  agentId: string,
) {
  const denied = await requireAgentAccess(c, authCtx, agentId);
  if (denied) return denied;

  try {
    const prod = getFirestore();
    const docRef = prod.collection("agent_configurations").doc(agentId);
    const [agentSnap, promptSnap] = await Promise.all([
      docRef.get(),
      docRef.collection("properties").doc("prompt").get(),
    ]);

    if (!agentSnap.exists) {
      return ApiErrors.notFound(c, "El agente no existe en producción");
    }

    const agentData = agentSnap.data() ?? {};
    const mcp = agentData.mcp_configuration as Record<string, unknown> | undefined;
    const systemPrompt = typeof mcp?.system_prompt === "string" ? mcp.system_prompt : "";

    const promptData = promptSnap.exists ? promptSnap.data() : undefined;
    const basePrompt = typeof promptData?.base === "string" ? promptData.base : "";

    const authData = promptData?.auth as Record<string, unknown> | undefined;
    const authPrompt = authData?.auth as string | undefined;
    const unauthPrompt = authData?.unauth as string | undefined;

    const result: { prompt: string; auth?: { auth: string; unauth: string } } = {
      prompt: basePrompt || systemPrompt,
    };
    if (authPrompt !== undefined || unauthPrompt !== undefined) {
      result.auth = {
        auth: typeof authPrompt === "string" ? authPrompt : "",
        unauth: typeof unauthPrompt === "string" ? unauthPrompt : "",
      };
    }

    return c.json(result);
  } catch (error) {
    const r = handleFirestoreError(c, error, "[agents/:id/production-prompt GET]");
    return r ?? c.json({ error: "Error al leer prompt de producción" }, 500);
  }
}

export async function promotePromptToProduction(
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
    return ApiErrors.validation(c, "JSON inválido");
  }

  const prompt =
    body != null && typeof (body as { prompt?: unknown }).prompt === "string"
      ? (body as { prompt: string }).prompt
      : null;

  if (prompt == null) {
    return ApiErrors.validation(c, "prompt es obligatorio (string)");
  }

  const authData = (body as { auth?: unknown }).auth;
  const hasAuth =
    authData != null &&
    typeof authData === "object" &&
    !Array.isArray(authData) &&
    typeof (authData as { auth?: unknown }).auth === "string" &&
    typeof (authData as { unauth?: unknown }).unauth === "string";

  try {
    const prod = getFirestore();
    const docRef = prod.collection("agent_configurations").doc(agentId);
    const snap = await docRef.get();

    if (!snap.exists) {
      return ApiErrors.notFound(c, "El agente no existe en producción");
    }

    const promptPropRef = docRef.collection("properties").doc("prompt");
    const promptPropData: Record<string, any> = {
      base: prompt,
    };

    if (hasAuth) {
      promptPropData.auth = {
        auth: (authData as { auth: string }).auth,
        unauth: (authData as { unauth: string }).unauth,
      };
    }

    await Promise.all([
      promptPropRef.set(promptPropData, { merge: true }),
      docRef.update({
        "mcp_configuration.system_prompt": prompt,
      }),
    ]);

    return c.json({ ok: true });
  } catch (error) {
    const r = handleFirestoreError(c, error, "[agents/:id/promote-prompt POST]");
    return r ?? c.json({ error: "Error al subir prompt a producción" }, 500);
  }
}

export async function patchAgent(
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
    return ApiErrors.validation(c, "JSON inválido");
  }

  if (body == null || typeof body !== "object" || Array.isArray(body)) {
    return ApiErrors.validation(c, "El cuerpo debe ser un objeto");
  }

  const bodyObj = body as Record<string, unknown>;
  const allowedFields = ["version"] as const;
  const updateData: Record<string, unknown> = {};
  for (const field of allowedFields) {
    if (field in bodyObj) {
      updateData[field] = bodyObj[field];
    }
  }

  if (Object.keys(updateData).length === 0) {
    return ApiErrors.validation(c, "No hay campos válidos para actualizar");
  }

  try {
    const { db: database, hasTestingData, inProduction } =
      await resolveAgentWriteDatabase(agentId);
    if (!hasTestingData && !inProduction) {
      return ApiErrors.notFound(c, "Agente no encontrado");
    }
    const docRef = database.collection("agent_configurations").doc(agentId);
    await docRef.update(updateData);

    if ("version" in updateData) {
      const integrationsSnap = await database
        .collection("whatsapp_integrations")
        .where("agentDocId", "==", agentId)
        .get();
      for (const integrationDoc of integrationsSnap.docs) {
        await integrationDoc.ref.update({ version: updateData.version });
      }
    }

    return c.json({ success: true, updated: updateData });
  } catch (error) {
    const r = handleFirestoreError(c, error, "[agents/:id PATCH]");
    return r ?? c.json({ error: "Error al actualizar agente" }, 500);
  }
}
