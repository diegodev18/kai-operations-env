import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";

import {
  BETTER_AUTH_SECRET,
  BETTER_AUTH_URL,
  WEB_ORIGIN,
} from "@/config";
import { db } from "@/db/client";
import { invitationSignUpPlugin } from "@/lib/auth-invitation-plugin";
import { consumePendingInvitationForEmail } from "@/lib/invitations";

if (!BETTER_AUTH_SECRET) {
  throw new Error("BETTER_AUTH_SECRET is required");
}

export const auth = betterAuth({
  baseURL: BETTER_AUTH_URL,
  database: drizzleAdapter(db, { provider: "pg" }),
  emailAndPassword: {
    enabled: true,
    disableSignUp: false,
  },
  secret: BETTER_AUTH_SECRET,
  trustedOrigins: [WEB_ORIGIN, BETTER_AUTH_URL],
  plugins: [invitationSignUpPlugin()],
  databaseHooks: {
    user: {
      create: {
        after: async (user) => {
          const email =
            user && typeof (user as { email?: unknown }).email === "string"
              ? (user as { email: string }).email
              : null;
          if (email) await consumePendingInvitationForEmail(email);
        },
      },
    },
  },
  user: {
    additionalFields: {
      role: {
        type: "string",
        required: false,
        defaultValue: "member",
        input: false,
      },
    },
  },
});
