import type { Context } from "hono";
import { Hono } from "hono";

import {
  deleteOrganizationInvitation,
  deleteOrganizationUser,
  getInvitationPreview,
  getOrganizationInvitations,
  getOrganizationMe,
  getOrganizationUsers,
  patchOrganizationUser,
  patchOrganizationUserPhone,
  postOrganizationInvitation,
  postOrganizationInvitationLink,
  postOrganizationInvitationRefreshLink,
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
  const u = session.user as { id?: string; role?: string | null; email?: string | null };
  const role = await resolveSessionUserRole(u);
  return { sessionUser: u, role };
}

organizationRouter.get("/me", async (c) => {
  const ctx = await requireSession(c);
  if ("error" in ctx) return ctx.error;
  return getOrganizationMe(c, ctx.role, ctx.sessionUser);
});

organizationRouter.get("/users", async (c) => {
  const ctx = await requireSession(c);
  if ("error" in ctx) return ctx.error;
  return getOrganizationUsers(c);
});

organizationRouter.patch("/users/:userId", async (c) => {
  const ctx = await requireSession(c);
  if ("error" in ctx) return ctx.error;
  if (!isOperationsAdmin(ctx.role)) {
    return c.json({ error: "No autorizado" }, 403);
  }
  const targetUserId = c.req.param("userId");
  if (!targetUserId) {
    return c.json({ error: "Usuario no encontrado" }, 404);
  }
  return patchOrganizationUser(c, targetUserId);
});

organizationRouter.patch("/users/:userId/phone", async (c) => {
  const ctx = await requireSession(c);
  if ("error" in ctx) return ctx.error;
  if (!isOperationsAdmin(ctx.role)) {
    return c.json({ error: "No autorizado" }, 403);
  }
  const targetUserId = c.req.param("userId");
  if (!targetUserId) {
    return c.json({ error: "Usuario no encontrado" }, 404);
  }
  return patchOrganizationUserPhone(c, targetUserId);
});

organizationRouter.delete("/users/:userId", async (c) => {
  const ctx = await requireSession(c);
  if ("error" in ctx) return ctx.error;
  if (!isOperationsAdmin(ctx.role)) {
    return c.json({ error: "No autorizado" }, 403);
  }
  const targetUserId = c.req.param("userId");
  if (!targetUserId) {
    return c.json({ error: "Usuario no encontrado" }, 404);
  }
  const actorId = ctx.sessionUser.id;
  if (!actorId) {
    return c.json({ error: "No autorizado" }, 401);
  }
  return deleteOrganizationUser(c, actorId, targetUserId);
});

organizationRouter.get("/invitations", async (c) => {
  const ctx = await requireSession(c);
  if ("error" in ctx) return ctx.error;
  if (!isOperationsAdmin(ctx.role)) {
    return c.json({ error: "No autorizado" }, 403);
  }
  return getOrganizationInvitations(c);
});

organizationRouter.post("/invitations/refresh-link", async (c) => {
  const ctx = await requireSession(c);
  if ("error" in ctx) return ctx.error;
  if (!isOperationsAdmin(ctx.role)) {
    return c.json({ error: "No autorizado" }, 403);
  }
  return postOrganizationInvitationRefreshLink(c);
});

organizationRouter.post("/invitations", async (c) => {
  const ctx = await requireSession(c);
  if ("error" in ctx) return ctx.error;
  if (!isOperationsAdmin(ctx.role)) {
    return c.json({ error: "No autorizado" }, 403);
  }
  return postOrganizationInvitation(c, ctx.sessionUser.id);
});

organizationRouter.post("/invitations/:invitationId/link", async (c) => {
  const ctx = await requireSession(c);
  if ("error" in ctx) return ctx.error;
  if (!isOperationsAdmin(ctx.role)) {
    return c.json({ error: "No autorizado" }, 403);
  }
  return postOrganizationInvitationLink(c);
});

organizationRouter.delete("/invitations/:invitationId", async (c) => {
  const ctx = await requireSession(c);
  if ("error" in ctx) return ctx.error;
  if (!isOperationsAdmin(ctx.role)) {
    return c.json({ error: "No autorizado" }, 403);
  }
  return deleteOrganizationInvitation(c);
});

export default organizationRouter;
