import { Hono } from "hono";

import {
  getAgentDraft,
  getToolsCatalog,
  patchAgentDraft,
  postAgentDraft,
} from "@/controllers/agent-drafts.controller";
import { getAgentsInfo } from "@/controllers/agents.controller";
import {
  deleteAgentGrower,
  getAgentGrowers,
  postAgentGrower,
} from "@/controllers/agents-growers.controller";
import { resolveAgentsAuthContext } from "@/routes/agents-auth";

const agentsRouter = new Hono();

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

agentsRouter.get("/:agentId/growers", async (c) => {
  const ctx = await resolveAgentsAuthContext(c);
  if (!ctx.ok) return ctx.response;
  const agentId = c.req.param("agentId")?.trim();
  if (!agentId) {
    return c.json({ error: "Agente no encontrado" }, 404);
  }
  return getAgentGrowers(c, ctx.authCtx, agentId);
});

agentsRouter.post("/:agentId/growers", async (c) => {
  const ctx = await resolveAgentsAuthContext(c);
  if (!ctx.ok) return ctx.response;
  const agentId = c.req.param("agentId")?.trim();
  if (!agentId) {
    return c.json({ error: "Agente no encontrado" }, 404);
  }
  return postAgentGrower(c, ctx.authCtx, agentId);
});

agentsRouter.delete("/:agentId/growers/:growerEmail", async (c) => {
  const ctx = await resolveAgentsAuthContext(c);
  if (!ctx.ok) return ctx.response;
  const agentId = c.req.param("agentId")?.trim();
  const growerEmail = c.req.param("growerEmail");
  if (!agentId || growerEmail == null || growerEmail === "") {
    return c.json({ error: "Agente o grower no encontrado" }, 404);
  }
  return deleteAgentGrower(c, ctx.authCtx, agentId, growerEmail);
});

export default agentsRouter;
