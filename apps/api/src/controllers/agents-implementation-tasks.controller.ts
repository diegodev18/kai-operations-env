import type { Context } from "hono";
import { FieldValue, type QueryDocumentSnapshot } from "firebase-admin/firestore";

import { getFirestore } from "@/lib/firestore";
import type { AgentsInfoAuthContext } from "@/types/agents";
import { userCanAccessAgent } from "@/utils/agents/agentAccess";
import {
  extractFirestoreIndexUrl,
  firestoreFailureHint,
  isFirebaseConfigError,
} from "@/utils/firestore/errors";
import { isValidEmail } from "@/utils/validation";

type ImplementationTaskStatus = "pending" | "completed";

type ImplementationTaskRow = {
  id: string;
  title: string;
  description?: string;
  status: ImplementationTaskStatus;
  dueDate?: string | null;
  assigneeEmails: string[];
  createdByEmail?: string;
  createdAt?: string | null;
  updatedAt?: string | null;
};

function getTaskItemsCollection(agentId: string) {
  return getFirestore()
    .collection("agent_configurations")
    .doc(agentId)
    .collection("implementation")
    .doc("tasks")
    .collection("items");
}

function normalizeAssigneeEmails(input: unknown): string[] | null {
  if (input == null) return [];
  if (!Array.isArray(input)) return null;
  const normalized = input
    .filter((v): v is string => typeof v === "string")
    .map((email) => email.trim().toLowerCase())
    .filter((email) => email.length > 0);
  if (normalized.some((email) => !isValidEmail(email))) return null;
  return [...new Set(normalized)];
}

function parseDueDate(input: unknown): string | null | undefined {
  if (input === undefined) return undefined;
  if (input === null || input === "") return null;
  if (typeof input !== "string") return undefined;
  const date = new Date(input);
  if (Number.isNaN(date.getTime())) return undefined;
  return date.toISOString();
}

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

function mapTaskDoc(doc: QueryDocumentSnapshot): ImplementationTaskRow {
  const data = doc.data() as Record<string, unknown>;
  const assigneeEmails = normalizeAssigneeEmails(data.assigneeEmails) ?? [];
  const status: ImplementationTaskStatus =
    data.status === "completed" ? "completed" : "pending";
  return {
    id: doc.id,
    title: typeof data.title === "string" ? data.title : "",
    description: typeof data.description === "string" ? data.description : undefined,
    status,
    dueDate: typeof data.dueDate === "string" ? data.dueDate : null,
    assigneeEmails,
    createdByEmail:
      typeof data.createdByEmail === "string" ? data.createdByEmail : undefined,
    createdAt: toIsoOrNull(data.createdAt),
    updatedAt: toIsoOrNull(data.updatedAt),
  };
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
    const database = getFirestore();
    const ok = await userCanAccessAgent(database, authCtx, agentId);
    if (!ok) {
      return c.json({ error: "No autorizado para este agente" }, 403);
    }
    return null;
  } catch (error) {
    return handleFirestoreError(c, error, "[implementation tasks access]");
  }
}

export async function getImplementationTasks(
  c: Context,
  authCtx: AgentsInfoAuthContext,
  agentId: string,
) {
  const denied = await requireAgentAccess(c, authCtx, agentId);
  if (denied) return denied;

  try {
    const itemsRef = getTaskItemsCollection(agentId);
    const [agentSnap, snap] = await Promise.all([
      getFirestore().collection("agent_configurations").doc(agentId).get(),
      itemsRef.orderBy("createdAt", "desc").get(),
    ]);
    if (!agentSnap.exists) {
      return c.json({ error: "Agente no encontrado" }, 404);
    }
    const tasks = snap.docs.map((doc) => mapTaskDoc(doc as QueryDocumentSnapshot));
    return c.json({ tasks });
  } catch (error) {
    return handleFirestoreError(c, error, "[implementation tasks GET]");
  }
}

