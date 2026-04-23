import type { DocumentReference, Firestore } from "firebase-admin/firestore";

import { FieldValue } from "@/lib/firestore";

import { TOOLS_CATALOG } from "./constants";

export async function loadActiveToolsCatalogByDocId(
  db: Firestore,
): Promise<Map<string, Record<string, unknown>>> {
  const snap = await db.collection(TOOLS_CATALOG).get();
  const map = new Map<string, Record<string, unknown>>();
  for (const doc of snap.docs) {
    const d = doc.data() as Record<string, unknown>;
    if (typeof d.status === "string" && d.status === "active") {
      map.set(doc.id, d);
    }
  }
  return map;
}

function stripFirestoreSentinels(
  obj: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v == null) continue;
    if (typeof v === "object" && v !== null && "_methodName" in (v as object)) {
      continue;
    }
    if (typeof v === "object" && !Array.isArray(v) && v !== null) {
      out[k] = stripFirestoreSentinels(v as Record<string, unknown>);
    } else {
      out[k] = v;
    }
  }
  return out;
}

export async function replaceDraftTools(
  draftRef: DocumentReference,
  catalogById: Map<string, Record<string, unknown>>,
  selectedIds: string[],
): Promise<void> {
  const toolsCol = draftRef.collection("tools");
  const testingToolsCol = draftRef
    .collection("testing")
    .doc("data")
    .collection("tools");
  const existing = await toolsCol.get();
  const db = draftRef.firestore;
  let batch = db.batch();
  let ops = 0;

  const flush = async () => {
    if (ops > 0) {
      await batch.commit();
      batch = db.batch();
      ops = 0;
    }
  };

  for (const doc of existing.docs) {
    batch.delete(doc.ref);
    batch.delete(testingToolsCol.doc(doc.id));
    ops += 2;
    if (ops >= 400) await flush();
  }
  await flush();

  for (const toolId of selectedIds) {
    const raw = catalogById.get(toolId);
    if (!raw) continue;
    const type =
      typeof raw.type === "string" && raw.type.trim() !== ""
        ? raw.type
        : "default";
    const plain = stripFirestoreSentinels({ ...raw });
    const toolData = {
      ...plain,
      id: toolId,
      type,
      updatedAt: FieldValue.serverTimestamp(),
    };
    batch.set(toolsCol.doc(toolId), toolData);
    batch.set(testingToolsCol.doc(toolId), toolData);
    ops += 2;
    if (ops >= 400) await flush();
  }
  await flush();
}
