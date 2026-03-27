import { Hono } from "hono";

import {
  deleteDraftPropertyItem,
  getAgentDraft,
  postDraftSystemPromptRegenerate,
  getDraftPropertyItems,
  getDraftPendingTasks,
  getDraftTechnicalPropertiesBundle,
  getToolsCatalog,
  patchDraftPropertyItem,
  patchDraftPendingTask,
  patchDraftTechnicalPropertyDocument,
  patchAgentDraft,
  postDraftPropertyItem,
  postDraftPendingTask,
  postAgentDraft,
} from "@/controllers/agent-drafts.controller";
import { postAgentBuilderChat } from "@/controllers/agent-builder-chat.controller";
import { getAgentsInfo } from "@/controllers/agents.controller";
import {
  getAgentById,
  getAgentProperties,
  postAgentSystemPromptRegenerate,
  updateAgentPrompt,
  updateAgentPropertyDocument,
} from "@/controllers/agent-detail.controller";
import {
  createAgentTool,
  deleteAgentTool,
  getAgentTools,
  updateAgentTool,
} from "@/controllers/agent-tools.controller";
import {
  deleteAgentGrower,
  getAgentGrowers,
  postAgentGrower,
} from "@/controllers/agents-growers.controller";
import {
  createImplementationTask,
  getImplementationTasks,
  patchImplementationTask,
} from "@/controllers/agents-implementation-tasks.controller";
import {
  postPromoteToProduction,
  postSyncFromProduction,
} from "@/controllers/agent-sync.controller";
import { resolveAgentsAuthContext } from "@/routes/agents-auth";

const agentsRouter = new Hono();

/** Evita que `drafts`, `info`, etc. se interpreten como ID de agente. */
function isReservedAgentPathSegment(id: string): boolean {
  return id === "drafts" || id === "info" || id === "tools-catalog";
}

agentsRouter.get("/info", async (c) => {
  const ctx = await resolveAgentsAuthContext(c);
  if (!ctx.ok) return ctx.response;
  return await getAgentsInfo(c, ctx.authCtx);
});

agentsRouter.get("/tools-catalog", async (c) => {
  const ctx = await resolveAgentsAuthContext(c);
  if (!ctx.ok) return ctx.response;
  return getToolsCatalog(c, ctx.authCtx);
});

agentsRouter.post("/builder/chat", async (c) => {
  const ctx = await resolveAgentsAuthContext(c);
  if (!ctx.ok) return ctx.response;
  return postAgentBuilderChat(c, ctx.authCtx);
});

agentsRouter.post("/drafts", async (c) => {
  const ctx = await resolveAgentsAuthContext(c);
  if (!ctx.ok) return ctx.response;
  return postAgentDraft(c, ctx.authCtx);
});

agentsRouter.get("/drafts/:draftId", async (c) => {
  const ctx = await resolveAgentsAuthContext(c);
  if (!ctx.ok) return ctx.response;
  const draftId = c.req.param("draftId")?.trim() ?? "";
  if (!draftId) return c.json({ error: "Borrador no encontrado" }, 404);
  return getAgentDraft(c, ctx.authCtx, draftId);
});

agentsRouter.patch("/drafts/:draftId", async (c) => {
  const ctx = await resolveAgentsAuthContext(c);
  if (!ctx.ok) return ctx.response;
  const draftId = c.req.param("draftId")?.trim() ?? "";
  if (!draftId) return c.json({ error: "Borrador no encontrado" }, 404);
  return patchAgentDraft(c, ctx.authCtx, draftId);
});

agentsRouter.post(
  "/drafts/:draftId/system-prompt/regenerate",
  async (c) => {
    const ctx = await resolveAgentsAuthContext(c);
    if (!ctx.ok) return ctx.response;
    const draftId = c.req.param("draftId")?.trim() ?? "";
    if (!draftId) return c.json({ error: "Borrador no encontrado" }, 404);
    return postDraftSystemPromptRegenerate(c, ctx.authCtx, draftId);
  },
);

agentsRouter.get("/drafts/:draftId/technical-properties", async (c) => {
  const ctx = await resolveAgentsAuthContext(c);
  if (!ctx.ok) return ctx.response;
  const draftId = c.req.param("draftId")?.trim() ?? "";
  if (!draftId) return c.json({ error: "Borrador no encontrado" }, 404);
  return getDraftTechnicalPropertiesBundle(c, ctx.authCtx, draftId);
});

