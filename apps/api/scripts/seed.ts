/**
 * Crea el usuario principal tras migraciones. Requiere DATABASE_URL y
 * SEED_USER_EMAIL, SEED_USER_PASSWORD, SEED_USER_NAME en .env
 *
 * Con `disableSignUp: true`, `signUpEmail` no está disponible; se insertan user + account
 * con el mismo formato que Better Auth (hash scrypt vía `better-auth/crypto`).
 */

import { eq } from "drizzle-orm";
import { hashPassword } from "better-auth/crypto";

import { db } from "../src/db/client";
import { account, user } from "../src/db/schema/auth";

async function getUserIdByEmail(email: string): Promise<string | null> {
  const rows = await db
    .select({ id: user.id })
    .from(user)
    .where(eq(user.email, email))
    .limit(1);
  return rows[0]?.id ?? null;
}

async function seed() {
  const emailRaw = process.env.SEED_USER_EMAIL;
  const password = process.env.SEED_USER_PASSWORD;
  const name = process.env.SEED_USER_NAME;

  if (!emailRaw || !password || !name) {
    console.log(
      "Seed omitido: define SEED_USER_EMAIL, SEED_USER_PASSWORD y SEED_USER_NAME en .env",
    );
    process.exit(0);
  }

  const email = emailRaw.toLowerCase();

  const existing = await getUserIdByEmail(email);
  if (existing) {
    console.log(`Usuario ya existía: ${email}`);
    process.exit(0);
  }

  const userId = crypto.randomUUID();
  const accountId = crypto.randomUUID();
  const passwordHash = await hashPassword(password);
  const now = new Date();

  try {
    await db.transaction(async (tx) => {
      await tx.insert(user).values({
        id: userId,
        name,
        email,
        emailVerified: false,
        image: null,
        createdAt: now,
        updatedAt: now,
      });
      await tx.insert(account).values({
        id: accountId,
        accountId: userId,
        providerId: "credential",
        userId,
        password: passwordHash,
        accessToken: null,
        refreshToken: null,
        idToken: null,
        accessTokenExpiresAt: null,
        refreshTokenExpiresAt: null,
        scope: null,
        createdAt: now,
        updatedAt: now,
      });
    });
    console.log(`Usuario creado: ${email}`);
  } catch (err) {
    const message = (err as Error).message?.toLowerCase() ?? "";
    if (message.includes("duplicate") || message.includes("unique")) {
      console.log(`Usuario ya existía: ${email}`);
      process.exit(0);
    }
    console.error("Error en seed:", err);
    process.exit(1);
  }

  console.log("Seed completado.");
}

seed();
