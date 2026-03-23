import { randomUUID } from "node:crypto";

import { and, asc, eq, gt, isNull } from "drizzle-orm";

import { INVITATION_TTL_MS } from "@/constants/invitation";
import { db } from "@/db/client";
import { invitation, user } from "@/db/schema/auth";
import {
  generateInvitationPlainToken,
  hashInvitationToken,
} from "@/utils/invitationToken";

export function normalizeInviteEmail(email: string): string {
  return email.trim().toLowerCase();
}

export async function findPendingInvitationByToken(plainToken: string) {
  const hash = hashInvitationToken(plainToken);
  const rows = await db
    .select()
    .from(invitation)
    .where(
      and(
        eq(invitation.tokenHash, hash),
        isNull(invitation.consumedAt),
        gt(invitation.expiresAt, new Date()),
      ),
    )
    .limit(1);
  return rows[0] ?? null;
}

export async function validateSignUpInvitation(
  plainToken: unknown,
  signupEmail: string,
): Promise<boolean> {
  if (typeof plainToken !== "string" || plainToken.length < 10) return false;
  const row = await findPendingInvitationByToken(plainToken);
  if (!row) return false;
  return row.email === normalizeInviteEmail(signupEmail);
}

export async function consumePendingInvitationForEmail(userEmail: string) {
  const email = normalizeInviteEmail(userEmail);
  await db
    .update(invitation)
    .set({ consumedAt: new Date() })
    .where(and(eq(invitation.email, email), isNull(invitation.consumedAt)));
}

export async function createInvitationRecord(
  email: string,
  invitedByUserId: string | undefined,
  plainToken: string,
) {
  const id = randomUUID();
  const tokenHash = hashInvitationToken(plainToken);
  const expiresAt = new Date(Date.now() + INVITATION_TTL_MS);
  await db.insert(invitation).values({
    id,
    email: normalizeInviteEmail(email),
    tokenHash,
    invitedByUserId: invitedByUserId ?? null,
    expiresAt,
  });
  return { id, expiresAt };
}

export async function listPendingInvitations() {
  return db
    .select({
      id: invitation.id,
      email: invitation.email,
      expiresAt: invitation.expiresAt,
      createdAt: invitation.createdAt,
    })
    .from(invitation)
    .where(isNull(invitation.consumedAt))
    .orderBy(asc(invitation.createdAt));
}

/** Rota el token de una invitación pendiente y devuelve el nuevo token en claro (solo para construir la URL). */
export async function rotatePendingInvitationToken(invitationId: string): Promise<
  | { ok: true; plainToken: string }
  | { ok: false; reason: "not_found" }
> {
  const rows = await db
    .select({ id: invitation.id })
    .from(invitation)
    .where(
      and(eq(invitation.id, invitationId), isNull(invitation.consumedAt)),
    )
    .limit(1);
  if (!rows[0]) {
    return { ok: false, reason: "not_found" };
  }
  const plainToken = generateInvitationPlainToken();
  const tokenHash = hashInvitationToken(plainToken);
  const expiresAt = new Date(Date.now() + INVITATION_TTL_MS);
  await db
    .update(invitation)
    .set({ tokenHash, expiresAt })
    .where(eq(invitation.id, invitationId));
  return { ok: true, plainToken };
}

export async function deletePendingInvitation(invitationId: string): Promise<
  | { ok: true }
  | { ok: false; reason: "not_found" }
> {
  const deleted = await db
    .delete(invitation)
    .where(
      and(eq(invitation.id, invitationId), isNull(invitation.consumedAt)),
    )
    .returning({ id: invitation.id });
  if (!deleted[0]) {
    return { ok: false, reason: "not_found" };
  }
  return { ok: true };
}

export async function listUsersForOrganization() {
  return db
    .select({
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      createdAt: user.createdAt,
    })
    .from(user)
    .orderBy(asc(user.email));
}
