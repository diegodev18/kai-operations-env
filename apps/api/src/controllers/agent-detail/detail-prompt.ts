import type { Context } from "hono";

import { ApiErrors } from "@/lib/api-error";
import { getFirestore } from "@/lib/firestore";
import logger, { formatError } from "@/lib/logger";
import {
  runSystemPromptGenerationJob,
  setSystemPromptGeneratingFlags,
} from "@/services/system-prompt-generation-job";
import { appendImplementationActivityEntry } from "@/services/implementation-activity.service";
import type { AgentsInfoAuthContext } from "@/types/agents";
import { resolveAgentWriteDatabase } from "@/utils/agents";
import { handleFirestoreError, requireAgentAccess } from "@/utils/agent-detail/access";

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
