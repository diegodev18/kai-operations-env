import type { Context } from "hono";

import { ApiErrors } from "@/lib/api-error";
import { serverTimestampField } from "@/constants/agentPropertyDefaults";
import type { AgentsInfoAuthContext } from "@/types/agents-types";

import { handleFirestoreError } from "@/utils/agent-drafts/access";
import { PENDING_TASKS } from "@/utils/agent-drafts/constants";
import { getAuthorizedDraftRef } from "@/utils/agent-drafts/authorized-draft";
import { serializePendingTaskForClient } from "@/utils/agent-drafts/serialization";
import {
  createDraftPendingTaskSchema,
  patchDraftPendingTaskSchema,
} from "@/utils/agent-drafts/schemas";

export async function getDraftPendingTasks(
  c: Context,
  authCtx: AgentsInfoAuthContext,
  draftId: string,
) {
  try {
    const auth = await getAuthorizedDraftRef(authCtx, draftId);
    if (!auth.ok) {
      return c.json(
        {
          error: auth.code === 404 ? "Borrador no encontrado" : "No autorizado",
        },
        auth.code,
      );
    }
    const snap = await auth.draftRef
      .collection(PENDING_TASKS)
      .orderBy("created_at", "desc")
      .get();
    const tasks = snap.docs.map((doc) =>
      serializePendingTaskForClient(
        doc.id,
        (doc.data() as Record<string, unknown>) ?? {},
      ),
    );
    return c.json({ tasks });
  } catch (error) {
    const r = handleFirestoreError(c, error, "[agents/drafts/:id/tasks GET]");
    return r ?? c.json({ error: "Error al listar tareas pendientes." }, 500);
  }
}

export async function postDraftPendingTask(
  c: Context,
  authCtx: AgentsInfoAuthContext,
  draftId: string,
) {
  let raw: unknown;
  try {
    raw = await c.req.json();
  } catch {
    return ApiErrors.validation(c, "JSON inválido");
  }
  const parsed = createDraftPendingTaskSchema.safeParse(raw);
  if (!parsed.success) {
    const msg = parsed.error.issues.map((i) => i.message).join("; ");
    return ApiErrors.validation(c, msg);
  }
  try {
    const auth = await getAuthorizedDraftRef(authCtx, draftId);
    if (!auth.ok) {
      return c.json(
        {
          error: auth.code === 404 ? "Borrador no encontrado" : "No autorizado",
        },
        auth.code,
      );
    }
    const ts = serverTimestampField();
    const payload: Record<string, unknown> = {
      title: parsed.data.title,
      context: parsed.data.context ?? "",
      postponed_from: parsed.data.postponed_from ?? "",
      status: "pending",
      created_at: ts,
      updated_at: ts,
      completed_at: null,
    };
    const docRef = await auth.draftRef.collection(PENDING_TASKS).add(payload);
    const created = await docRef.get();
    return c.json({
      task: serializePendingTaskForClient(
        docRef.id,
        (created.data() as Record<string, unknown>) ?? payload,
      ),
    });
  } catch (error) {
    const r = handleFirestoreError(c, error, "[agents/drafts/:id/tasks POST]");
    return r ?? c.json({ error: "Error al crear tarea pendiente." }, 500);
  }
}

export async function patchDraftPendingTask(
  c: Context,
  authCtx: AgentsInfoAuthContext,
  draftId: string,
  taskId: string,
) {
  let raw: unknown;
  try {
    raw = await c.req.json();
  } catch {
    return ApiErrors.validation(c, "JSON inválido");
  }
  const parsed = patchDraftPendingTaskSchema.safeParse(raw);
  if (!parsed.success) {
    const msg = parsed.error.issues.map((i) => i.message).join("; ");
    return ApiErrors.validation(c, msg);
  }
  if (Object.keys(parsed.data).length === 0) {
    return ApiErrors.validation(c, "No hay cambios para aplicar");
  }
  try {
    const auth = await getAuthorizedDraftRef(authCtx, draftId);
    if (!auth.ok) {
      if (auth.code === 404) {
        return ApiErrors.notFound(c, "Borrador no encontrado");
      }
      return ApiErrors.forbidden(c, "No autorizado");
    }
    const taskSnap = await auth.draftRef
      .collection(PENDING_TASKS)
      .doc(taskId)
      .get();
    if (!taskSnap.exists) {
      return ApiErrors.notFound(c, "Tarea no encontrada");
    }
    await auth.draftRef
      .collection(PENDING_TASKS)
      .doc(taskId)
      .update({
        ...(parsed.data.status && { status: parsed.data.status }),
        ...(parsed.data.title && { title: parsed.data.title }),
        ...(parsed.data.context && { context: parsed.data.context }),
        updated_at: serverTimestampField(),
      });
    const updated = await auth.draftRef
      .collection(PENDING_TASKS)
      .doc(taskId)
      .get();
    return c.json({
      task: serializePendingTaskForClient(
        taskId,
        (updated.data() as Record<string, unknown>) ?? {},
      ),
    });
  } catch (error) {
    const r = handleFirestoreError(
      c,
      error,
      "[agents/drafts/:id/tasks/:taskId PATCH]",
    );
    return r ?? ApiErrors.internal(c, "Error al actualizar tarea pendiente.");
  }
}
