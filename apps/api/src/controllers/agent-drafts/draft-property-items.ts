import type { Context } from "hono";

import { ApiErrors } from "@/lib/api-error";
import { serverTimestampField } from "@/constants/agentPropertyDefaults";
import type { AgentsInfoAuthContext } from "@/types/agents";

import { handleFirestoreError } from "@/utils/agent-drafts/access";
import { getAuthorizedDraftRef } from "@/utils/agent-drafts/authorized-draft";
import {
  isDraftPropertyDocumentId,
  serializeDraftPropertyItemForClient,
} from "@/utils/agent-drafts/serialization";
import {
  createDraftPropertyItemSchema,
  patchDraftPropertyItemSchema,
} from "@/utils/agent-drafts/schemas";

export async function getDraftPropertyItems(
  c: Context,
  authCtx: AgentsInfoAuthContext,
  draftId: string,
  documentId: string,
) {
  if (!isDraftPropertyDocumentId(documentId)) {
    return ApiErrors.validation(c, "documentId inválido");
  }
  try {
    const auth = await getAuthorizedDraftRef(authCtx, draftId);
    if (!auth.ok) {
      if (auth.code === 404) {
        return ApiErrors.notFound(c, "Borrador no encontrado");
      }
      return ApiErrors.forbidden(c, "No autorizado");
    }
    const snap = await auth.draftRef
      .collection("properties")
      .doc(documentId)
      .collection("items")
      .orderBy("created_at", "asc")
      .get();
    const items = snap.docs.map((doc) =>
      serializeDraftPropertyItemForClient(
        doc.id,
        (doc.data() as Record<string, unknown>) ?? {},
      ),
    );
    return c.json({ items });
  } catch (error) {
    const r = handleFirestoreError(
      c,
      error,
      "[agents/drafts/:id/properties/:documentId/items GET]",
    );
    return r ?? ApiErrors.internal(c, "Error al listar items de properties.");
  }
}

export async function postDraftPropertyItem(
  c: Context,
  authCtx: AgentsInfoAuthContext,
  draftId: string,
  documentId: string,
) {
  if (!isDraftPropertyDocumentId(documentId)) {
    return ApiErrors.validation(c, "documentId inválido");
  }
  let raw: unknown;
  try {
    raw = await c.req.json();
  } catch {
    return ApiErrors.validation(c, "JSON inválido");
  }
  const parsed = createDraftPropertyItemSchema.safeParse(raw);
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
      content: parsed.data.content,
      created_at: ts,
      updated_at: ts,
    };
    const docRef = await auth.draftRef
      .collection("properties")
      .doc(documentId)
      .collection("items")
      .add(payload);
    const created = await docRef.get();
    return c.json({
      item: serializeDraftPropertyItemForClient(
        docRef.id,
        (created.data() as Record<string, unknown>) ?? payload,
      ),
    });
  } catch (error) {
    const r = handleFirestoreError(
      c,
      error,
      "[agents/drafts/:id/properties/:documentId/items POST]",
    );
    return r ?? c.json({ error: "Error al crear item de properties." }, 500);
  }
}

export async function patchDraftPropertyItem(
  c: Context,
  authCtx: AgentsInfoAuthContext,
  draftId: string,
  documentId: string,
  itemId: string,
) {
  if (!isDraftPropertyDocumentId(documentId)) {
    return ApiErrors.validation(c, "documentId inválido");
  }
  let raw: unknown;
  try {
    raw = await c.req.json();
  } catch {
    return ApiErrors.validation(c, "JSON inválido");
  }
  const parsed = patchDraftPropertyItemSchema.safeParse(raw);
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
    const itemRef = auth.draftRef
      .collection("properties")
      .doc(documentId)
      .collection("items")
      .doc(itemId);
    const snap = await itemRef.get();
    if (!snap.exists) return ApiErrors.notFound(c, "Item no encontrado");
    await itemRef.update({
      ...parsed.data,
      updated_at: serverTimestampField(),
    });
    const updated = await itemRef.get();
    return c.json({
      item: serializeDraftPropertyItemForClient(
        itemId,
        (updated.data() as Record<string, unknown>) ?? {},
      ),
    });
  } catch (error) {
    const r = handleFirestoreError(
      c,
      error,
      "[agents/drafts/:id/properties/:documentId/items PATCH]",
    );
    return (
      r ?? c.json({ error: "Error al actualizar item de properties." }, 500)
    );
  }
}

export async function deleteDraftPropertyItem(
  c: Context,
  authCtx: AgentsInfoAuthContext,
  draftId: string,
  documentId: string,
  itemId: string,
) {
  if (!isDraftPropertyDocumentId(documentId)) {
    return ApiErrors.validation(c, "documentId inválido");
  }
  try {
    const auth = await getAuthorizedDraftRef(authCtx, draftId);
    if (!auth.ok) {
      if (auth.code === 404) {
        return ApiErrors.notFound(c, "Borrador no encontrado");
      }
      return ApiErrors.forbidden(c, "No autorizado");
    }
    const itemRef = auth.draftRef
      .collection("properties")
      .doc(documentId)
      .collection("items")
      .doc(itemId);
    const snap = await itemRef.get();
    if (!snap.exists) return ApiErrors.notFound(c, "Item no encontrado");
    await itemRef.delete();
    return c.json({ ok: true, id: itemId });
  } catch (error) {
    const r = handleFirestoreError(
      c,
      error,
      "[agents/drafts/:id/properties/:documentId/items DELETE]",
    );
    return r ?? c.json({ error: "Error al eliminar item de properties." }, 500);
  }
}
