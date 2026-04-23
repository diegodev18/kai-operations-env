import type { Context } from "hono";

import { ApiErrors } from "@/lib/api-error";
import {
  extractFirestoreIndexUrl,
  firestoreFailureHint,
  isFirebaseConfigError,
} from "@/utils/firestore/errors";
import {
  isOperationsAdmin,
  isOperationsCommercial,
} from "@/utils/operations-access";
import type { AgentsInfoAuthContext } from "@/types/agents-types";

export function canAccessDraft(
  authCtx: AgentsInfoAuthContext,
  draftData: Record<string, unknown>,
): boolean {
  if (isOperationsAdmin(authCtx.userRole)) return true;
  if (isOperationsCommercial(authCtx.userRole)) return true;
  const hasLegacy =
    draftData.creator_email == null && draftData.creator_user_id == null;
  if (hasLegacy) return false;
  const email = authCtx.userEmail?.toLowerCase().trim();
  const uid = authCtx.userId;
  const ce =
    typeof draftData.creator_email === "string"
      ? draftData.creator_email.toLowerCase().trim()
      : "";
  const cid =
    typeof draftData.creator_user_id === "string"
      ? draftData.creator_user_id
      : "";
  if (uid && cid && uid === cid) return true;
  if (email && ce && email === ce) return true;
  return false;
}

export function requireEmailForGrower(
  c: Context,
  authCtx: AgentsInfoAuthContext,
): Response | null {
  const email = authCtx.userEmail?.trim().toLowerCase() ?? "";
  if (!email.includes("@")) {
    return c.json(
      {
        error:
          "Tu cuenta debe tener un email para crear un agente y asignarte como grower.",
      },
      400,
    );
  }
  return null;
}

export function handleFirestoreError(
  c: Context,
  error: unknown,
  logPrefix: string,
) {
  if (isFirebaseConfigError(error)) {
    return c.json(
      {
        error:
          "Firebase no configurado. Define credenciales de servicio (env o tokens).",
      },
      503,
    );
  }
  const hint = firestoreFailureHint(error);
  const msg = error instanceof Error ? error.message : String(error);
  const createIndexUrl = extractFirestoreIndexUrl(msg);
  console.error(`${logPrefix} Firestore:`, msg);
  if (hint) {
    return c.json(
      { error: hint, ...(createIndexUrl ? { createIndexUrl } : {}) },
      503,
    );
  }
  return ApiErrors.internal(c, "Error al acceder a Firestore.");
}
