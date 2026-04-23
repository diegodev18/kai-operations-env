import { Hono } from "hono";

import {
  createTestingDataDocument,
  deleteTestingDataDocument,
  getTestingDataDocument,
  listTestingDataCollections,
  listTestingDataDocuments,
  listTestingDataSubcollections,
  updateTestingDataDocument,
} from "@/controllers/agent-testing-data.controller";
import { resolveAgentsAuthContext } from "@/routes/agents-auth";

export const agentTestingDataRouter = new Hono();

agentTestingDataRouter.get("/:agentId/testing/data", async (c) => {
  const ctx = await resolveAgentsAuthContext(c);
  if (!ctx.ok) return ctx.response;
  return listTestingDataCollections(ctx.authCtx, c);
});

agentTestingDataRouter.get("/:agentId/testing/data/:collection", async (c) => {
  const ctx = await resolveAgentsAuthContext(c);
  if (!ctx.ok) return ctx.response;
  return listTestingDataDocuments(ctx.authCtx, c);
});

agentTestingDataRouter.get("/:agentId/testing/data/:collection/subcollections", async (c) => {
  const ctx = await resolveAgentsAuthContext(c);
  if (!ctx.ok) return ctx.response;
  return listTestingDataSubcollections(ctx.authCtx, c);
});

agentTestingDataRouter.get("/:agentId/testing/data/:collection/:docId", async (c) => {
  const ctx = await resolveAgentsAuthContext(c);
  if (!ctx.ok) return ctx.response;
  return getTestingDataDocument(ctx.authCtx, c);
});

agentTestingDataRouter.post("/:agentId/testing/data/:collection", async (c) => {
  const ctx = await resolveAgentsAuthContext(c);
  if (!ctx.ok) return ctx.response;
  return createTestingDataDocument(ctx.authCtx, c);
});

agentTestingDataRouter.patch("/:agentId/testing/data/:collection/:docId", async (c) => {
  const ctx = await resolveAgentsAuthContext(c);
  if (!ctx.ok) return ctx.response;
  return updateTestingDataDocument(ctx.authCtx, c);
});

agentTestingDataRouter.delete("/:agentId/testing/data/:collection/:docId", async (c) => {
  const ctx = await resolveAgentsAuthContext(c);
  if (!ctx.ok) return ctx.response;
  return deleteTestingDataDocument(ctx.authCtx, c);
});
