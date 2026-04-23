import type { Hono } from "hono";

import {
  deleteDraftPropertyItem,
  getAgentDraft,
  postDraftSystemPromptRegenerate,
  getDraftPropertyItems,
  getDraftPendingTasks,
  getDraftTechnicalPropertiesBundle,
  patchDraftPropertyItem,
  patchDraftPendingTask,
  patchDraftTechnicalPropertyDocument,
  patchAgentDraft,
  postDraftPropertyItem,
  postDraftPendingTask,
  postAgentDraft,
} from "@/controllers/agent-drafts";
import { resolveAgentsAuthContext } from "@/routes/agents-auth";

export function registerAgentsDraftRoutes(r: Hono) {

r.post("/drafts", async (c) => {
  const ctx = await resolveAgentsAuthContext(c);
  if (!ctx.ok) return ctx.response;
  return postAgentDraft(c, ctx.authCtx);
});

r.get("/drafts/:draftId", async (c) => {
  const ctx = await resolveAgentsAuthContext(c);
  if (!ctx.ok) return ctx.response;
  const draftId = c.req.param("draftId")?.trim() ?? "";
  if (!draftId) return c.json({ error: "Borrador no encontrado" }, 404);
  return getAgentDraft(c, ctx.authCtx, draftId);
});

r.patch("/drafts/:draftId", async (c) => {
  const ctx = await resolveAgentsAuthContext(c);
  if (!ctx.ok) return ctx.response;
  const draftId = c.req.param("draftId")?.trim() ?? "";
  if (!draftId) return c.json({ error: "Borrador no encontrado" }, 404);
  return patchAgentDraft(c, ctx.authCtx, draftId);
});

r.post(
  "/drafts/:draftId/system-prompt/regenerate",
  async (c) => {
    const ctx = await resolveAgentsAuthContext(c);
    if (!ctx.ok) return ctx.response;
    const draftId = c.req.param("draftId")?.trim() ?? "";
    if (!draftId) return c.json({ error: "Borrador no encontrado" }, 404);
    return postDraftSystemPromptRegenerate(c, ctx.authCtx, draftId);
  },
);

r.get("/drafts/:draftId/technical-properties", async (c) => {
  const ctx = await resolveAgentsAuthContext(c);
  if (!ctx.ok) return ctx.response;
  const draftId = c.req.param("draftId")?.trim() ?? "";
  if (!draftId) return c.json({ error: "Borrador no encontrado" }, 404);
  return getDraftTechnicalPropertiesBundle(c, ctx.authCtx, draftId);
});

r.patch("/drafts/:draftId/properties/:documentId", async (c) => {
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

r.get("/drafts/:draftId/tasks", async (c) => {
  const ctx = await resolveAgentsAuthContext(c);
  if (!ctx.ok) return ctx.response;
  const draftId = c.req.param("draftId")?.trim() ?? "";
  if (!draftId) return c.json({ error: "Borrador no encontrado" }, 404);
  return getDraftPendingTasks(c, ctx.authCtx, draftId);
});

r.post("/drafts/:draftId/tasks", async (c) => {
  const ctx = await resolveAgentsAuthContext(c);
  if (!ctx.ok) return ctx.response;
  const draftId = c.req.param("draftId")?.trim() ?? "";
  if (!draftId) return c.json({ error: "Borrador no encontrado" }, 404);
  return postDraftPendingTask(c, ctx.authCtx, draftId);
});

r.patch("/drafts/:draftId/tasks/:taskId", async (c) => {
  const ctx = await resolveAgentsAuthContext(c);
  if (!ctx.ok) return ctx.response;
  const draftId = c.req.param("draftId")?.trim() ?? "";
  const taskId = c.req.param("taskId")?.trim() ?? "";
  if (!draftId || !taskId) return c.json({ error: "Tarea no encontrada" }, 404);
  return patchDraftPendingTask(c, ctx.authCtx, draftId, taskId);
});

r.get("/drafts/:draftId/properties/:documentId/items", async (c) => {
  const ctx = await resolveAgentsAuthContext(c);
  if (!ctx.ok) return ctx.response;
  const draftId = c.req.param("draftId")?.trim() ?? "";
  const documentId = c.req.param("documentId")?.trim() ?? "";
  if (!draftId || !documentId) return c.json({ error: "Recurso no encontrado" }, 404);
  return getDraftPropertyItems(c, ctx.authCtx, draftId, documentId);
});

r.post("/drafts/:draftId/properties/:documentId/items", async (c) => {
  const ctx = await resolveAgentsAuthContext(c);
  if (!ctx.ok) return ctx.response;
  const draftId = c.req.param("draftId")?.trim() ?? "";
  const documentId = c.req.param("documentId")?.trim() ?? "";
  if (!draftId || !documentId) return c.json({ error: "Recurso no encontrado" }, 404);
  return postDraftPropertyItem(c, ctx.authCtx, draftId, documentId);
});

r.patch(
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

r.delete(
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
}
