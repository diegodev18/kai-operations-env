import type { Context } from "hono";
import type { QueryDocumentSnapshot } from "firebase-admin/firestore";
import { FieldValue } from "firebase-admin/firestore";

import type { AgentsInfoAuthContext } from "@/types/agents";
import { resolveAgentWriteDatabase, userCanAccessAgent } from "@/utils/agents";
import {
  extractFirestoreIndexUrl,
  firestoreFailureHint,
  isFirebaseConfigError,
} from "@/utils/firestore/errors";
import {
  getImplementationActivityItemsRef,
  validateCommentBodyHtml,
} from "@/services/implementation-activity.service";

const ACTIVITY_PAGE_SIZE = 100;

function toIsoOrNull(value: unknown): string | null {
  if (value == null) return null;
  if (
    typeof value === "object" &&
    value !== null &&
    typeof (value as { toDate?: () => Date }).toDate === "function"
  ) {
    return (value as { toDate: () => Date }).toDate().toISOString();
  }
  return null;
}

function mapActivityDoc(doc: QueryDocumentSnapshot): Record<string, unknown> {
  const data = doc.data() as Record<string, unknown>;
  const kind = data.kind === "comment" || data.kind === "system" ? data.kind : "system";
  const base: Record<string, unknown> = {
    id: doc.id,
    kind,
    createdAt: toIsoOrNull(data.createdAt),
    actorEmail:
      typeof data.actorEmail === "string"
        ? data.actorEmail.toLowerCase().trim()
        : data.actorEmail === null
          ? null
          : null,
  };
  if (kind === "comment") {
    base.format = data.format === "html" ? "html" : "html";
    base.bodyHtml = typeof data.bodyHtml === "string" ? data.bodyHtml : "";
  } else {
    base.action = typeof data.action === "string" ? data.action : "unknown";
    base.summary = typeof data.summary === "string" ? data.summary : "";
    if (data.metadata != null && typeof data.metadata === "object" && !Array.isArray(data.metadata)) {
      base.metadata = data.metadata;
    }
  }
  return base;
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
    return handleFirestoreError(c, error, "[implementation activity access]");
  }
}

export async function getImplementationActivity(
  c: Context,
  authCtx: AgentsInfoAuthContext,
  agentId: string,
) {
  const denied = await requireAgentAccess(c, authCtx, agentId);
  if (denied) return denied;

  try {
    const { db, hasTestingData, inProduction } = await resolveAgentWriteDatabase(agentId);
    if (!hasTestingData && !inProduction) {
      return c.json({ error: "Agente no encontrado" }, 404);
    }
    const agentSnap = await db.collection("agent_configurations").doc(agentId).get();
    if (!agentSnap.exists) {
      return c.json({ error: "Agente no encontrado" }, 404);
    }

    const snap = await getImplementationActivityItemsRef(db, agentId)
      .orderBy("createdAt", "desc")
      .limit(ACTIVITY_PAGE_SIZE)
      .get();

    const entries = snap.docs.map((d) => mapActivityDoc(d as QueryDocumentSnapshot));
    return c.json({ entries });
  } catch (error) {
    return handleFirestoreError(c, error, "[implementation activity GET]");
  }
}

export async function createImplementationActivityComment(
  c: Context,
  authCtx: AgentsInfoAuthContext,
  agentId: string,
) {
  const denied = await requireAgentAccess(c, authCtx, agentId);
  if (denied) return denied;

  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "JSON inválido" }, 400);
  }
  if (typeof body !== "object" || body === null) {
    return c.json({ error: "Cuerpo inválido" }, 400);
  }
  const bodyHtmlRaw = (body as { bodyHtml?: unknown }).bodyHtml;
  const parsed = validateCommentBodyHtml(
    typeof bodyHtmlRaw === "string" ? bodyHtmlRaw : "",
  );
  if (!parsed.ok) {
    return c.json({ error: parsed.error }, 400);
  }

  try {
    const { db, hasTestingData, inProduction } = await resolveAgentWriteDatabase(agentId);
    if (!hasTestingData && !inProduction) {
      return c.json({ error: "Agente no encontrado" }, 404);
    }
    const agentSnap = await db.collection("agent_configurations").doc(agentId).get();
    if (!agentSnap.exists) {
      return c.json({ error: "Agente no encontrado" }, 404);
    }

    const actorEmail = authCtx.userEmail?.toLowerCase().trim() || null;
    const now = FieldValue.serverTimestamp();
    const payload = {
      kind: "comment" as const,
      format: "html" as const,
      bodyHtml: parsed.html,
      actorEmail,
      createdAt: now,
    };
    const ref = await getImplementationActivityItemsRef(db, agentId).add(payload);
    const created = await ref.get();
    return c.json({ entry: mapActivityDoc(created as QueryDocumentSnapshot) }, 201);
  } catch (error) {
    return handleFirestoreError(c, error, "[implementation activity POST]");
  }
}
