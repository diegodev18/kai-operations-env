import type { Context } from "hono";
import { eq } from "drizzle-orm";

import type { AgentsInfoAuthContext } from "@/types/agents-types";
import { db } from "@/db/client";
import { user } from "@/db/schema/auth";
import { auth } from "@/lib/auth";

export async function resolveAgentsAuthContext(
  c: Context,
): Promise<
  | { ok: false; response: Response }
  | { ok: true; authCtx: AgentsInfoAuthContext }
> {
  const session = await auth.api.getSession({ headers: c.req.raw.headers });
  if (!session?.user) {
    return { ok: false, response: c.json({ error: "No autorizado" }, 401) };
  }
  const u = session.user as {
    id?: string;
    email?: string | null;
    role?: string | null;
    name?: string | null;
  };
  let userRole = u.role ?? undefined;
  let userName = typeof u.name === "string" ? u.name.trim() : undefined;
  if (userRole == null && u.id) {
    const rows = await db
      .select({ role: user.role, name: user.name })
      .from(user)
      .where(eq(user.id, u.id))
      .limit(1);
    userRole = rows[0]?.role ?? undefined;
    if (!userName && rows[0]?.name) {
      userName = rows[0].name.trim();
    }
  }
  return {
    ok: true,
    authCtx: {
      userEmail: u.email ?? undefined,
      userRole,
      userId: u.id,
      userName,
    },
  };
}
