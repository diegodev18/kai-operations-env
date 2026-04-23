import type { Context } from "hono";

import { ApiErrors, errorResponse } from "@/lib/api-error";
import {
  getBuilderAllowlistEntry,
  isBuilderTechnicalDocumentId,
} from "@/constants/builder-suggested-properties";
import type { AgentsInfoAuthContext } from "@/types/agents-types";

import { handleFirestoreError } from "@/utils/agent-drafts/access";
import { getAuthorizedDraftRef } from "@/utils/agent-drafts/authorized-draft";
import { mergeBuilderTechnicalPropertyPatchesForChat } from "@/utils/agent-drafts/merge-technical-property-patches";
import { DRAFT_TECHNICAL_PROPERTY_DOC_IDS } from "@/utils/agent-drafts/technical-property-doc-ids";

export async function getDraftTechnicalPropertiesBundle(
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
    const out: Record<string, Record<string, unknown>> = {};
    for (const docId of DRAFT_TECHNICAL_PROPERTY_DOC_IDS) {
      const snap = await auth.draftRef
        .collection("properties")
        .doc(docId)
        .get();
      out[docId] = snap.exists
        ? { ...((snap.data() as Record<string, unknown>) ?? {}) }
        : {};
    }
    return c.json({ properties: out });
  } catch (error) {
    const r = handleFirestoreError(
      c,
      error,
      "[agents/drafts/:id/technical-properties GET]",
    );
    return (
      r ??
      c.json({ error: "Error al leer propiedades técnicas del borrador." }, 500)
    );
  }
}

export async function patchDraftTechnicalPropertyDocument(
  c: Context,
  authCtx: AgentsInfoAuthContext,
  draftId: string,
  documentId: string,
) {
  if (!isBuilderTechnicalDocumentId(documentId)) {
    return ApiErrors.validation(c, "documentId no permitido");
  }
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return ApiErrors.validation(c, "JSON inválido");
  }
  if (body == null || typeof body !== "object" || Array.isArray(body)) {
    return ApiErrors.validation(c, "El cuerpo debe ser un objeto");
  }
  const bodyObj = body as Record<string, unknown>;
  const patches: Array<{
    documentId: string;
    fieldKey: string;
    value: unknown;
  }> = [];
  for (const [fieldKey, value] of Object.entries(bodyObj)) {
    if (!getBuilderAllowlistEntry(documentId, fieldKey)) continue;
    patches.push({ documentId, fieldKey, value });
  }
  if (patches.length === 0) {
    return ApiErrors.validation(c, "Ningún campo permitido en el cuerpo");
  }

  const merged = await mergeBuilderTechnicalPropertyPatchesForChat(
    authCtx,
    draftId,
    patches,
  );
  if (!merged.ok) {
    const code = merged.status as 400 | 403 | 404;
    return errorResponse(
      c,
      merged.error,
      code === 404
        ? "NOT_FOUND"
        : code === 403
          ? "FORBIDDEN"
          : "VALIDATION_ERROR",
      code,
    );
  }

  return c.json({ documentId, success: true, applied: merged.applied });
}
