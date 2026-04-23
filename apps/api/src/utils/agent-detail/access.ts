import type { Context } from "hono";

import { ApiErrors } from "@/lib/api-error";
import {
  extractFirestoreIndexUrl,
  firestoreFailureHint,
  isFirebaseConfigError,
} from "@/utils/firestore/errors";
import type { AgentsInfoAuthContext } from "@/types/agents";
import { userCanAccessAgent } from "@/utils/agents";

export function normalizeAgentStatus(value: unknown): "active" | "archived" {
  return value === "archived" ? "archived" : "active";
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

export async function requireAgentAccess(
  c: Context,
  authCtx: AgentsInfoAuthContext,
  agentId: string,
): Promise<Response | null> {
  try {
    const ok = await userCanAccessAgent(authCtx, agentId);
    if (!ok) {
      return ApiErrors.forbidden(c, "No autorizado para este agente");
    }
    return null;
  } catch (error) {
    const r = handleFirestoreError(c, error, "[agent access]");
    return r ?? ApiErrors.internal(c, "Error de acceso");
  }
}
