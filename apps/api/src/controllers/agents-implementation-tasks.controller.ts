import type { Context } from "hono";
import {
  FieldValue,
  type Firestore,
  type CollectionReference,
  type QueryDocumentSnapshot,
} from "firebase-admin/firestore";

import type { AgentsInfoAuthContext } from "@/types/agents-types";
import { getFirestore } from "@/lib/firestore";
import { resolveAgentWriteDatabase, userCanAccessAgent } from "@/utils/agents";
import { parseAgentDocFromData } from "@/utils/agents/parseAgentDoc";
import { lifecycleSummaryFromFirestoreData } from "@/utils/agents/lifecycle-doc";
import { appendImplementationActivityEntry } from "@/services/implementation-activity.service";
import { isOperationsAdmin, isOperationsCommercial } from "@/utils/operations-access";
import {
  extractFirestoreIndexUrl,
  firestoreFailureHint,
  isFirebaseConfigError,
} from "@/utils/firestore/errors";
import { isValidEmail } from "@/utils/validation";

type ImplementationTaskStatus =
  | "pending"
  | "backlog"
  | "todo"
  | "in_progress"
  | "in_review"
  | "testing"
  | "completed"
  | "blocked"
  | "cancelled";

type ImplementationTaskPriority = "urgent" | "high" | "medium" | "low" | "none";

const VALID_STATUSES = new Set<ImplementationTaskStatus>([
  "pending",
  "backlog",
  "todo",
  "in_progress",
  "in_review",
  "testing",
  "completed",
  "blocked",
  "cancelled",
]);

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
  priority?: ImplementationTaskPriority;
  publicId?: number;
  parentTaskId?: string | null;
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

