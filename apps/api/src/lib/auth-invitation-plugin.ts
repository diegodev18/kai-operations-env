import type { BetterAuthPlugin } from "@better-auth/core";
import { APIError } from "@better-auth/core/error";
import { createAuthMiddleware } from "better-auth/api";

import { validateSignUpInvitation } from "@/lib/invitations";

/**
 * Exige `invitationToken` válido en POST /sign-up/email (junto con email coincidente).
 */
export function invitationSignUpPlugin(): BetterAuthPlugin {
  return {
    id: "invitation-sign-up",
    hooks: {
      before: [
        {
          matcher(ctx) {
            return ctx.path === "/sign-up/email";
          },
          handler: createAuthMiddleware(async (ctx) => {
            const body = ctx.body as Record<string, unknown> | undefined;
            const token = body?.invitationToken;
            const email = body?.email;
            if (typeof email !== "string") return;
            const ok = await validateSignUpInvitation(token, email);
            if (!ok) {
              throw APIError.from("FORBIDDEN", {
                code: "INVITATION_REQUIRED",
                message:
                  "Registro no autorizado. Se requiere invitación válida y el correo debe coincidir.",
              });
            }
          }),
        },
      ],
    },
  };
}
