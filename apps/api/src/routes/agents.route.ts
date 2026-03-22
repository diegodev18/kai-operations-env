import { Hono } from "hono";

import { getAgentsInfo } from "@/controllers/agents.controller";
import { auth } from "@/lib/auth";

const agentsRouter = new Hono();

agentsRouter.get("/info", async (c) => {
  const session = await auth.api.getSession({ headers: c.req.raw.headers });
  if (!session?.user) {
    return c.json({ error: "No autorizado" }, 401);
  }
  return getAgentsInfo(c);
});

export default agentsRouter;