agentsRouter.patch("/drafts/:draftId/properties/:documentId", async (c) => {
  const ctx = await resolveAgentsAuthContext(c);
  if (!ctx.ok) return ctx.response;
  const draftId = c.req.param("draftId")?.trim() ?? "";
  const documentId = c.req.param("documentId")?.trim() ?? "";
  if (!draftId || !documentId) {
    return c.json({ error: "Borrador o documento no encontrado" }, 404);
  }
  return patchDraftTechnicalPropertyDocument(
    c,
    ctx.authCtx,
    draftId,
    documentId,
  );
});

agentsRouter.get("/drafts/:draftId/tasks", async (c) => {
  const ctx = await resolveAgentsAuthContext(c);
  if (!ctx.ok) return ctx.response;
  const draftId = c.req.param("draftId")?.trim() ?? "";
  if (!draftId) return c.json({ error: "Borrador no encontrado" }, 404);
  return getDraftPendingTasks(c, ctx.authCtx, draftId);
});

agentsRouter.post("/drafts/:draftId/tasks", async (c) => {
  const ctx = await resolveAgentsAuthContext(c);
  if (!ctx.ok) return ctx.response;
  const draftId = c.req.param("draftId")?.trim() ?? "";
  if (!draftId) return c.json({ error: "Borrador no encontrado" }, 404);
  return postDraftPendingTask(c, ctx.authCtx, draftId);
});

agentsRouter.patch("/drafts/:draftId/tasks/:taskId", async (c) => {
  const ctx = await resolveAgentsAuthContext(c);
  if (!ctx.ok) return ctx.response;
  const draftId = c.req.param("draftId")?.trim() ?? "";
  const taskId = c.req.param("taskId")?.trim() ?? "";
  if (!draftId || !taskId) return c.json({ error: "Tarea no encontrada" }, 404);
  return patchDraftPendingTask(c, ctx.authCtx, draftId, taskId);
});

agentsRouter.get("/drafts/:draftId/properties/:documentId/items", async (c) => {
  const ctx = await resolveAgentsAuthContext(c);
  if (!ctx.ok) return ctx.response;
  const draftId = c.req.param("draftId")?.trim() ?? "";
  const documentId = c.req.param("documentId")?.trim() ?? "";
  if (!draftId || !documentId) return c.json({ error: "Recurso no encontrado" }, 404);
  return getDraftPropertyItems(c, ctx.authCtx, draftId, documentId);
});

agentsRouter.post("/drafts/:draftId/properties/:documentId/items", async (c) => {
  const ctx = await resolveAgentsAuthContext(c);
  if (!ctx.ok) return ctx.response;
  const draftId = c.req.param("draftId")?.trim() ?? "";
  const documentId = c.req.param("documentId")?.trim() ?? "";
  if (!draftId || !documentId) return c.json({ error: "Recurso no encontrado" }, 404);
  return postDraftPropertyItem(c, ctx.authCtx, draftId, documentId);
});

agentsRouter.patch(
  "/drafts/:draftId/properties/:documentId/items/:itemId",
  async (c) => {
    const ctx = await resolveAgentsAuthContext(c);
    if (!ctx.ok) return ctx.response;
    const draftId = c.req.param("draftId")?.trim() ?? "";
    const documentId = c.req.param("documentId")?.trim() ?? "";
    const itemId = c.req.param("itemId")?.trim() ?? "";
    if (!draftId || !documentId || !itemId) {
      return c.json({ error: "Recurso no encontrado" }, 404);
    }
    return patchDraftPropertyItem(c, ctx.authCtx, draftId, documentId, itemId);
  },
);

agentsRouter.delete(
  "/drafts/:draftId/properties/:documentId/items/:itemId",
  async (c) => {
    const ctx = await resolveAgentsAuthContext(c);
    if (!ctx.ok) return ctx.response;
    const draftId = c.req.param("draftId")?.trim() ?? "";
    const documentId = c.req.param("documentId")?.trim() ?? "";
    const itemId = c.req.param("itemId")?.trim() ?? "";
    if (!draftId || !documentId || !itemId) {
      return c.json({ error: "Recurso no encontrado" }, 404);
    }
    return deleteDraftPropertyItem(c, ctx.authCtx, draftId, documentId, itemId);
  },
);

