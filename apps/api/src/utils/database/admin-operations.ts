import type Firestore from "firebase-admin/firestore";
import type { Context } from "hono";

import admin from "firebase-admin";

import { auth } from "@/lib/auth";
import { getFirestoreForEnvironment } from "@/lib/firestore";
import logger from "@/lib/logger";
import type {
  ActualizarDocumentoBody,
  DuplicacionLog,
  DuplicarBody,
  GetDocumentosBody,
  GetDocumentosItem,
  ResultadosSubida,
  SubirBody,
} from "@/types/database-admin";
import { isOperationsAdmin } from "@/utils/operations-access";
import { resolveSessionUserRole } from "@/utils/session-user";

export type {
  ActualizarDocumentoBody,
  DuplicacionLog,
  DuplicarBody,
  GetDocumentosBody,
  GetDocumentosItem,
  ResultadosSubida,
  SubirBody,
} from "@/types/database-admin";

export async function requireAdmin(c: Context) {
  const session = await auth.api.getSession({ headers: c.req.raw.headers });
  if (!session?.user) return { error: c.json({ error: "No autorizado", debug: { hasSession: false } }, 401) };
  const role = await resolveSessionUserRole(session.user);
  if (!isOperationsAdmin(role)) return { error: c.json({ error: "Solo admins", debug: { role, sessionRole: session.user.role } }, 403) };
  return { sessionUser: session.user, role };
}

export const PREVIEW_LIMIT = 10;
export const MAX_DOCUMENTS_PER_REQUEST = 100;
export const MAX_DUPLICAR_COLECCION = 500;
/** Evita respuestas JSON enormes (p. ej. miles de rutas) que rompen el proxy o el cliente. */
export const MAX_LOG_DOCUMENTOS_EN_RESPUESTA = 400;

export const MAX_ITEMS_GET_DOCUMENTOS = 15;

export function buildPayload(documento: unknown): Record<string, unknown> {
  let payload: Record<string, unknown>;
  if (documento && typeof documento === "object" && "data" in documento && typeof (documento as { data: unknown }).data === "object" && (documento as { data: unknown }).data !== null) {
    const { data, ...rest } = documento as Record<string, unknown> & { data: Record<string, unknown> };
    payload = { ...data, ...rest };
    if (payload.data !== undefined) delete payload.data;
  } else {
    payload = documento !== null && typeof documento === "object" ? { ...(documento as Record<string, unknown>) } : { value: documento };
  }
  const restored = restoreFirestoreTypes(payload);
  return restored !== null && typeof restored === "object" && !Array.isArray(restored) ? (restored as Record<string, unknown>) : payload;
}

export function trimDuplicacionLogParaRespuesta(log: DuplicacionLog): {
  extra: { logDocumentosTotal?: number };
  log: DuplicacionLog;
} {
  const n = log.documentos.length;
  if (n <= MAX_LOG_DOCUMENTOS_EN_RESPUESTA) {
    return { log, extra: {} };
  }
  return {
    extra: { logDocumentosTotal: n },
    log: { ...log, documentos: log.documentos.slice(0, MAX_LOG_DOCUMENTOS_EN_RESPUESTA) },
  };
}

/** Firestore rechaza `undefined` en profundidad; las refs deben pertenecer al Firestore de destino al clonar entre proyectos. */
export function prepareDocumentDataForWrite(
  docData: Record<string, unknown>,
  targetDb: Firestore.Firestore,
): Record<string, unknown> {
  const stripped = stripUndefinedDeep(docData) as Record<string, unknown>;
  return rewriteDocumentReferencesForTargetDb(stripped, targetDb) as Record<string, unknown>;
}

export function stripUndefinedDeep(value: unknown): unknown {
  if (value === undefined) {
    return undefined;
  }
  if (value === null || typeof value !== "object") {
    return value;
  }
  if (value instanceof admin.firestore.DocumentReference) {
    return value;
  }
  if (value instanceof admin.firestore.Timestamp) {
    return value;
  }
  if (value instanceof admin.firestore.GeoPoint) {
    return value;
  }
  if (value instanceof admin.firestore.FieldValue) {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map(stripUndefinedDeep).filter((v) => v !== undefined);
  }
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (v === undefined) {
      continue;
    }
    const s = stripUndefinedDeep(v);
    if (s !== undefined) {
      out[k] = s;
    }
  }
  return out;
}

export function rewriteDocumentReferencesForTargetDb(value: unknown, targetDb: Firestore.Firestore): unknown {
  if (value instanceof admin.firestore.DocumentReference) {
    try {
      return targetDb.doc(value.path);
    } catch {
      return value;
    }
  }
  if (value === null || typeof value !== "object") {
    return value;
  }
  if (value instanceof admin.firestore.Timestamp) {
    return value;
  }
  if (value instanceof admin.firestore.GeoPoint) {
    return value;
  }
  if (value instanceof admin.firestore.FieldValue) {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((item) => rewriteDocumentReferencesForTargetDb(item, targetDb));
  }
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    out[k] = rewriteDocumentReferencesForTargetDb(v, targetDb);
  }
  return out;
}

