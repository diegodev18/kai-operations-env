import type { Context } from "hono";

import { ApiErrors } from "@/lib/api-error";
import { getFirestore } from "@/lib/firestore";
import logger, { formatError } from "@/lib/logger";
import {
  runSystemPromptGenerationJob,
  setSystemPromptGeneratingFlags,
} from "@/services/system-prompt-generation-job";
import { appendImplementationActivityEntry } from "@/services/implementation-activity.service";
import type { AgentsInfoAuthContext } from "@/types/agents-types";
import { resolveAgentWriteDatabase } from "@/utils/agents";
import { handleFirestoreError, requireAgentAccess } from "@/utils/agent-detail/access";

function normalizeConfirmInput(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

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

    const actorEmail = authCtx.userEmail?.toLowerCase().trim() ?? null;
    void appendImplementationActivityEntry(database, agentId, {
      kind: "system",
      actorEmail,
      action: "prompt_updated",
      summary: "Actualizó el system prompt.",
    });

    return c.json({ prompt, success: true });
  } catch (error) {
    const r = handleFirestoreError(c, error, "[agents/:id/prompt PATCH]");
    return r ?? c.json({ error: "Error al actualizar prompt" }, 500);
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
  const confirmationInput =
    body != null &&
    typeof (body as { confirmation_agent_name?: unknown }).confirmation_agent_name ===
      "string"
      ? (body as { confirmation_agent_name: string }).confirmation_agent_name
      : null;
  const expectedTestingPrompt =
    body != null &&
    typeof (body as { expected_testing_prompt?: unknown }).expected_testing_prompt ===
      "string"
      ? (body as { expected_testing_prompt: string }).expected_testing_prompt
      : null;
  const hasAuth =
    authData != null &&
    typeof authData === "object" &&
    !Array.isArray(authData) &&
    typeof (authData as { auth?: unknown }).auth === "string" &&
    typeof (authData as { unauth?: unknown }).unauth === "string";

  try {
    if (confirmationInput == null || normalizeConfirmInput(confirmationInput) !== "confirmar") {
      return c.json(
        {
          code: "INVALID_CONFIRMATION",
          error: "Debes escribir CONFIRMAR para continuar.",
        },
        400,
      );
    }

    const prod = getFirestore();
    const docRef = prod.collection("agent_configurations").doc(agentId);
    const [snap, promptPropSnap, testingPromptSnap] = await Promise.all([
      docRef.get(),
      docRef.collection("properties").doc("prompt").get(),
      docRef.collection("testing").doc("data").collection("properties").doc("prompt").get(),
    ]);

    if (!snap.exists) {
      return ApiErrors.notFound(c, "El agente no existe en producción");
    }

    const agentData = snap.data() ?? {};
    const mcp = agentData.mcp_configuration as Record<string, unknown> | undefined;
    const systemPrompt = typeof mcp?.system_prompt === "string" ? mcp.system_prompt : "";
    const productionPromptData = promptPropSnap.exists ? promptPropSnap.data() : undefined;
    const productionBase =
      typeof productionPromptData?.base === "string" && productionPromptData.base.trim().length > 0
        ? productionPromptData.base
        : systemPrompt;

    const testingPromptData = testingPromptSnap.exists ? testingPromptSnap.data() : undefined;
    const testingBase =
      typeof testingPromptData?.base === "string"
        ? testingPromptData.base
        : "";

    if (expectedTestingPrompt != null && expectedTestingPrompt !== testingBase) {
      return c.json(
        {
          code: "TESTING_SNAPSHOT_MISMATCH",
          error:
            "El prompt de testing cambió antes de promover. Recarga y vuelve a intentar.",
        },
        409,
      );
    }

    const authFromProdRaw = productionPromptData?.auth as Record<string, unknown> | undefined;
    const productionAuthAuth =
      typeof authFromProdRaw?.auth === "string" ? authFromProdRaw.auth : "";
    const productionAuthUnauth =
      typeof authFromProdRaw?.unauth === "string" ? authFromProdRaw.unauth : "";
    const incomingAuthAuth =
      hasAuth ? (authData as { auth: string }).auth : productionAuthAuth;
    const incomingAuthUnauth =
      hasAuth ? (authData as { unauth: string }).unauth : productionAuthUnauth;

    const baseDiffers = productionBase !== prompt;
    const authDiffers =
      incomingAuthAuth !== productionAuthAuth ||
      incomingAuthUnauth !== productionAuthUnauth;
    if (!baseDiffers && !authDiffers) {
      return c.json(
        {
          code: "NO_DIFF_TO_TRANSFER",
          error: "No hay diferencias entre testing y producción para promover.",
        },
        409,
      );
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

    const actorEmail = authCtx.userEmail?.toLowerCase().trim() ?? null;
    void appendImplementationActivityEntry(prod, agentId, {
      kind: "system",
      actorEmail,
      action: "prompt_promoted_to_production",
      summary: "Promovió el system prompt a producción.",
      ...(hasAuth ? { metadata: { includesAuthVariants: true } } : {}),
    });

    return c.json({ ok: true });
  } catch (error) {
    const r = handleFirestoreError(c, error, "[agents/:id/promote-prompt POST]");
    return r ?? c.json({ error: "Error al subir prompt a producción" }, 500);
  }
}
