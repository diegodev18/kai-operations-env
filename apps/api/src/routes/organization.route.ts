import type { Context } from "hono";
import { Hono } from "hono";

import {
  getInvitationPreview,
  getOrganizationInvitations,
  getOrganizationMe,
  getOrganizationUsers,
  postOrganizationInvitation,
} from "@/controllers/organization.controller";
import { auth } from "@/lib/auth";
import { isOperationsAdmin } from "@/utils/operations-access";
import { resolveSessionUserRole } from "@/utils/sessionUser";

const organizationRouter = new Hono();

organizationRouter.get("/invitation-preview", (c) => getInvitationPreview(c));

async function requireSession(c: Context) {
  const session = await auth.api.getSession({ headers: c.req.raw.headers });
  if (!session?.user) {
    return { error: c.json({ error: "No autorizado" }, 401) as Response };
  }
  const u = session.user as { id?: string; role?: string | null };
  const role = await resolveSessionUserRole(u);
  return { sessionUser: u, role };
}

organizationRouter.get("/me", async (c) => {
  const ctx = await requireSession(c);
  if ("error" in ctx) return ctx.error;
  return getOrganizationMe(c, ctx.role);
});

organizationRouter.get("/users", async (c) => {
  const ctx = await requireSession(c);
  if ("error" in ctx) return ctx.error;
  return getOrganizationUsers(c);
});

organizationRouter.get("/invitations", async (c) => {
  const ctx = await requireSession(c);
  if ("error" in ctx) return ctx.error;
  if (!isOperationsAdmin(ctx.role)) {
    return c.json({ error: "No autorizado" }, 403);
  }
  return getOrganizationInvitations(c);
});

organizationRouter.post("/invitations", async (c) => {
  const ctx = await requireSession(c);
  if ("error" in ctx) return ctx.error;
  if (!isOperationsAdmin(ctx.role)) {
    return c.json({ error: "No autorizado" }, 403);
  }
  return postOrganizationInvitation(c, ctx.sessionUser.id);
});

export default organizationRouter;
