import type { Context } from "hono";
import {
  FieldValue,
  type Firestore,
  type QueryDocumentSnapshot,
} from "firebase-admin/firestore";

import type { AgentsInfoAuthContext } from "@/types/agents";
import { resolveAgentWriteDatabase, userCanAccessAgent } from "@/utils/agents";
import {
  extractFirestoreIndexUrl,
  firestoreFailureHint,
  isFirebaseConfigError,
} from "@/utils/firestore/errors";
import { isValidEmail } from "@/utils/validation";

type ImplementationTaskStatus = "pending" | "completed";

type ImplementationTaskType =
  | "connect-number"
  | "csf-request"
  | "payment-domiciliation"
  | "quote-sent"
  | "representative-contact"
  | "custom";

type ImplementationTaskAttachment = {
  name: string;
  url: string;
  uploadedAt: string;
};

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
  mandatory?: boolean;
  taskType?: ImplementationTaskType;
  attachments?: ImplementationTaskAttachment[];
  representativeEmail?: string | null;
  representativePhone?: string | null;
};

const MANDATORY_TASKS: Array<{
  id: string;
  title: string;
  taskType: ImplementationTaskType;
  description: string;
}> = [
  {
    id: "mandatory-connect-number",
    title: "Conectar número",
    taskType: "connect-number",
    description:
      "Conectar el número de WhatsApp del cliente. Se marcará automáticamente cuando exista una integración vinculada en el sistema.",
  },
  {
    id: "mandatory-csf-request",
    title: "Adjuntar constancia de situación fiscal (CSF)",
    taskType: "csf-request",
    description: "Adjuntar el PDF o archivo de la constancia de situación fiscal del cliente.",
  },
  {
    id: "mandatory-payment-domiciliation",
    title: "Domiciliación del pago",
    taskType: "payment-domiciliation",
    description: "Definir si el cliente está domiciliado o no (mismo estado que en la Home de Operaciones).",
  },
  {
    id: "mandatory-quote-sent",
    title: "Adjuntar cotización",
    taskType: "quote-sent",
    description: "Adjuntar el documento de cotización enviada al cliente.",
  },
  {
    id: "mandatory-representative-contact",
    title: "Correo o teléfono del representante",
    taskType: "representative-contact",
    description: "Registrar el correo y/o el número de WhatsApp del representante del cliente.",
  },
];

const MANDATORY_BY_ID = new Map(MANDATORY_TASKS.map((m) => [m.id, m]));