type GlobalImplementationTaskRow = ImplementationTaskRow & {
  taskKey: string;
  agentId: string;
  agentName: string;
  businessName: string;
  agentStatus: "active" | "archived";
  growers: Array<{ email: string; name: string }>;
  lifecycleSummary?: {
    commercialStatus: string;
    estimatedDeliveryAt: string | null;
  };
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

async function syncMandatoryTasks(
  itemsRef: CollectionReference,
  existingTasks: ImplementationTaskRow[],
): Promise<{ tasks: ImplementationTaskRow[]; changed: boolean }> {
  const existingIds = new Set(existingTasks.map((t) => t.id));
  const now = FieldValue.serverTimestamp();
  const missingMandatory = MANDATORY_TASKS.filter((mt) => !existingIds.has(mt.id));

  for (const mt of missingMandatory) {
    const payload = {
      id: mt.id,
      title: mt.title,
      description: mt.description,
      status: "todo" as ImplementationTaskStatus,
      priority: "high" as ImplementationTaskPriority,
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

  if (missingMandatory.length === 0 && !templateSyncChanged) {
    return { tasks: existingTasks, changed: false };
  }

  const refreshed = await itemsRef.orderBy("createdAt", "desc").get();
  return {
    tasks: refreshed.docs.map((doc) => mapTaskDoc(doc as QueryDocumentSnapshot)),
    changed: true,
  };
}

function getMetaDocRef(db: Firestore, agentId: string) {
  return db
    .collection("agent_configurations")
    .doc(agentId)
    .collection("implementation")
    .doc("meta");
}

async function getNextPublicId(db: Firestore, agentId: string): Promise<number> {
  const metaRef = getMetaDocRef(db, agentId);
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(metaRef);
    const current =
      snap.exists && typeof (snap.data() as Record<string, unknown>)?.taskCounter === "number"
        ? ((snap.data() as Record<string, unknown>).taskCounter as number)
        : 0;
    const next = current + 1;
    tx.set(metaRef, { taskCounter: next }, { merge: true });
    return next;
  });
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
  const rawStatus = typeof data.status === "string" ? data.status : "todo";
  const status: ImplementationTaskStatus = VALID_STATUSES.has(rawStatus as ImplementationTaskStatus)
    ? (rawStatus === "pending" ? "todo" : (rawStatus as ImplementationTaskStatus))
    : "todo";

  const VALID_PRIORITIES = new Set<ImplementationTaskPriority>(["urgent", "high", "medium", "low", "none"]);
  const rawPriority = typeof data.priority === "string" ? data.priority : "none";
  const priority: ImplementationTaskPriority = VALID_PRIORITIES.has(rawPriority as ImplementationTaskPriority)
    ? (rawPriority as ImplementationTaskPriority)
    : "none";

  const publicId = typeof data.publicId === "number" ? data.publicId : undefined;
  const parentTaskId =
    typeof data.parentTaskId === "string" ? data.parentTaskId
    : data.parentTaskId === null ? null
    : undefined;

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
    priority,
    ...(publicId !== undefined ? { publicId } : {}),
    ...(parentTaskId !== undefined ? { parentTaskId } : {}),
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

function normalizeAgentStatus(value: unknown): "active" | "archived" {
  return value === "archived" ? "archived" : "active";
}

function parseCsvSet(value: string | undefined): Set<string> {
  if (!value) return new Set();
  return new Set(
    value
      .split(",")
      .map((item) => item.trim().toLowerCase())
      .filter(Boolean),
  );
}

function taskMatchesDueFilter(task: ImplementationTaskRow, due: string | undefined): boolean {
  if (!due || due === "all") return true;
  const date = task.dueDate ? new Date(task.dueDate) : null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const endOfWeek = new Date(today);
  endOfWeek.setDate(today.getDate() + 7);
  if (due === "none") return !date;
  if (!date || Number.isNaN(date.getTime())) return false;
  const taskDay = new Date(date);
  taskDay.setHours(0, 0, 0, 0);
  if (due === "overdue") return taskDay < today;
  if (due === "today") return taskDay.getTime() === today.getTime();
  if (due === "week") return taskDay >= today && taskDay <= endOfWeek;
  return true;
}

function globalTaskMatchesQuery(task: GlobalImplementationTaskRow, q: string): boolean {
  if (!q) return true;
  const haystack = [
    task.title,
    task.description ?? "",
    task.agentName,
    task.businessName,
    task.agentId,
    task.publicId != null ? `agt-${task.publicId}` : "",
    ...task.assigneeEmails,
  ].join(" ").toLowerCase();
  return haystack.includes(q);
}

function compareGlobalTasks(a: GlobalImplementationTaskRow, b: GlobalImplementationTaskRow): number {
  const statusWeight = (task: GlobalImplementationTaskRow) => {
    if (task.status === "blocked") return 0;
    if (task.status === "completed" || task.status === "cancelled") return 4;
    return 1;
  };
  const priorityWeight: Record<ImplementationTaskPriority, number> = {
    urgent: 0,
    high: 1,
    medium: 2,
    low: 3,
    none: 4,
  };
  const sw = statusWeight(a) - statusWeight(b);
  if (sw !== 0) return sw;
  const pw = priorityWeight[a.priority ?? "none"] - priorityWeight[b.priority ?? "none"];
  if (pw !== 0) return pw;
  const aDue = a.dueDate ? new Date(a.dueDate).getTime() : Number.MAX_SAFE_INTEGER;
  const bDue = b.dueDate ? new Date(b.dueDate).getTime() : Number.MAX_SAFE_INTEGER;
  if (aDue !== bDue) return aDue - bDue;
  const aUpdated = a.updatedAt ? new Date(a.updatedAt).getTime() : 0;
  const bUpdated = b.updatedAt ? new Date(b.updatedAt).getTime() : 0;
  return bUpdated - aUpdated;
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

    const existingTasks = snap.docs.map((doc) => mapTaskDoc(doc as QueryDocumentSnapshot));
    const { tasks } = await syncMandatoryTasks(itemsRef, existingTasks);

    return c.json({ tasks });
  } catch (error) {
    return handleFirestoreError(c, error, "[implementation tasks GET]");
  }
}

export async function getGlobalImplementationTasksOverview(
  c: Context,
  authCtx: AgentsInfoAuthContext,
) {
  const admin = isOperationsAdmin(authCtx.userRole);
  const commercial = isOperationsCommercial(authCtx.userRole);
  const isPrivileged = admin || commercial;
  const q = c.req.query("q")?.trim().toLowerCase() ?? "";
  const statusSet = parseCsvSet(c.req.query("status"));
  const prioritySet = parseCsvSet(c.req.query("priority"));
  const assignee = c.req.query("assignee")?.trim().toLowerCase();
  const agentIdFilter = c.req.query("agentId")?.trim();
  const dueFilter = c.req.query("due")?.trim();
  const cursorRaw = c.req.query("cursor")?.trim();
  const cursor = cursorRaw != null && cursorRaw !== "" ? Number(cursorRaw) : 0;
  const limitRaw = Number(c.req.query("limit") ?? 100);
  const limit = Math.max(1, Math.min(200, Number.isFinite(limitRaw) ? Math.floor(limitRaw) : 100));
  const archivedMode = c.req.query("archived");

  try {
    const db = getFirestore();
    const agentDocs = agentIdFilter
      ? [await db.collection("agent_configurations").doc(agentIdFilter).get()]
      : (await db.collection("agent_configurations").get()).docs;

    const rows: GlobalImplementationTaskRow[] = [];

    await Promise.all(
      agentDocs.map(async (agentSnap) => {
        if (!agentSnap.exists) return;
        const agentId = agentSnap.id;
        const agentData = agentSnap.data() as Record<string, unknown>;
        const agentStatus = normalizeAgentStatus(agentData.status);
        if (archivedMode === "only" && agentStatus !== "archived") return;
        if (archivedMode !== "include" && archivedMode !== "only" && agentStatus === "archived") {
          return;
        }
        if (!isPrivileged) {
          const canAccess = await userCanAccessAgent(authCtx, agentId);
          if (!canAccess) return;
        }

        const parsed = parseAgentDocFromData(agentId, agentData, false);
        if (!parsed) return;

        const agentRef = db.collection("agent_configurations").doc(agentId);
        const [growersSnap, lifecycleSnap, tasksSnap] = await Promise.all([
          agentRef.collection("growers").get(),
          agentRef.collection("implementation").doc("lifecycle").get(),
          getTaskItemsCollection(db, agentId).orderBy("createdAt", "desc").get(),
        ]);
        const growers = growersSnap.docs.map((doc) => {
          const data = doc.data() as Record<string, unknown>;
          const email = typeof data.email === "string"
            ? data.email.trim().toLowerCase()
            : doc.id.includes("@")
              ? doc.id.trim().toLowerCase()
              : "";
          const name = typeof data.name === "string" ? data.name.trim() : "";
          return { email, name: name || email };
        }).filter((grower) => grower.email);

        const existingTasks = tasksSnap.docs.map((doc) => mapTaskDoc(doc as QueryDocumentSnapshot));
        const { tasks } = await syncMandatoryTasks(
          getTaskItemsCollection(db, agentId),
          existingTasks,
        );
        const lifecycleSummary = lifecycleSnap.exists
          ? lifecycleSummaryFromFirestoreData(lifecycleSnap.data() as Record<string, unknown>)
          : undefined;

        for (const task of tasks) {
          if (statusSet.size > 0 && !statusSet.has(task.status)) continue;
          if (prioritySet.size > 0 && !prioritySet.has(task.priority ?? "none")) continue;
          if (assignee === "unassigned" && task.assigneeEmails.length > 0) continue;
          if (assignee && assignee !== "all" && assignee !== "unassigned" && !task.assigneeEmails.includes(assignee)) {
            continue;
          }
          if (!taskMatchesDueFilter(task, dueFilter)) continue;

          const row: GlobalImplementationTaskRow = {
            ...task,
            taskKey: `${agentId}:${task.id}`,
            agentId,
            agentName: parsed.agentName || parsed.businessName || agentId,
            businessName: parsed.businessName || parsed.agentName || agentId,
            agentStatus,
            growers,
            ...(lifecycleSummary != null ? { lifecycleSummary } : {}),
          };
          if (!globalTaskMatchesQuery(row, q)) continue;
          rows.push(row);
        }
      }),
    );

    rows.sort(compareGlobalTasks);
    const start = Number.isFinite(cursor) && cursor > 0 ? cursor : 0;
    const page = rows.slice(start, start + limit);
    const nextCursor = start + limit < rows.length ? String(start + limit) : null;

    return c.json({
      tasks: page,
      total: rows.length,
      nextCursor,
    });
  } catch (error) {
    return handleFirestoreError(c, error, "[implementation tasks overview]");
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
  const priorityRaw = (body as { priority?: unknown }).priority;
  const parentTaskIdRaw = (body as { parentTaskId?: unknown }).parentTaskId;

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

  const VALID_PRIORITIES_SET = new Set(["urgent", "high", "medium", "low", "none"]);
  const priority: ImplementationTaskPriority =
    typeof priorityRaw === "string" && VALID_PRIORITIES_SET.has(priorityRaw)
      ? (priorityRaw as ImplementationTaskPriority)
      : "none";

  const parentTaskId =
    parentTaskIdRaw === null ? null
    : typeof parentTaskIdRaw === "string" && parentTaskIdRaw.length > 0
      ? parentTaskIdRaw
      : undefined;

  try {
    const { db, hasTestingData, inProduction } =
      await resolveAgentWriteDatabase(agentId);
    if (!hasTestingData && !inProduction) {
      return c.json({ error: "Agente no encontrado" }, 404);
    }
    const publicId = await getNextPublicId(db, agentId);
    const now = FieldValue.serverTimestamp();
    const payload: Record<string, unknown> = {
      title,
      description: description || "",
      status: "todo" as ImplementationTaskStatus,
      priority,
      publicId,
      dueDate: dueDate ?? null,
      assigneeEmails,
      createdByEmail: authCtx.userEmail?.toLowerCase().trim() || null,
      createdAt: now,
      updatedAt: now,
      ...(attachments ? { attachments } : {}),
      ...(parentTaskId !== undefined ? { parentTaskId } : {}),
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
    if (!VALID_STATUSES.has(statusRaw as ImplementationTaskStatus)) {
      return c.json({ error: "status inválido" }, 400);
    }
    patch.status = statusRaw;
  }

  if (Object.prototype.hasOwnProperty.call(body, "priority")) {
    const priorityRaw = (body as { priority?: unknown }).priority;
    const VALID_PRIORITIES_PATCH = new Set(["urgent", "high", "medium", "low", "none"]);
    if (priorityRaw !== undefined && !VALID_PRIORITIES_PATCH.has(priorityRaw as string)) {
      return c.json({ error: "priority inválido" }, 400);
    }
    patch.priority = priorityRaw ?? "none";
  }

  if (Object.prototype.hasOwnProperty.call(body, "parentTaskId")) {
    const parentTaskIdRaw = (body as { parentTaskId?: unknown }).parentTaskId;
    if (parentTaskIdRaw !== null && typeof parentTaskIdRaw !== "string") {
      return c.json({ error: "parentTaskId debe ser string o null" }, 400);
    }
    patch.parentTaskId = typeof parentTaskIdRaw === "string" && parentTaskIdRaw.trim().length > 0
      ? parentTaskIdRaw.trim()
      : null;
  }

  if (Object.prototype.hasOwnProperty.call(body, "description")) {
    const descriptionRaw = (body as { description?: unknown }).description;
    if (descriptionRaw !== undefined && typeof descriptionRaw !== "string") {
      return c.json({ error: "description debe ser string" }, 400);
    }
    patch.description = typeof descriptionRaw === "string" ? descriptionRaw : "";
  }

  if (Object.prototype.hasOwnProperty.call(body, "title")) {
    const titleRaw = (body as { title?: unknown }).title;
    if (typeof titleRaw !== "string") {
      return c.json({ error: "title debe ser string" }, 400);
    }
    const title = titleRaw.trim();
    if (!title) return c.json({ error: "title es obligatorio" }, 400);
    if (title.length > 220) return c.json({ error: "title demasiado largo" }, 400);
    patch.title = title;
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
          "No hay campos para actualizar (title, status, priority, description, dueDate, assigneeEmails, attachments, representativeEmail, representativePhone, parentTaskId)",
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

    // Activity logging — fire-and-forget
    const actorEmail = authCtx.userEmail?.toLowerCase().trim() || null;
    const STATUS_LABELS: Record<string, string> = {
      backlog: "Backlog", todo: "Por hacer", in_progress: "En progreso",
      in_review: "En revisión", testing: "En pruebas", completed: "Completada",
      blocked: "Bloqueada", cancelled: "Cancelada", pending: "Por hacer",
    };
    const PRIORITY_LABELS: Record<string, string> = {
      urgent: "Urgente", high: "Alta", medium: "Media", low: "Baja", none: "Sin prioridad",
    };
    const logBase = { kind: "system" as const, actorEmail, taskId };

    if (hasStatus && patch.status !== existing.status) {
      void appendImplementationActivityEntry(db, agentId, {
        ...logBase, action: "task_status_changed",
        summary: `cambió el estado de "${STATUS_LABELS[existing.status] ?? existing.status}" a "${STATUS_LABELS[patch.status as string] ?? patch.status}"`,
        metadata: { from: existing.status, to: patch.status },
      });
    }
    if (Object.prototype.hasOwnProperty.call(patch, "priority") && patch.priority !== existing.priority) {
      void appendImplementationActivityEntry(db, agentId, {
        ...logBase, action: "task_priority_changed",
        summary: `cambió la prioridad de "${PRIORITY_LABELS[existing.priority ?? "none"] ?? existing.priority}" a "${PRIORITY_LABELS[patch.priority as string] ?? patch.priority}"`,
        metadata: { from: existing.priority, to: patch.priority },
      });
    }
    if (Object.prototype.hasOwnProperty.call(patch, "dueDate") && patch.dueDate !== existing.dueDate) {
      const newDate = patch.dueDate as string | null;
      void appendImplementationActivityEntry(db, agentId, {
        ...logBase, action: "task_due_date_changed",
        summary: newDate
          ? `cambió la fecha de vencimiento a ${new Date(newDate).toLocaleDateString("es-MX", { dateStyle: "medium" })}`
          : "eliminó la fecha de vencimiento",
        metadata: { from: existing.dueDate, to: newDate },
      });
    }
    if (Object.prototype.hasOwnProperty.call(patch, "description") && patch.description !== existing.description) {
      const previousDescription = existing.description ?? "";
      const nextDescription = typeof patch.description === "string" ? patch.description : "";
      const wasEmpty = previousDescription.trim().length === 0;
      const isEmpty = nextDescription.trim().length === 0;
      const summary = isEmpty
        ? "eliminó la descripción"
        : wasEmpty
          ? "agregó una descripción"
          : "actualizó la descripción";
      void appendImplementationActivityEntry(db, agentId, {
        ...logBase,
        action: "task_description_changed",
        summary,
        metadata: {
          fromLength: previousDescription.length,
          toLength: nextDescription.length,
        },
      });
    }
    if (Object.prototype.hasOwnProperty.call(patch, "title") && patch.title !== existing.title) {
      const previousTitle = existing.title ?? "";
      const nextTitle = typeof patch.title === "string" ? patch.title : "";
      void appendImplementationActivityEntry(db, agentId, {
        ...logBase,
        action: "task_title_changed",
        summary: `renombró la tarea de "${previousTitle}" a "${nextTitle}"`,
        metadata: {
          from: previousTitle,
          to: nextTitle,
        },
      });
    }
    if (Object.prototype.hasOwnProperty.call(patch, "assigneeEmails")) {
      const oldSet = new Set(existing.assigneeEmails);
      const newEmails = patch.assigneeEmails as string[];
      const newSet = new Set(newEmails);
      const added = newEmails.filter((e) => !oldSet.has(e));
      const removed = existing.assigneeEmails.filter((e) => !newSet.has(e));
      for (const email of added) {
        void appendImplementationActivityEntry(db, agentId, {
          ...logBase, action: "task_assignees_changed",
          summary: `asignó a ${email}`,
          metadata: { added: [email] },
        });
      }
      for (const email of removed) {
        void appendImplementationActivityEntry(db, agentId, {
          ...logBase, action: "task_assignees_changed",
          summary: `desasignó a ${email}`,
          metadata: { removed: [email] },
        });
      }
    }

    return c.json({ task: mapTaskDoc(updated as QueryDocumentSnapshot) });
  } catch (error) {
    return handleFirestoreError(c, error, "[implementation tasks PATCH]");
  }
}