export async function createImplementationTask(
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

  const titleRaw = (body as { title?: unknown }).title;
  const descriptionRaw = (body as { description?: unknown }).description;
  const dueDateRaw = (body as { dueDate?: unknown }).dueDate;
  const assigneeEmailsRaw = (body as { assigneeEmails?: unknown }).assigneeEmails;

  const title = typeof titleRaw === "string" ? titleRaw.trim() : "";
  if (!title) return c.json({ error: "title es obligatorio" }, 400);
  if (title.length > 220) return c.json({ error: "title demasiado largo" }, 400);

  const description =
    typeof descriptionRaw === "string" ? descriptionRaw.trim() : undefined;
  const dueDate = parseDueDate(dueDateRaw);
  if (dueDateRaw !== undefined && dueDate === undefined) {
    return c.json({ error: "dueDate debe ser ISO válido o null" }, 400);
  }

  const assigneeEmails = normalizeAssigneeEmails(assigneeEmailsRaw);
  if (assigneeEmails == null) {
    return c.json(
      { error: "assigneeEmails debe ser un array de emails válidos" },
      400,
    );
  }

  try {
    const agentRef = getFirestore().collection("agent_configurations").doc(agentId);
    const agentSnap = await agentRef.get();
    if (!agentSnap.exists) {
      return c.json({ error: "Agente no encontrado" }, 404);
    }
    const now = FieldValue.serverTimestamp();
    const payload = {
      title,
      description: description || "",
      status: "pending" as ImplementationTaskStatus,
      dueDate: dueDate ?? null,
      assigneeEmails,
      createdByEmail: authCtx.userEmail?.toLowerCase().trim() || null,
      createdAt: now,
      updatedAt: now,
    };
    const docRef = await getTaskItemsCollection(agentId).add(payload);
    const created = await docRef.get();
    return c.json(
      { task: mapTaskDoc(created as QueryDocumentSnapshot) },
      201,
    );
  } catch (error) {
    return handleFirestoreError(c, error, "[implementation tasks POST]");
  }
}

export async function patchImplementationTask(
  c: Context,
  authCtx: AgentsInfoAuthContext,
  agentId: string,
  taskId: string,
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

  const patch: Record<string, unknown> = { updatedAt: FieldValue.serverTimestamp() };
  const hasStatus = Object.prototype.hasOwnProperty.call(body, "status");
  if (hasStatus) {
    const statusRaw = (body as { status?: unknown }).status;
    if (statusRaw !== "pending" && statusRaw !== "completed") {
      return c.json({ error: "status inválido" }, 400);
    }
    patch.status = statusRaw;
  }

  if (Object.prototype.hasOwnProperty.call(body, "dueDate")) {
    const dueDateRaw = (body as { dueDate?: unknown }).dueDate;
    const dueDate = parseDueDate(dueDateRaw);
    if (dueDate === undefined) {
      return c.json({ error: "dueDate debe ser ISO válido o null" }, 400);
    }
    patch.dueDate = dueDate;
  }

  if (Object.prototype.hasOwnProperty.call(body, "assigneeEmails")) {
    const assigneeEmails = normalizeAssigneeEmails(
      (body as { assigneeEmails?: unknown }).assigneeEmails,
    );
    if (assigneeEmails == null) {
      return c.json(
        { error: "assigneeEmails debe ser un array de emails válidos" },
        400,
      );
    }
    patch.assigneeEmails = assigneeEmails;
  }

  if (Object.keys(patch).length === 1) {
    return c.json(
      { error: "No hay campos para actualizar (status, dueDate, assigneeEmails)" },
      400,
    );
  }

  try {
    const agentRef = getFirestore().collection("agent_configurations").doc(agentId);
    const [agentSnap, taskSnap] = await Promise.all([
      agentRef.get(),
      getTaskItemsCollection(agentId).doc(taskId).get(),
    ]);
    if (!agentSnap.exists) {
      return c.json({ error: "Agente no encontrado" }, 404);
    }
    if (!taskSnap.exists) {
      return c.json({ error: "Tarea no encontrada" }, 404);
    }

    await taskSnap.ref.set(patch, { merge: true });
    const updated = await taskSnap.ref.get();
    return c.json({ task: mapTaskDoc(updated as QueryDocumentSnapshot) });
  } catch (error) {
    return handleFirestoreError(c, error, "[implementation tasks PATCH]");
  }
}
