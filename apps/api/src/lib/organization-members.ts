import { count, eq } from "drizzle-orm";

import { db } from "@/db/client";
import { user } from "@/db/schema/auth";
import { account } from "@/db/schema/auth";
import { createHash, randomBytes } from "node:crypto";

type OrgMemberError = { ok: false; status: 400 | 403 | 404; message: string };
type OrgMemberOk = { ok: true };

export async function countAdminUsers(): Promise<number> {
  const [row] = await db
    .select({ c: count() })
    .from(user)
    .where(eq(user.role, "admin"));
  return Number(row?.c ?? 0);
}

export async function getUserById(id: string) {
  const [row] = await db.select().from(user).where(eq(user.id, id)).limit(1);
  return row ?? null;
}

export async function changeMemberRole(
  targetUserId: string,
  newRole: "admin" | "member" | "commercial",
): Promise<OrgMemberOk | OrgMemberError> {
  const target = await getUserById(targetUserId);
  if (!target) {
    return { ok: false, status: 404, message: "Usuario no encontrado" };
  }
  if (target.role === newRole) {
    return { ok: true };
  }
  if (target.role === "admin" && newRole === "member") {
    const admins = await countAdminUsers();
    if (admins < 2) {
      return {
        ok: false,
        status: 403,
        message: "Debe existir al menos un administrador",
      };
    }
  }
  await db
    .update(user)
    .set({ role: newRole, updatedAt: new Date() })
    .where(eq(user.id, targetUserId));
  return { ok: true };
}

export async function removeMember(
  actorUserId: string,
  targetUserId: string,
): Promise<OrgMemberOk | OrgMemberError> {
  if (actorUserId === targetUserId) {
    return {
      ok: false,
      status: 403,
      message: "No puedes eliminar tu propia cuenta",
    };
  }
  const target = await getUserById(targetUserId);
  if (!target) {
    return { ok: false, status: 404, message: "Usuario no encontrado" };
  }
  if (target.role === "admin") {
    const admins = await countAdminUsers();
    if (admins < 2) {
      return {
        ok: false,
        status: 403,
        message: "No puedes eliminar el único administrador",
      };
    }
  }
  await db.delete(user).where(eq(user.id, targetUserId));
  return { ok: true };
}

function generateTempPassword(): string {
  const chars =
    "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#$%&*";
  const bytes = randomBytes(12);
  let password = "";
  for (let i = 0; i < 12; i++) {
    password += chars[bytes[i] % chars.length];
  }
  return password;
}

function hashPassword(plain: string): string {
  return createHash("sha256").update(plain, "utf8").digest("hex");
}

export async function resetUserPassword(
  targetUserId: string,
): Promise<{ ok: true; tempPassword: string } | OrgMemberError> {
  const target = await getUserById(targetUserId);
  if (!target) {
    return { ok: false, status: 404, message: "Usuario no encontrado" };
  }
  const tempPassword = generateTempPassword();
  const passwordHash = hashPassword(tempPassword);
  const [existingAccount] = await db
    .select()
    .from(account)
    .where(eq(account.userId, targetUserId))
    .limit(1);
  if (existingAccount) {
    await db
      .update(account)
      .set({ password: passwordHash, updatedAt: new Date() })
      .where(eq(account.userId, targetUserId));
  } else {
    const accountId = randomBytes(16).toString("hex");
    await db.insert(account).values({
      id: accountId,
      accountId: accountId,
      providerId: "credential",
      userId: targetUserId,
      password: passwordHash,
    });
  }
  return { ok: true, tempPassword };
}
