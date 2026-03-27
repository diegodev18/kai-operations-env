import type {
  DocumentReference,
  Firestore,
} from "firebase-admin/firestore";

/** Subcolecciones bajo agent_configurations/{id} al bajar de producción → comercial. */
export const SYNC_FROM_PRODUCTION_SUBCOLLECTIONS = [
  "tools",
  "knowledgeBase",
  "properties",
  "wallet",
  "pipelines",
] as const;

const BATCH_SIZE = 450;

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return v != null && typeof v === "object" && !Array.isArray(v);
}

/** Elimina sentinels que no se pueden serializar al escribir. */
function sanitizeForWrite(data: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(data)) {
    if (v === undefined) continue;
    if (v && typeof v === "object" && "_methodName" in (v as object)) {
      continue;
    }
    if (isPlainObject(v)) {
      out[k] = sanitizeForWrite(v);
    } else if (Array.isArray(v)) {
      out[k] = v.map((item) =>
        isPlainObject(item) ? sanitizeForWrite(item) : item,
      );
    } else {
      out[k] = v;
    }
  }
  return out;
}

/** Borra subcolecciones anidadas y luego el documento. */
async function deleteDocumentRecursive(docRef: DocumentReference): Promise<void> {
  const subcols = await docRef.listCollections();
  for (const sub of subcols) {
    await deleteCollectionRecursive(sub);
  }
  await docRef.delete();
}

async function deleteCollectionRecursive(
  colRef: FirebaseFirestore.CollectionReference,
): Promise<void> {
  let snap = await colRef.limit(BATCH_SIZE).get();
  while (!snap.empty) {
    for (const doc of snap.docs) {
      await deleteDocumentRecursive(doc.ref);
    }
    snap = await colRef.limit(BATCH_SIZE).get();
  }
}

/** Borra solo las subcolecciones listadas bajo el agente (recursivo). */
export async function clearAgentSubcollections(
  destAgentRef: DocumentReference,
  names: readonly string[],
): Promise<void> {
  for (const name of names) {
    await deleteCollectionRecursive(destAgentRef.collection(name));
  }
}

async function copyDocRecursive(
  sourceDocRef: DocumentReference,
  destDocRef: DocumentReference,
): Promise<void> {
  const snap = await sourceDocRef.get();
  if (!snap.exists) return;
  const raw = snap.data();
  if (raw && typeof raw === "object") {
    await destDocRef.set(sanitizeForWrite(raw as Record<string, unknown>));
  } else {
    await destDocRef.set({});
  }

  const subcols = await sourceDocRef.listCollections();
  for (const subcol of subcols) {
    const docs = await subcol.get();
    for (const d of docs.docs) {
      await copyDocRecursive(
        d.ref,
        destDocRef.collection(subcol.id).doc(d.id),
      );
    }
  }
}

export async function copyAgentSubcollectionsRecursive(
  sourceAgentRef: DocumentReference,
  destAgentRef: DocumentReference,
  subcollectionNames: readonly string[],
): Promise<void> {
  for (const name of subcollectionNames) {
    const srcCol = sourceAgentRef.collection(name);
    const snap = await srcCol.get();
    if (snap.empty) continue;
    const destCol = destAgentRef.collection(name);
    for (const d of snap.docs) {
      await copyDocRecursive(d.ref, destCol.doc(d.id));
    }
  }
}

export async function copyAgentRootDocument(
  sourceAgentRef: DocumentReference,
  destAgentRef: DocumentReference,
): Promise<void> {
  const snap = await sourceAgentRef.get();
  if (!snap.exists) {
    throw new Error("Documento de agente de origen no existe");
  }
  const raw = snap.data();
  if (raw && typeof raw === "object") {
    await destAgentRef.set(sanitizeForWrite(raw as Record<string, unknown>));
  } else {
    await destAgentRef.set({});
  }
}

/**
 * Producción (kai) → asistente comercial: doc raíz + subcolecciones fijas, recursivo.
 */
export async function syncAgentFromProductionToCommercial(
  prodDb: Firestore,
  commercialDb: Firestore,
  agentId: string,
): Promise<void> {
  const sourceRef = prodDb.collection("agent_configurations").doc(agentId);
  const destRef = commercialDb.collection("agent_configurations").doc(agentId);

  const srcSnap = await sourceRef.get();
  if (!srcSnap.exists) {
    throw new Error("El agente no existe en producción");
  }

  await clearAgentSubcollections(destRef, SYNC_FROM_PRODUCTION_SUBCOLLECTIONS);
  await copyAgentRootDocument(sourceRef, destRef);
  await copyAgentSubcollectionsRecursive(
    sourceRef,
    destRef,
    SYNC_FROM_PRODUCTION_SUBCOLLECTIONS,
  );
}

const PROMOTE_ALLOWED = new Set([
  "tools",
  "knowledgeBase",
  "properties",
  "wallet",
  "pipelines",
  "growers",
  "commands",
  "faqs",
  "chats",
  "orders",
]);

/**
 * Comercial → producción: doc raíz + subcolecciones seleccionadas.
 */
export async function syncAgentFromCommercialToProduction(
  commercialDb: Firestore,
  prodDb: Firestore,
  agentId: string,
  subcollectionNames: string[],
): Promise<void> {
  for (const n of subcollectionNames) {
    if (!PROMOTE_ALLOWED.has(n)) {
      throw new Error(`Subcolección no permitida: ${n}`);
    }
  }

  const sourceRef = commercialDb.collection("agent_configurations").doc(agentId);
  const destRef = prodDb.collection("agent_configurations").doc(agentId);

  const srcSnap = await sourceRef.get();
  if (!srcSnap.exists) {
    throw new Error("El agente no existe en asistente comercial");
  }

  await clearAgentSubcollections(destRef, subcollectionNames);
  await copyAgentRootDocument(sourceRef, destRef);
  await copyAgentSubcollectionsRecursive(sourceRef, destRef, subcollectionNames);
}