agentsRouter.get("/:agentId/properties", async (c) => {
  const ctx = await resolveAgentsAuthContext(c);
  if (!ctx.ok) return ctx.response;
  const agentId = c.req.param("agentId")?.trim() ?? "";
  if (!agentId || isReservedAgentPathSegment(agentId)) {
    return c.json({ error: "Agente no encontrado" }, 404);
  }
  return getAgentProperties(c, ctx.authCtx, agentId);
});

agentsRouter.patch("/:agentId/properties/:documentId", async (c) => {
  const ctx = await resolveAgentsAuthContext(c);
  if (!ctx.ok) return ctx.response;
  const agentId = c.req.param("agentId")?.trim() ?? "";
  const documentId = c.req.param("documentId")?.trim() ?? "";
  if (!agentId || !documentId || isReservedAgentPathSegment(agentId)) {
    return c.json({ error: "Agente o documento no encontrado" }, 404);
  }
  return updateAgentPropertyDocument(c, ctx.authCtx, agentId, documentId);
});

agentsRouter.get("/:agentId/tools", async (c) => {
  const ctx = await resolveAgentsAuthContext(c);
  if (!ctx.ok) return ctx.response;
  const agentId = c.req.param("agentId")?.trim() ?? "";
  if (!agentId || isReservedAgentPathSegment(agentId)) {
    return c.json({ error: "Agente no encontrado" }, 404);
  }
  return getAgentTools(c, ctx.authCtx, agentId);
});

agentsRouter.post("/:agentId/tools", async (c) => {
  const ctx = await resolveAgentsAuthContext(c);
  if (!ctx.ok) return ctx.response;
  const agentId = c.req.param("agentId")?.trim() ?? "";
  if (!agentId || isReservedAgentPathSegment(agentId)) {
    return c.json({ error: "Agente no encontrado" }, 404);
  }
  return createAgentTool(c, ctx.authCtx, agentId);
});

agentsRouter.patch("/:agentId/tools/:toolId", async (c) => {
  const ctx = await resolveAgentsAuthContext(c);
  if (!ctx.ok) return ctx.response;
  const agentId = c.req.param("agentId")?.trim() ?? "";
  const toolId = c.req.param("toolId")?.trim() ?? "";
  if (!agentId || !toolId || isReservedAgentPathSegment(agentId)) {
    return c.json({ error: "Agente o tool no encontrado" }, 404);
  }
  return updateAgentTool(c, ctx.authCtx, agentId, toolId);
});

agentsRouter.delete("/:agentId/tools/:toolId", async (c) => {
  const ctx = await resolveAgentsAuthContext(c);
  if (!ctx.ok) return ctx.response;
  const agentId = c.req.param("agentId")?.trim() ?? "";
  const toolId = c.req.param("toolId")?.trim() ?? "";
  if (!agentId || !toolId || isReservedAgentPathSegment(agentId)) {
    return c.json({ error: "Agente o tool no encontrado" }, 404);
  }
  return deleteAgentTool(c, ctx.authCtx, agentId, toolId);
});

agentsRouter.patch("/:agentId/prompt", async (c) => {
  const ctx = await resolveAgentsAuthContext(c);
  if (!ctx.ok) return ctx.response;
  const agentId = c.req.param("agentId")?.trim() ?? "";
  if (!agentId || isReservedAgentPathSegment(agentId)) {
    return c.json({ error: "Agente no encontrado" }, 404);
  }
  return updateAgentPrompt(c, ctx.authCtx, agentId);
});

agentsRouter.post("/:agentId/system-prompt/regenerate", async (c) => {
  const ctx = await resolveAgentsAuthContext(c);
  if (!ctx.ok) return ctx.response;
  const agentId = c.req.param("agentId")?.trim() ?? "";
  if (!agentId || isReservedAgentPathSegment(agentId)) {
    return c.json({ error: "Agente no encontrado" }, 404);
  }
  return postAgentSystemPromptRegenerate(c, ctx.authCtx, agentId);
});

