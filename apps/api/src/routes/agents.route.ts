import { eq } from "drizzle-orm";
import { Hono } from "hono";

import {
  getAgentsInfo,
  type AgentsInfoAuthContext,
} from "@/controllers/agents.controller";
import { db } from "@/db/client";
import { user } from "@/db/schema/auth";
import { auth } from "@/lib/auth";

const agentsRouter = new Hono();

agentsRouter.get("/info", async (c) => {
  const session = await auth.api.getSession({ headers: c.req.raw.headers });
  if (!session?.user) {
    return c.json({ error: "No autorizado" }, 401);
  }
  const u = session.user as {
    id?: string;
    email?: string | null;
    role?: string | null;
  };
  let userRole = u.role ?? undefined;
  if (userRole == null && u.id) {
    const rows = await db
      .select({ role: user.role })
      .from(user)
      .where(eq(user.id, u.id))
      .limit(1);
    userRole = rows[0]?.role ?? undefined;
  }
  const authCtx: AgentsInfoAuthContext = {
    userEmail: u.email ?? undefined,
    userRole,
  };
  return await getAgentsInfo(c, authCtx);
});

export default agentsRouter;
