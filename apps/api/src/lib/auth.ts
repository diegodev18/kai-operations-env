import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";

import {
  BETTER_AUTH_SECRET,
  BETTER_AUTH_URL,
  WEB_ORIGIN,
} from "@/config";
import { db } from "@/db/client";

if (!BETTER_AUTH_SECRET) {
  throw new Error("BETTER_AUTH_SECRET is required");
}

export const auth = betterAuth({
  baseURL: BETTER_AUTH_URL,
  database: drizzleAdapter(db, { provider: "pg" }),
  emailAndPassword: {
    enabled: true,
    disableSignUp: true,
  },
  secret: BETTER_AUTH_SECRET,
  trustedOrigins: [WEB_ORIGIN, BETTER_AUTH_URL],
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
