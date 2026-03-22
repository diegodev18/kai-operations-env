import type { Context } from "hono";

import { WEB_ORIGIN } from "@/config";
import {
  createInvitationRecord,
  findPendingInvitationByToken,
  listPendingInvitations,
  listUsersForOrganization,
  normalizeInviteEmail,
} from "@/lib/invitations";
import { changeMemberRole, removeMember } from "@/lib/organizationMembers";
import { generateInvitationPlainToken } from "@/utils/invitationToken";
import { isValidEmail } from "@/utils/validation";

export const getOrganizationMe = async (
  c: Context,
  userRole: string | undefined,
) => {
  return c.json({ role: userRole ?? "member" });
};

export const getOrganizationUsers = async (c: Context) => {
  const users = await listUsersForOrganization();
  return c.json({
    users: users.map((u) => ({
      id: u.id,
      name: u.name,
      email: u.email,
      role: u.role,
      createdAt: u.createdAt?.toISOString() ?? null,
    })),
  });
};

export const getOrganizationInvitations = async (c: Context) => {
  const rows = await listPendingInvitations();
  return c.json({
    invitations: rows.map((r) => ({
      id: r.id,
      email: r.email,
      expiresAt: r.expiresAt.toISOString(),
      createdAt: r.createdAt.toISOString(),
    })),
  });
};

export const postOrganizationInvitation = async (
  c: Context,
  invitedByUserId: string | undefined,
) => {
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "JSON inválido" }, 400);
  }
  if (
    typeof body !== "object" ||
    body === null ||
    typeof (body as { email?: unknown }).email !== "string" ||
    !isValidEmail((body as { email: string }).email)
  ) {
    return c.json({ error: "Email inválido" }, 400);
  }
  const email = normalizeInviteEmail((body as { email: string }).email);
  const plainToken = generateInvitationPlainToken();
  try {
    await createInvitationRecord(email, invitedByUserId, plainToken);
  } catch (e: unknown) {
    const code = (e as { code?: string }).code;
    const msg = e instanceof Error ? e.message : String(e);
    if (code === "23505" || /unique|duplicate/i.test(msg)) {
      return c.json(
        {
          error:
            "Ya existe una invitación pendiente para ese correo o el token colisionó. Reintenta.",
        },
        409,
      );
    }
    throw e;
  }
  const base = WEB_ORIGIN.replace(/\/$/, "");
  const inviteUrl = `${base}/register?token=${encodeURIComponent(plainToken)}`;
  return c.json({ inviteUrl });
};

export const getInvitationPreview = async (c: Context) => {
  const token = c.req.query("token")?.trim();
  if (!token) {
    return c.json({ error: "No encontrado" }, 404);
  }
  const row = await findPendingInvitationByToken(token);
  if (!row) {
    return c.json({ error: "No encontrado" }, 404);
  }
  return c.json({ email: row.email });
};

export const patchOrganizationUser = async (
  c: Context,
  targetUserId: string,
) => {
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "JSON inválido" }, 400);
  }
  const role = (body as { role?: unknown }).role;
  if (role !== "admin" && role !== "member") {
    return c.json({ error: "Rol inválido" }, 400);
  }
  const result = await changeMemberRole(targetUserId, role);
  if (!result.ok) {
    return c.json({ error: result.message }, result.status);
  }
  return c.json({ ok: true });
};

export const deleteOrganizationUser = async (
  c: Context,
  actorUserId: string,
  targetUserId: string,
) => {
  const result = await removeMember(actorUserId, targetUserId);
  if (!result.ok) {
    return c.json({ error: result.message }, result.status);
  }
  return c.json({ ok: true });
};
