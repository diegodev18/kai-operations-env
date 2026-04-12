import type { Context } from "hono";

import { eq } from "drizzle-orm";

import { WEB_ORIGIN } from "@/config";
import { db } from "@/db/client";
import { user } from "@/db/schema/auth";
import {
  createInvitationRecord,
  findPendingInvitationByToken,
  listPendingInvitations,
  listUsersForOrganization,
  deletePendingInvitation,
  normalizeInviteEmail,
  rotatePendingInvitationToken,
} from "@/lib/invitations";
import { changeMemberRole, removeMember, resetUserPassword } from "@/lib/organizationMembers";
import { generateInvitationPlainToken } from "@/utils/invitationToken";
import { isValidEmail } from "@/utils/validation";

export const getOrganizationMe = async (
  c: Context,
  userRole: string | undefined,
  sessionUser?: { email?: string | null },
) => {
  return c.json({ 
    role: userRole ?? "member",
    email: sessionUser?.email ?? null,
  });
};

export const getOrganizationUsers = async (c: Context) => {
  const users = await listUsersForOrganization();
  return c.json({
    users: users.map((u) => ({
      id: u.id,
      name: u.name,
      email: u.email,
      phone: u.phone ?? null,
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

async function issueInvitationLinkForId(c: Context, invitationId: string) {
  try {
    const rotated = await rotatePendingInvitationToken(invitationId);
    if (!rotated.ok) {
      return c.json(
        { error: "Invitación no encontrada o ya fue utilizada" },
        404,
      );
    }
    const base = WEB_ORIGIN.replace(/\/$/, "");
    const inviteUrl = `${base}/register?token=${encodeURIComponent(rotated.plainToken)}`;
    return c.json({ inviteUrl });
  } catch (err) {
    console.error("[organization] issueInvitationLinkForId", err);
    return c.json({ error: "No se pudo generar el enlace" }, 500);
  }
}

/** Ruta alternativa con body JSON (evita proxies que fallan con `/invitations/:id/link`). */
export const postOrganizationInvitationRefreshLink = async (c: Context) => {
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "JSON inválido" }, 400);
  }
  const invitationId =
    typeof body === "object" &&
    body !== null &&
    typeof (body as { invitationId?: unknown }).invitationId === "string"
      ? (body as { invitationId: string }).invitationId.trim()
      : "";
  if (!invitationId) {
    return c.json({ error: "invitationId requerido" }, 400);
  }
  return issueInvitationLinkForId(c, invitationId);
};

export const postOrganizationInvitationLink = async (c: Context) => {
  const invitationId = c.req.param("invitationId")?.trim();
  if (!invitationId) {
    return c.json({ error: "Invitación no encontrada" }, 404);
  }
  return issueInvitationLinkForId(c, invitationId);
};

export const deleteOrganizationInvitation = async (c: Context) => {
  const invitationId = c.req.param("invitationId")?.trim();
  if (!invitationId) {
    return c.json({ error: "Invitación no encontrada" }, 404);
  }
  const result = await deletePendingInvitation(invitationId);
  if (!result.ok) {
    return c.json(
      { error: "Invitación no encontrada o ya fue utilizada" },
      404,
    );
  }
  return c.json({ ok: true });
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
  if (role !== "admin" && role !== "member" && role !== "commercial") {
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

const PHONE_REGEX = /^[+\d\s()-]{0,20}$/;

export const patchOrganizationUserPhone = async (
  c: Context,
  targetUserId: string,
) => {
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "JSON inválido" }, 400);
  }

  const phone = (body as { phone?: unknown }).phone;
  if (phone !== null && phone !== undefined && typeof phone !== "string") {
    return c.json({ error: "phone debe ser string o null" }, 400);
  }

  const phoneStr = typeof phone === "string" ? phone.trim() : null;
  if (phoneStr !== null && phoneStr.length > 0 && !PHONE_REGEX.test(phoneStr)) {
    return c.json({ error: "Formato de teléfono no válido" }, 400);
  }

  try {
    await db
      .update(user)
      .set({ phone: phoneStr && phoneStr.length > 0 ? phoneStr : null })
      .where(eq(user.id, targetUserId));
    return c.json({ ok: true });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error("[organization PATCH phone]", msg);
    return c.json({ error: "Error al actualizar teléfono" }, 500);
  }
};

export const postOrganizationUserResetPassword = async (
  c: Context,
  targetUserId: string,
) => {
  const result = await resetUserPassword(targetUserId);
  if (!result.ok) {
    return c.json({ error: result.message }, result.status);
  }
  return c.json({ ok: true, tempPassword: result.tempPassword });
};
