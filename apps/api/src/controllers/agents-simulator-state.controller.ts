import type { Context } from "hono";
import { FieldValue } from "firebase-admin/firestore";

import type { AgentsInfoAuthContext } from "@/types/agents-types";
import { resolveAgentWriteDatabase, userCanAccessAgent } from "@/utils/agents";
import {
  extractFirestoreIndexUrl,
  firestoreFailureHint,
  isFirebaseConfigError,
} from "@/utils/firestore/errors";

type StoredConversation = {
  id: string;
  prompt: string;
  streamEvents: unknown[];
  error: string | null;
  closedAt: string | null;
};

function getSimulatorStateRef(
  db: FirebaseFirestore.Firestore,
  agentId: string,
  backofficeUserId: string,
) {
  return db
    .collection("agent_configurations")
    .doc(agentId)
    .collection("implementation")
    .doc("simulator")
    .collection("users")
    .doc(backofficeUserId);
}

function normalizeBackofficeUserId(authCtx: AgentsInfoAuthContext): string | null {
  if (typeof authCtx.userId === "string" && authCtx.userId.trim()) {
    return authCtx.userId.trim();
  }
  if (typeof authCtx.userEmail === "string" && authCtx.userEmail.trim()) {
    return authCtx.userEmail.trim().toLowerCase();
  }
  return null;
}

function normalizeStoredConversation(item: unknown): StoredConversation | null {
  if (typeof item !== "object" || item === null) return null;
  const row = item as Record<string, unknown>;
  const id = typeof row.id === "string" && row.id.trim() ? row.id.trim() : null;
  if (!id) return null;
  return {
    id,
    prompt: typeof row.prompt === "string" ? row.prompt : "",
    streamEvents: Array.isArray(row.streamEvents) ? row.streamEvents : [],
    error: typeof row.error === "string" ? row.error : null,
    closedAt: typeof row.closedAt === "string" ? row.closedAt : null,
  };
}

function parseConversationsBody(body: unknown): StoredConversation[] | null {
  if (typeof body !== "object" || body === null) return null;
  const rawConversations = (body as { conversations?: unknown }).conversations;
  if (!Array.isArray(rawConversations)) return null;
  const normalized = rawConversations
    .map((item) => normalizeStoredConversation(item))
    .filter((item): item is StoredConversation => item !== null);
  return normalized;
}

function handleFirestoreError(c: Context, error: unknown, logPrefix: string) {
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
  return c.json({ error: "Error al acceder a Firestore." }, 500);
}

async function requireAgentAccess(
  c: Context,
  authCtx: AgentsInfoAuthContext,
  agentId: string,
): Promise<Response | null> {
  try {
    const ok = await userCanAccessAgent(authCtx, agentId);
    if (!ok) {
      return c.json({ error: "No autorizado para este agente" }, 403);
    }
    return null;
  } catch (error) {
    return handleFirestoreError(c, error, "[simulator state access]");
  }
}

async function resolveSimulatorContext(
  c: Context,
  authCtx: AgentsInfoAuthContext,
  agentId: string,
): Promise<
  | {
      ok: true;
      db: FirebaseFirestore.Firestore;
      backofficeUserId: string;
    }
  | { ok: false; response: Response }
> {
  const denied = await requireAgentAccess(c, authCtx, agentId);
  if (denied) return { ok: false, response: denied };

  const backofficeUserId = normalizeBackofficeUserId(authCtx);
  if (!backofficeUserId) {
    return { ok: false, response: c.json({ error: "No autorizado" }, 403) };
  }

  try {
    const { db, hasTestingData, inProduction } =
      await resolveAgentWriteDatabase(agentId);
    if (!hasTestingData && !inProduction) {
      return { ok: false, response: c.json({ error: "Agente no encontrado" }, 404) };
    }
    const agentSnap = await db.collection("agent_configurations").doc(agentId).get();
    if (!agentSnap.exists) {
      return { ok: false, response: c.json({ error: "Agente no encontrado" }, 404) };
    }
    return { ok: true, db, backofficeUserId };
  } catch (error) {
    return {
      ok: false,
      response: handleFirestoreError(c, error, "[simulator state resolve]"),
    };
  }
}

export async function getSimulatorState(
  c: Context,
  authCtx: AgentsInfoAuthContext,
  agentId: string,
) {
  const resolved = await resolveSimulatorContext(c, authCtx, agentId);
  if (!resolved.ok) return resolved.response;

  try {
    const ref = getSimulatorStateRef(
      resolved.db,
      agentId,
      resolved.backofficeUserId,
    );
    const snap = await ref.get();
    if (!snap.exists) {
      return c.json({ conversations: [] as StoredConversation[] });
    }

    const data = snap.data() as { conversations?: unknown } | undefined;
    const conversations = Array.isArray(data?.conversations)
      ? data.conversations
          .map((item) => normalizeStoredConversation(item))
          .filter((item): item is StoredConversation => item !== null)
      : [];

    return c.json({ conversations });
  } catch (error) {
    return handleFirestoreError(c, error, "[simulator state GET]");
  }
}

export async function patchSimulatorState(
  c: Context,
  authCtx: AgentsInfoAuthContext,
  agentId: string,
) {
  const resolved = await resolveSimulatorContext(c, authCtx, agentId);
  if (!resolved.ok) return resolved.response;

  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "JSON inválido" }, 400);
  }

  const conversations = parseConversationsBody(body);
  if (!conversations) {
    return c.json({ error: "conversations debe ser un arreglo" }, 400);
  }

  try {
    const ref = getSimulatorStateRef(
      resolved.db,
      agentId,
      resolved.backofficeUserId,
    );
    await ref.set(
      {
        conversations,
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );

    return c.json({ ok: true });
  } catch (error) {
    return handleFirestoreError(c, error, "[simulator state PATCH]");
  }
}

export async function deleteSimulatorState(
  c: Context,
  authCtx: AgentsInfoAuthContext,
  agentId: string,
) {
  const resolved = await resolveSimulatorContext(c, authCtx, agentId);
  if (!resolved.ok) return resolved.response;

  try {
    const ref = getSimulatorStateRef(
      resolved.db,
      agentId,
      resolved.backofficeUserId,
    );
    await ref.delete();
    return c.json({ ok: true });
  } catch (error) {
    return handleFirestoreError(c, error, "[simulator state DELETE]");
  }
}
