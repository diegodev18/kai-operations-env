import { Hono } from "hono";

import {
  createTestingDataDocument,
  deleteTestingDataDocument,
  getTestingDataDocument,
  listSubcollections,
  listTestingDataCollections,
  listTestingDataDocuments,
  updateTestingDataDocument,
} from "@/controllers/agent-testing-data.controller";
import { resolveAgentsAuthContext } from "@/routes/agents-auth";

const router = new Hono();

router.get("/:agentId/testing/data", async (c) => {
  const ctx = await resolveAgentsAuthContext(c);
  if (!ctx.ok) return ctx.response;
  return listTestingDataCollections(ctx.authCtx, c);
});

router.get("/:agentId/testing/data/:path*", async (c) => {
  const ctx = await resolveAgentsAuthContext(c);
  if (!ctx.ok) return ctx.response;
  return listSubcollections(ctx.authCtx, c);
});

router.get("/:agentId/testing/data/:collection", async (c) => {
  const ctx = await resolveAgentsAuthContext(c);
  if (!ctx.ok) return ctx.response;
  return listTestingDataDocuments(ctx.authCtx, c);
});

router.get("/:agentId/testing/data/:collection/:docId", async (c) => {
  const ctx = await resolveAgentsAuthContext(c);
  if (!ctx.ok) return ctx.response;
  return getTestingDataDocument(ctx.authCtx, c);
});

router.post("/:agentId/testing/data/:collection", async (c) => {
  const ctx = await resolveAgentsAuthContext(c);
  if (!ctx.ok) return ctx.response;
  return createTestingDataDocument(ctx.authCtx, c);
});

router.patch("/:agentId/testing/data/:collection/:docId", async (c) => {
  const ctx = await resolveAgentsAuthContext(c);
  if (!ctx.ok) return ctx.response;
  return updateTestingDataDocument(ctx.authCtx, c);
});

router.delete("/:agentId/testing/data/:collection/:docId", async (c) => {
  const ctx = await resolveAgentsAuthContext(c);
  if (!ctx.ok) return ctx.response;
  return deleteTestingDataDocument(ctx.authCtx, c);
});

export default router;
