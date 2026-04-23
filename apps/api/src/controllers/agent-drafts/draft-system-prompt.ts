import type { Context } from "hono";

import logger, { formatError } from "@/lib/logger";
import {
  runSystemPromptGenerationJob,
  setSystemPromptGeneratingFlags,
} from "@/services/system-prompt-generation-job";
import type { AgentsInfoAuthContext } from "@/types/agents";

import { handleFirestoreError } from "@/utils/agent-drafts/access";
import { getAuthorizedDraftRef } from "@/utils/agent-drafts/authorized-draft";

/**
 * Reintenta la generación multi-fase del system prompt (draft + agent con mismo id).
 */
export async function postDraftSystemPromptRegenerate(
  c: Context,
  authCtx: AgentsInfoAuthContext,
  draftId: string,
) {
  try {
    const auth = await getAuthorizedDraftRef(authCtx, draftId);
    if (!auth.ok) {
      return c.json(
        {
          error: auth.code === 404 ? "Borrador no encontrado" : "No autorizado",
        },
        auth.code,
      );
    }
    const snap = await auth.draftRef.get();
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
    await setSystemPromptGeneratingFlags(draftId);
    void runSystemPromptGenerationJob(draftId).catch((e) => {
      logger.error(
        "[agents/drafts] system prompt regenerate job",
        formatError(e),
      );
    });
    return c.json({ ok: true });
  } catch (error) {
    const r = handleFirestoreError(
      c,
      error,
      "[agents/drafts system-prompt POST]",
    );
    return r ?? c.json({ error: "No se pudo reintentar la generación." }, 500);
  }
}