function getTaskItemsCollection(db: Firestore, agentId: string) {
  return db
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

function parseRepresentativeEmail(input: unknown): string | null | undefined {
  if (input === undefined) return undefined;
  if (input === null || input === "") return null;
  if (typeof input !== "string") return undefined;
  const t = input.trim().toLowerCase();
  if (!t) return null;
  if (!isValidEmail(t)) return undefined;
  return t;
}

function parseRepresentativePhone(input: unknown): string | null | undefined {
  if (input === undefined) return undefined;
  if (input === null || input === "") return null;
  if (typeof input !== "string") return undefined;
  const t = input.trim();
  if (!t) return null;
  if (t.length > 80) return undefined;
  return t;
}

function parseAttachments(input: unknown): ImplementationTaskAttachment[] | null | undefined {
  if (input === undefined) return undefined;
  if (input === null || !Array.isArray(input)) return null;
  const parsed: ImplementationTaskAttachment[] = [];
  for (const item of input) {
    if (
      typeof item === "object" &&
      item !== null &&
      typeof (item as { name?: unknown }).name === "string" &&
      typeof (item as { url?: unknown }).url === "string" &&
      typeof (item as { uploadedAt?: unknown }).uploadedAt === "string"
    ) {
      parsed.push({
        name: (item as { name: string }).name,
        url: (item as { url: string }).url,
        uploadedAt: (item as { uploadedAt: string }).uploadedAt,
      });
    } else {
      return null;
    }
  }
  return parsed;
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

  const attachmentsRaw = data.attachments;
  let attachments: ImplementationTaskAttachment[] | undefined;
  if (Array.isArray(attachmentsRaw)) {
    attachments = attachmentsRaw
      .filter((a): a is Record<string, unknown> => typeof a === "object" && a !== null)
      .map((a) => ({
        name: typeof a.name === "string" ? a.name : "",
        url: typeof a.url === "string" ? a.url : "",
        uploadedAt: typeof a.uploadedAt === "string" ? a.uploadedAt : "",
      }))
      .filter((a) => a.name && a.url);
  }

  let representativeEmail: string | null | undefined;
  if (data.representativeEmail === null) representativeEmail = null;
  else if (typeof data.representativeEmail === "string") {
    const t = data.representativeEmail.trim().toLowerCase();
    representativeEmail = t.length > 0 ? t : null;
  }
  let representativePhone: string | null | undefined;
  if (data.representativePhone === null) representativePhone = null;
  else if (typeof data.representativePhone === "string") {
    const t = data.representativePhone.trim();
    representativePhone = t.length > 0 ? t : null;
  }

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
    mandatory: data.mandatory === true,
    taskType: typeof data.taskType === "string" ? (data.taskType as ImplementationTaskType) : "custom",
    attachments,
    ...(representativeEmail !== undefined ? { representativeEmail } : {}),
    ...(representativePhone !== undefined ? { representativePhone } : {}),
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
    const ok = await userCanAccessAgent(authCtx, agentId);
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
    const { db, hasTestingData, inProduction } =
      await resolveAgentWriteDatabase(agentId);
    if (!hasTestingData && !inProduction) {
      return c.json({ error: "Agente no encontrado" }, 404);
    }
    const itemsRef = getTaskItemsCollection(db, agentId);
    const [agentSnap, snap] = await Promise.all([
      db.collection("agent_configurations").doc(agentId).get(),
      itemsRef.orderBy("createdAt", "desc").get(),
    ]);
    if (!agentSnap.exists) {
      return c.json({ error: "Agente no encontrado" }, 404);
    }

    let existingTasks = snap.docs.map((doc) => mapTaskDoc(doc as QueryDocumentSnapshot));
    const existingIds = new Set(existingTasks.map((t) => t.id));

    const now = FieldValue.serverTimestamp();
    const missingMandatory = MANDATORY_TASKS.filter((mt) => !existingIds.has(mt.id));
    for (const mt of missingMandatory) {
      const payload = {
        id: mt.id,
        title: mt.title,
        description: mt.description,
        status: "pending" as ImplementationTaskStatus,
        dueDate: null,
        assigneeEmails: [],
        createdByEmail: null,
        mandatory: true,
        taskType: mt.taskType,
        attachments: [],
        createdAt: now,
        updatedAt: now,
      };
      await itemsRef.doc(mt.id).set(payload);
    }

    if (missingMandatory.length > 0) {
      const refreshed = await itemsRef.orderBy("createdAt", "desc").get();
      existingTasks = refreshed.docs.map((doc) => mapTaskDoc(doc as QueryDocumentSnapshot));
    }

    let templateSyncChanged = false;
    for (const task of existingTasks) {
      const mt = MANDATORY_BY_ID.get(task.id);
      if (!mt) continue;
      const desc = task.description ?? "";
      if (task.title !== mt.title || desc !== mt.description) {
        await itemsRef.doc(task.id).set(
          {
            title: mt.title,
            description: mt.description,
            updatedAt: FieldValue.serverTimestamp(),
          },
          { merge: true },
        );
        templateSyncChanged = true;
      }
    }

    const tasks = templateSyncChanged
      ? (await itemsRef.orderBy("createdAt", "desc").get()).docs.map((doc) =>
          mapTaskDoc(doc as QueryDocumentSnapshot),
        )
      : existingTasks;

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
  const attachmentsRaw = (body as { attachments?: unknown }).attachments;

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

  const attachments = parseAttachments(attachmentsRaw);
  if (attachmentsRaw !== undefined && attachments === null) {
    return c.json({ error: "attachments debe ser un array de objetos válidos" }, 400);
  }

  try {
    const { db, hasTestingData, inProduction } =
      await resolveAgentWriteDatabase(agentId);
    if (!hasTestingData && !inProduction) {
      return c.json({ error: "Agente no encontrado" }, 404);
    }
    const agentRef = db.collection("agent_configurations").doc(agentId);
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
      ...(attachments ? { attachments } : {}),
    };
    const docRef = await getTaskItemsCollection(db, agentId).add(payload);
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

  if (Object.prototype.hasOwnProperty.call(body, "attachments")) {
    const attachmentsRaw = (body as { attachments?: unknown }).attachments;
    if (!Array.isArray(attachmentsRaw)) {
      return c.json({ error: "attachments debe ser un array" }, 400);
    }
    const attachments = attachmentsRaw
      .filter((a): a is Record<string, unknown> => typeof a === "object" && a !== null)
      .map((a) => ({
        name: typeof a.name === "string" ? a.name.trim() : "",
        url: typeof a.url === "string" ? a.url.trim() : "",
        uploadedAt: typeof a.uploadedAt === "string" ? a.uploadedAt : new Date().toISOString(),
      }))
      .filter((a) => a.name && a.url);
    patch.attachments = attachments;
  }

  if (Object.prototype.hasOwnProperty.call(body, "representativeEmail")) {
    const v = parseRepresentativeEmail((body as { representativeEmail?: unknown }).representativeEmail);
    if (v === undefined) {
      return c.json({ error: "representativeEmail inválido" }, 400);
    }
    patch.representativeEmail = v;
  }

  if (Object.prototype.hasOwnProperty.call(body, "representativePhone")) {
    const v = parseRepresentativePhone((body as { representativePhone?: unknown }).representativePhone);
    if (v === undefined) {
      return c.json({ error: "representativePhone inválido" }, 400);
    }
    patch.representativePhone = v;
  }

  if (Object.keys(patch).length === 1) {
    return c.json(
      {
        error:
          "No hay campos para actualizar (status, dueDate, assigneeEmails, attachments, representativeEmail, representativePhone)",
      },
      400,
    );
  }

  try {
    const { db, hasTestingData, inProduction } =
      await resolveAgentWriteDatabase(agentId);
    if (!hasTestingData && !inProduction) {
      return c.json({ error: "Agente no encontrado" }, 404);
    }
    const agentRef = db.collection("agent_configurations").doc(agentId);
    const [agentSnap, taskSnap] = await Promise.all([
      agentRef.get(),
      getTaskItemsCollection(db, agentId).doc(taskId).get(),
    ]);
    if (!agentSnap.exists) {
      return c.json({ error: "Agente no encontrado" }, 404);
    }
    if (!taskSnap.exists) {
      return c.json({ error: "Tarea no encontrada" }, 404);
    }

    const existing = mapTaskDoc(taskSnap as QueryDocumentSnapshot);

    if (hasStatus && patch.status === "completed" && existing.taskType === "representative-contact") {
      const mergedEmail =
        Object.prototype.hasOwnProperty.call(patch, "representativeEmail")
          ? (patch.representativeEmail as string | null)
          : (existing.representativeEmail ?? null);
      const mergedPhone =
        Object.prototype.hasOwnProperty.call(patch, "representativePhone")
          ? (patch.representativePhone as string | null)
          : (existing.representativePhone ?? null);
      const hasRep = Boolean(
        (mergedEmail != null && mergedEmail !== "") || (mergedPhone != null && mergedPhone !== ""),
      );
      if (!hasRep) {
        return c.json(
          {
            error:
              "Indica al menos el correo o el teléfono del representante para completar la tarea.",
          },
          400,
        );
      }
    }

    await taskSnap.ref.set(patch, { merge: true });
    const updated = await taskSnap.ref.get();
    return c.json({ task: mapTaskDoc(updated as QueryDocumentSnapshot) });
  } catch (error) {
    return handleFirestoreError(c, error, "[implementation tasks PATCH]");
  }
}