agentsRouter.post("/:agentId/sync-from-production", async (c) => {
  const ctx = await resolveAgentsAuthContext(c);
  if (!ctx.ok) return ctx.response;
  const agentId = c.req.param("agentId")?.trim() ?? "";
  if (!agentId || isReservedAgentPathSegment(agentId)) {
    return c.json({ error: "Agente no encontrado" }, 404);
  }
  return postSyncFromProduction(c, ctx.authCtx, agentId);
});

agentsRouter.post("/:agentId/promote-to-production", async (c) => {
  const ctx = await resolveAgentsAuthContext(c);
  if (!ctx.ok) return ctx.response;
  const agentId = c.req.param("agentId")?.trim() ?? "";
  if (!agentId || isReservedAgentPathSegment(agentId)) {
    return c.json({ error: "Agente no encontrado" }, 404);
  }
  return postPromoteToProduction(c, ctx.authCtx, agentId);
});

agentsRouter.get("/:agentId", async (c) => {
  const ctx = await resolveAgentsAuthContext(c);
  if (!ctx.ok) return ctx.response;
  const agentId = c.req.param("agentId")?.trim() ?? "";
  if (!agentId || isReservedAgentPathSegment(agentId)) {
    return c.json({ error: "Agente no encontrado" }, 404);
  }
  return getAgentById(c, ctx.authCtx, agentId);
});

agentsRouter.get("/:agentId/growers", async (c) => {
  const ctx = await resolveAgentsAuthContext(c);
  if (!ctx.ok) return ctx.response;
  const agentId = c.req.param("agentId")?.trim();
  if (!agentId || isReservedAgentPathSegment(agentId)) {
    return c.json({ error: "Agente no encontrado" }, 404);
  }
  return getAgentGrowers(c, ctx.authCtx, agentId);
});

agentsRouter.post("/:agentId/growers", async (c) => {
  const ctx = await resolveAgentsAuthContext(c);
  if (!ctx.ok) return ctx.response;
  const agentId = c.req.param("agentId")?.trim();
  if (!agentId || isReservedAgentPathSegment(agentId)) {
    return c.json({ error: "Agente no encontrado" }, 404);
  }
  return postAgentGrower(c, ctx.authCtx, agentId);
});

agentsRouter.delete("/:agentId/growers/:growerEmail", async (c) => {
  const ctx = await resolveAgentsAuthContext(c);
  if (!ctx.ok) return ctx.response;
  const agentId = c.req.param("agentId")?.trim();
  const growerEmail = c.req.param("growerEmail");
  if (
    !agentId ||
    growerEmail == null ||
    growerEmail === "" ||
    isReservedAgentPathSegment(agentId)
  ) {
    return c.json({ error: "Agente o grower no encontrado" }, 404);
  }
  return deleteAgentGrower(c, ctx.authCtx, agentId, growerEmail);
});

agentsRouter.get("/:agentId/implementation-tasks", async (c) => {
  const ctx = await resolveAgentsAuthContext(c);
  if (!ctx.ok) return ctx.response;
  const agentId = c.req.param("agentId")?.trim() ?? "";
  if (!agentId || isReservedAgentPathSegment(agentId)) {
    return c.json({ error: "Agente no encontrado" }, 404);
  }
  return getImplementationTasks(c, ctx.authCtx, agentId);
});

agentsRouter.post("/:agentId/implementation-tasks", async (c) => {
  const ctx = await resolveAgentsAuthContext(c);
  if (!ctx.ok) return ctx.response;
  const agentId = c.req.param("agentId")?.trim() ?? "";
  if (!agentId || isReservedAgentPathSegment(agentId)) {
    return c.json({ error: "Agente no encontrado" }, 404);
  }
  return createImplementationTask(c, ctx.authCtx, agentId);
});

agentsRouter.patch("/:agentId/implementation-tasks/:taskId", async (c) => {
  const ctx = await resolveAgentsAuthContext(c);
  if (!ctx.ok) return ctx.response;
  const agentId = c.req.param("agentId")?.trim() ?? "";
  const taskId = c.req.param("taskId")?.trim() ?? "";
  if (!agentId || !taskId || isReservedAgentPathSegment(agentId)) {
    return c.json({ error: "Agente o tarea no encontrado" }, 404);
  }
  return patchImplementationTask(c, ctx.authCtx, agentId, taskId);
});

export default agentsRouter;
