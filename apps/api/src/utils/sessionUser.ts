import { eq } from "drizzle-orm";

import { db } from "@/db/client";
import { user } from "@/db/schema/auth";

export async function resolveSessionUserRole(sessionUser: {
  id?: string;
  role?: string | null;
}): Promise<string | undefined> {
  let role = sessionUser.role ?? undefined;
  if (role == null && sessionUser.id) {
    const rows = await db
      .select({ role: user.role })
      .from(user)
      .where(eq(user.id, sessionUser.id))
      .limit(1);
    role = rows[0]?.role ?? undefined;
  }
  return role;
}