export async function copiarDocumentoRecursivo(
  docRefOrigen: Firestore.DocumentReference,
  docRefDestino: Firestore.DocumentReference,
  log: DuplicacionLog,
  opciones: { excluirColecciones?: string[]; sobrescribir?: boolean }
): Promise<void> {
  try {
    const docSnap = await docRefOrigen.get();
    if (!docSnap.exists) return;

    const docData = docSnap.data();
    if (!docData) return;

    if (!opciones.sobrescribir) {
      const docSnapDestino = await docRefDestino.get();
      if (docSnapDestino.exists) {
        log.documentos.push({ estado: "omitido", id: docRefDestino.path, razon: "ya_existe" });
        log.resumen.omitidos++;
        return;
      }
    }

    const prepared = prepareDocumentDataForWrite(docData as Record<string, unknown>, docRefDestino.firestore);
    await docRefDestino.set(prepared);
    const docId = docRefDestino.id;
    if (!docData.id) {
      try {
        await docRefDestino.update({ id: docId });
      } catch {
        // ignore
      }
    }

    log.documentos.push({ estado: "exitoso", id: docRefDestino.path });
    log.resumen.exitosos++;

    const subcolecciones = await docRefOrigen.listCollections();
    const excluir = new Set(opciones.excluirColecciones ?? []);

    for (const subcol of subcolecciones) {
      if (excluir.has(subcol.id)) continue;
      const subcolDestino = docRefDestino.collection(subcol.id);
      const subdocsSnap = await subcol.get();
      for (const subdoc of subdocsSnap.docs) {
        await copiarDocumentoRecursivo(subcol.doc(subdoc.id), subcolDestino.doc(subdoc.id), log, opciones);
      }
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error("Error en copia recursiva", { error: message, path: docRefOrigen.path });
    log.errores.push({ error: message, ruta: docRefOrigen.path });
    log.resumen.fallidos++;
  }
}

export function createDuplicacionLog(operacion: string, proyectoOrigen: string, proyectoDestino: string, rutaOrigen: string, rutaDestino: string): DuplicacionLog {
  return {
    documentos: [],
    errores: [],
    operacion,
    proyectoDestino,
    proyectoOrigen,
    resumen: { exitosos: 0, fallidos: 0, omitidos: 0, total: 0 },
    rutaDestino,
    rutaOrigen,
    timestamp: new Date().toISOString(),
  };
}

export function getCollectionRef(db: Firestore.Firestore, path: string): Firestore.CollectionReference {
  const segments = path.split("/").filter(Boolean);
  if (segments.length === 0) {
    throw new Error("La ruta de la colección no puede estar vacía");
  }
  if (segments.length % 2 === 0) {
    throw new Error("La ruta debe ser una colección (ej: faqs o agent_configurations/xxx/users)");
  }
  let ref: Firestore.CollectionReference | Firestore.DocumentReference = db.collection(segments[0]);
  for (let i = 1; i < segments.length; i += 2) {
    ref = ref.doc(segments[i]).collection(segments[i + 1]);
  }
  return ref;
}

export function getDocumentName(doc: unknown, index: number): string {
  if (doc && typeof doc === "object") {
    const d = doc as Record<string, unknown>;
    if (typeof d.question === "string") return d.question;
    if (typeof d.name === "string") return d.name;
    if (typeof d.title === "string") return d.title;
  }
  return `Documento ${String(index + 1)}`;
}

export function getDocumentRef(db: Firestore.Firestore, path: string): Firestore.DocumentReference {
  const segments = path.split("/").filter(Boolean);
  if (segments.length === 0 || segments.length % 2 !== 0) {
    throw new Error("La ruta de documento debe tener colección/id (ej: faqs/miId)");
  }
  let ref: Firestore.DocumentReference = db.collection(segments[0]).doc(segments[1]);
  for (let i = 2; i < segments.length; i += 2) {
    ref = ref.collection(segments[i]).doc(segments[i + 1]);
  }
  return ref;
}

function isSerializedGeoPoint(value: unknown): value is { _latitude: number; _longitude: number } {
  return typeof value === "object" && value !== null && "_latitude" in value && "_longitude" in value && typeof (value as { _latitude: unknown })._latitude === "number" && typeof (value as { _longitude: unknown })._longitude === "number";
}

function isSerializedTimestamp(value: unknown): value is { _nanoseconds: number; _seconds: number } {
  return typeof value === "object" && value !== null && "_seconds" in value && "_nanoseconds" in value && typeof (value as { _seconds: unknown })._seconds === "number" && typeof (value as { _nanoseconds: unknown })._nanoseconds === "number";
}

export function restoreFirestoreTypes(value: unknown): unknown {
  if (value === null || value === undefined) return value;
  if (isSerializedTimestamp(value)) {
    return new admin.firestore.Timestamp(value._seconds, value._nanoseconds);
  }
  if (isSerializedGeoPoint(value)) {
    return new admin.firestore.GeoPoint(value._latitude, value._longitude);
  }
  if (Array.isArray(value)) {
    return value.map(restoreFirestoreTypes);
  }
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(value as Record<string, unknown>)) {
      out[key] = restoreFirestoreTypes((value as Record<string, unknown>)[key]);
    }
    return out;
  }
  return value;
}

export function serializeFirestoreValue(value: unknown): unknown {
  if (value === null || value === undefined) return value;
  if (value instanceof admin.firestore.Timestamp) {
    return { _nanoseconds: value.nanoseconds, _seconds: value.seconds };
  }
  if (value instanceof admin.firestore.GeoPoint) {
    return { _latitude: value.latitude, _longitude: value.longitude };
  }
  if (Array.isArray(value)) {
    return value.map(serializeFirestoreValue);
  }
  if (typeof value === "object") {
    const v = value as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(v)) {
      out[key] = serializeFirestoreValue(v[key]);
    }
    return out;
  }
  return value;
}
