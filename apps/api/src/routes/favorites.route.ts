import type { Context } from "hono";
import { Hono } from "hono";
import { db } from "@/db/client";
import { userFavoriteAgents } from "@/db/schema/auth";
import { eq, and } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { resolveSessionUserRole } from "@/utils/sessionUser";
import { nanoid } from "nanoid";

export const favoritesRouter = new Hono();

async function getSessionUser(c: Context) {
  const session = await auth.api.getSession({ headers: c.req.raw.headers });
  if (!session?.user) {
    return null;
  }
  const u = session.user as { id?: string; role?: string | null; email?: string | null };
  const role = await resolveSessionUserRole(u);
  return { ...u, role };
}

favoritesRouter.get("/", async (c) => {
  const user = await getSessionUser(c);
  if (!user?.id) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const favorites = await db
    .select({ agentId: userFavoriteAgents.agentId })
    .from(userFavoriteAgents)
    .where(eq(userFavoriteAgents.userId, user.id));

  return c.json({ favorites: favorites.map((f) => f.agentId) });
});

favoritesRouter.post("/:agentId", async (c) => {
  const user = await getSessionUser(c);
  if (!user?.id) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const agentId = c.req.param("agentId");

  const existing = await db
    .select()
    .from(userFavoriteAgents)
    .where(
      and(
        eq(userFavoriteAgents.userId, user.id),
        eq(userFavoriteAgents.agentId, agentId)
      )
    )
    .limit(1);

  if (existing.length > 0) {
    return c.json({ message: "Already favorite" });
  }

  await db.insert(userFavoriteAgents).values({
    id: nanoid(),
    userId: user.id,
    agentId,
  });

  return c.json({ message: "Added to favorites" });
});

favoritesRouter.delete("/:agentId", async (c) => {
  const user = await getSessionUser(c);
  if (!user?.id) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const agentId = c.req.param("agentId");

  await db
    .delete(userFavoriteAgents)
    .where(
      and(
        eq(userFavoriteAgents.userId, user.id),
        eq(userFavoriteAgents.agentId, agentId)
      )
    );

  return c.json({ message: "Removed from favorites" });
});
