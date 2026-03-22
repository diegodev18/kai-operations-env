import { randomUUID } from "node:crypto";

import { and, asc, eq, gt, isNull } from "drizzle-orm";

import { INVITATION_TTL_MS } from "@/constants/invitation";
import { db } from "@/db/client";
import { invitation, user } from "@/db/schema/auth";
import { hashInvitationToken } from "@/utils/invitationToken";

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
