import type { Hono } from "hono";

import { getToolsCatalog } from "@/controllers/agent-drafts";
import {
  getAgentsInfo,
  getAssignedAgentForUser,
} from "@/controllers/agents.controller";
import { resolveAgentsAuthContext } from "@/routes/agents-auth";

export function registerAgentsListRoutes(r: Hono) {
  r.get("/info", async (c) => {
    const ctx = await resolveAgentsAuthContext(c);
    if (!ctx.ok) return ctx.response;
    return await getAgentsInfo(c, ctx.authCtx);
  });

  r.get("/assigned-to-user", async (c) => {
    const ctx = await resolveAgentsAuthContext(c);
    if (!ctx.ok) return ctx.response;
    return getAssignedAgentForUser(c, ctx.authCtx);
  });

  r.get("/tools-catalog", async (c) => {
    const ctx = await resolveAgentsAuthContext(c);
    if (!ctx.ok) return ctx.response;
    return getToolsCatalog(c, ctx.authCtx);
  });
}
