import type { Context } from "hono";
import type { QueryDocumentSnapshot } from "firebase-admin/firestore";
import { FieldValue } from "firebase-admin/firestore";

import type { AgentsInfoAuthContext } from "@/types/agents-types";
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
    ...(typeof data.taskId === "string" ? { taskId: data.taskId } : {}),
  };
  if (kind === "comment") {
    base.format = data.format === "html" ? "html" : "html";
    base.bodyHtml = typeof data.bodyHtml === "string" ? data.bodyHtml : "";
    base.hidden = data.hidden === true;
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

    const taskIdFilter = c.req.query("taskId");
    let query = getImplementationActivityItemsRef(db, agentId)
      .orderBy("createdAt", "desc")
      .limit(ACTIVITY_PAGE_SIZE);

    if (taskIdFilter) {
      query = getImplementationActivityItemsRef(db, agentId)
        .where("taskId", "==", taskIdFilter)
        .orderBy("createdAt", "desc")
        .limit(ACTIVITY_PAGE_SIZE);
    }

    const snap = await query.get();
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
  const taskIdRaw = (body as { taskId?: unknown }).taskId;
  const taskId = typeof taskIdRaw === "string" && taskIdRaw.trim().length > 0
    ? taskIdRaw.trim()
    : null;

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
    const payload: Record<string, unknown> = {
      kind: "comment" as const,
      format: "html" as const,
      bodyHtml: parsed.html,
      actorEmail,
      hidden: false,
      createdAt: now,
      ...(taskId ? { taskId } : {}),
    };
    const ref = await getImplementationActivityItemsRef(db, agentId).add(payload);
    const created = await ref.get();
    return c.json({ entry: mapActivityDoc(created as QueryDocumentSnapshot) }, 201);
  } catch (error) {
    return handleFirestoreError(c, error, "[implementation activity POST]");
  }
}

export async function patchImplementationActivityCommentVisibility(
  c: Context,
  authCtx: AgentsInfoAuthContext,
  agentId: string,
  entryId: string,
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
  const hiddenRaw = (body as { hidden?: unknown }).hidden;
  if (typeof hiddenRaw !== "boolean") {
    return c.json({ error: "hidden debe ser booleano" }, 400);
  }

  try {
    const { db, hasTestingData, inProduction } =
      await resolveAgentWriteDatabase(agentId);
    if (!hasTestingData && !inProduction) {
      return c.json({ error: "Agente no encontrado" }, 404);
    }
    const agentSnap = await db.collection("agent_configurations").doc(agentId).get();
    if (!agentSnap.exists) {
      return c.json({ error: "Agente no encontrado" }, 404);
    }

    const actorEmail = authCtx.userEmail?.toLowerCase().trim() || null;
    if (!actorEmail) {
      return c.json({ error: "No autorizado" }, 403);
    }

    const entryRef = getImplementationActivityItemsRef(db, agentId).doc(entryId);
    const entrySnap = await entryRef.get();
    if (!entrySnap.exists) {
      return c.json({ error: "Comentario no encontrado" }, 404);
    }

    const data = entrySnap.data() as Record<string, unknown>;
    if (data.kind !== "comment") {
      return c.json({ error: "Solo se pueden ocultar comentarios" }, 400);
    }
    const entryActorEmail =
      typeof data.actorEmail === "string"
        ? data.actorEmail.toLowerCase().trim()
        : null;
    if (entryActorEmail !== actorEmail) {
      return c.json({ error: "Solo el autor puede ocultar o mostrar este comentario" }, 403);
    }

    await entryRef.update({
      hidden: hiddenRaw,
      hiddenByEmail: actorEmail,
      hiddenAt: FieldValue.serverTimestamp(),
    });
    const updatedSnap = await entryRef.get();
    return c.json({ entry: mapActivityDoc(updatedSnap as QueryDocumentSnapshot) });
  } catch (error) {
    return handleFirestoreError(c, error, "[implementation activity PATCH]");
  }
}
