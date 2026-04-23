import {
  serverTimestampField,
  writeDefaultAgentProperties,
} from "@/constants/agentPropertyDefaults";
import {
  getBuilderAllowlistEntry,
  normalizeAndValidateBuilderPropertyValue,
} from "@/constants/builder-suggested-properties";
import type { AgentsInfoAuthContext } from "@/types/agents";

import { getAuthorizedDraftRef } from "./authorized-draft";

export async function mergeBuilderTechnicalPropertyPatchesForChat(
  authCtx: AgentsInfoAuthContext,
  draftId: string,
  rawPatches: Array<{ documentId: string; fieldKey: string; value: unknown }>,
): Promise<
  | {
      ok: true;
      applied: Array<{ documentId: string; fieldKey: string; value: unknown }>;
    }
  | { ok: false; status: number; error: string }
> {
  if (rawPatches.length === 0) return { ok: true, applied: [] };
  const auth = await getAuthorizedDraftRef(authCtx, draftId);
  if (!auth.ok) {
    return {
      ok: false,
      status: auth.code,
      error: auth.code === 404 ? "Borrador no encontrado" : "No autorizado",
    };
  }

  const agentProp = await auth.draftRef
    .collection("properties")
    .doc("agent")
    .get();
  if (!agentProp.exists) {
    await writeDefaultAgentProperties(auth.draftRef);
  }

  const byDoc = new Map<string, Record<string, unknown>>();
  const applied: Array<{
    documentId: string;
    fieldKey: string;
    value: unknown;
  }> = [];

  for (const p of rawPatches) {
    const entry = getBuilderAllowlistEntry(p.documentId, p.fieldKey);
    if (!entry) {
      return {
        ok: false,
        status: 400,
        error: `Campo no permitido en property_patch: ${p.documentId}.${p.fieldKey}`,
      };
    }
    const norm = normalizeAndValidateBuilderPropertyValue(entry, p.value);
    if (!norm.ok) {
      return { ok: false, status: 400, error: norm.error };
    }
    const docId = entry.documentId;
    const prev = byDoc.get(docId) ?? {};
    prev[entry.fieldKey] = norm.value;
    byDoc.set(docId, prev);
    applied.push({
      documentId: docId,
      fieldKey: entry.fieldKey,
      value: norm.value,
    });
  }

  const batch = auth.draftRef.firestore.batch();
  for (const [docId, data] of byDoc) {
    batch.set(auth.draftRef.collection("properties").doc(docId), data, {
      merge: true,
    });
  }
  batch.update(auth.draftRef, {
    updated_at: serverTimestampField(),
  });
  await batch.commit();

  return { ok: true, applied };
}
