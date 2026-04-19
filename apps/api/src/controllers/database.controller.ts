import type Firestore from "firebase-admin/firestore";
import type { Context } from "hono";

import admin from "firebase-admin";

import { auth } from "@/lib/auth";
import { getFirestoreForEnvironment } from "@/lib/firestore";
import logger, { formatError } from "@/lib/logger";
import { isOperationsAdmin } from "@/utils/operations-access";
import { resolveSessionUserRole } from "@/utils/sessionUser";

async function requireAdmin(c: Context) {
  const session = await auth.api.getSession({ headers: c.req.raw.headers });
  if (!session?.user) return { error: c.json({ error: "No autorizado", debug: { hasSession: false } }, 401) };
  const role = await resolveSessionUserRole(session.user);
  if (!isOperationsAdmin(role)) return { error: c.json({ error: "Solo admins", debug: { role, sessionRole: session.user.role } }, 403) };
  return { sessionUser: session.user, role };
}

const PREVIEW_LIMIT = 10;
const MAX_DOCUMENTS_PER_REQUEST = 100;
const MAX_DUPLICAR_COLECCION = 500;
/** Evita respuestas JSON enormes (p. ej. miles de rutas) que rompen el proxy o el cliente. */
const MAX_LOG_DOCUMENTOS_EN_RESPUESTA = 400;

interface ActualizarDocumentoBody {
  datosActualizados: Record<string, unknown>;
  opciones?: { merge?: boolean };
  rutaDocumento: string;
}

interface DuplicacionLog {
  documentos: { error?: string; estado: string; id: string; razon?: string }[];
  errores: { documento?: string; error: string; ruta?: string }[];
  operacion: string;
  proyectoDestino: string;
  proyectoOrigen: string;
  resumen: { exitosos: number; fallidos: number; omitidos: number; total: number };
  rutaDestino: string;
  rutaOrigen: string;
  timestamp: string;
}

interface DuplicarBody {
  opciones?: { excluirColecciones?: string[]; recursivo?: boolean; sobrescribir?: boolean };
  proyectoDestino: string;
  proyectoOrigen: string;
  rutaDestino: string;
  rutaOrigen: string;
}

interface ResultadosSubida {
  documentos: {
    error?: string;
    estado: "exitoso" | "fallido" | "omitido";
    id: string;
    nombre: string;
  }[];
  errores: { documento: string; error: string }[];
  exitosos: number;
  fallidos: number;
  omitidos: number;
}

interface SubirBody {
  datos: Record<string, unknown> | unknown[];
  opciones?: { merge?: boolean; sobrescribir?: boolean };
  rutaColeccion: string;
}

export async function actualizarDocumento(c: Context) {
  const adminCheck = await requireAdmin(c);
  if ("error" in adminCheck) return adminCheck.error;

  const env = c.req.header("X-Environment") ?? "testing";
  if (env !== "testing" && env !== "production") {
    return c.json({ error: "Environment inválido" }, 400);
  }

  let body: ActualizarDocumentoBody;
  try {
    body = await c.req.json<ActualizarDocumentoBody>();
  } catch {
    return c.json({ error: "Body JSON inválido" }, 400);
  }

  const { datosActualizados, opciones, rutaDocumento } = body;
  const ruta = typeof rutaDocumento === "string" ? rutaDocumento.trim() : "";
  if (!ruta) {
    return c.json({ error: "rutaDocumento es requerido" }, 400);
  }
  if (typeof datosActualizados !== "object" || Array.isArray(datosActualizados)) {
    return c.json({ error: "datosActualizados debe ser un objeto" }, 400);
  }

  const segments = ruta.split("/").filter(Boolean);
  if (segments.length === 0 || segments.length % 2 !== 0) {
    return c.json({ error: "La ruta debe ser un documento (ej: faqs/abc123)" }, 400);
  }

  const log = {
    errores: [] as { error: string }[],
    operacion: "actualizacion_documento",
    proyecto: env,
    resumen: { exitoso: false as boolean, razon: null as null | string },
    rutaDocumento: ruta,
    timestamp: new Date().toISOString(),
  };

  try {
    const db = getFirestoreForEnvironment(env);
    const docRef = getDocumentRef(db, ruta);
    const docSnap = await docRef.get();
    if (!docSnap.exists) {
      return c.json({ error: `No se encontró el documento en la ruta: ${ruta}`, log }, 404);
    }

    const payload = restoreFirestoreTypes(datosActualizados) as Record<string, unknown>;
    const merge = opciones?.merge === true;

    if (merge) {
      await docRef.update(payload);
    } else {
      await docRef.set(payload);
    }

    log.resumen = {
      exitoso: true,
      razon: merge ? "actualizado_parcial" : "reemplazado",
    };

    return c.json({
      log,
      mensaje: `Documento actualizado exitosamente${merge ? " (actualización parcial)" : " (reemplazado)"}`,
      success: true,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error("Error actualizando documento", { error: message, rutaDocumento: ruta });
    log.errores.push({ error: message });
    log.resumen.razon = message;
    return c.json({ error: message, log, success: false }, 500);
  }
}

export async function clonarRecursivo(c: Context) {
  const adminCheck = await requireAdmin(c);
  if ("error" in adminCheck) return adminCheck.error;

  let body: DuplicarBody;
  try {
    body = await c.req.json<DuplicarBody>();
  } catch {
    return c.json({ error: "Body JSON inválido" }, 400);
  }

  const { opciones, proyectoDestino, proyectoOrigen, rutaDestino, rutaOrigen } = body;

  if (proyectoOrigen !== "testing" && proyectoOrigen !== "production") {
    return c.json({ error: "proyectoOrigen inválido" }, 400);
  }
  if (proyectoDestino !== "testing" && proyectoDestino !== "production") {
    return c.json({ error: "proyectoDestino inválido" }, 400);
  }

  const rutaO = typeof rutaOrigen === "string" ? rutaOrigen.trim() : "";
  const rutaD = typeof rutaDestino === "string" ? rutaDestino.trim() : "";
  if (!rutaO || !rutaD) {
    return c.json({ error: "rutaOrigen y rutaDestino son requeridas" }, 400);
  }

  const segO = rutaO.split("/").filter(Boolean);
  const segD = rutaD.split("/").filter(Boolean);
  if (segO.length === 0 || segO.length % 2 !== 0) {
    return c.json({ error: "rutaOrigen debe ser un documento (ej: faqs/abc123)" }, 400);
  }
  if (segD.length === 0 || segD.length % 2 !== 0) {
    return c.json({ error: "rutaDestino debe ser un documento (ej: faqs/abc123)" }, 400);
  }

  const log = createDuplicacionLog("clonacion_recursiva", proyectoOrigen, proyectoDestino, rutaO, rutaD);

  try {
    const dbOrigen = getFirestoreForEnvironment(proyectoOrigen);
    const dbDestino = getFirestoreForEnvironment(proyectoDestino);
    const docRefOrigen = getDocumentRef(dbOrigen, rutaO);
    const docRefDestino = getDocumentRef(dbDestino, rutaD);

    await copiarDocumentoRecursivo(docRefOrigen, docRefDestino, log, {
      excluirColecciones: opciones?.excluirColecciones ?? [],
      sobrescribir: opciones?.sobrescribir ?? false,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error("Error clonando recursivo", { error: message });
    return c.json({ error: message, success: false }, 500);
  }

  const { extra, log: logResp } = trimDuplicacionLogParaRespuesta(log);
  return c.json({
    log: logResp,
    mensaje: `Clonación recursiva completada: ${String(log.resumen.exitosos)} exitosos, ${String(log.resumen.fallidos)} fallidos, ${String(log.resumen.omitidos)} omitidos`,
    success: true,
    ...extra,
  });
}

export async function duplicarColeccion(c: Context) {
  const adminCheck = await requireAdmin(c);
  if ("error" in adminCheck) return adminCheck.error;

  let body: DuplicarBody;
  try {
    body = await c.req.json<DuplicarBody>();
  } catch {
    return c.json({ error: "Body JSON inválido" }, 400);
  }

  const { opciones, proyectoDestino, proyectoOrigen, rutaDestino, rutaOrigen } = body;

  if (proyectoOrigen !== "testing" && proyectoOrigen !== "production") {
    return c.json({ error: "proyectoOrigen inválido" }, 400);
  }
  if (proyectoDestino !== "testing" && proyectoDestino !== "production") {
    return c.json({ error: "proyectoDestino inválido" }, 400);
  }

  const rutaO = typeof rutaOrigen === "string" ? rutaOrigen.trim() : "";
  const rutaD = typeof rutaDestino === "string" ? rutaDestino.trim() : "";
  if (!rutaO || !rutaD) {
    return c.json({ error: "rutaOrigen y rutaDestino son requeridas" }, 400);
  }

  const segO = rutaO.split("/").filter(Boolean);
  const segD = rutaD.split("/").filter(Boolean);
  if (segO.length === 0 || segO.length % 2 === 0) {
    return c.json({ error: "rutaOrigen debe ser una colección (ej: faqs)" }, 400);
  }
  if (segD.length === 0 || segD.length % 2 === 0) {
    return c.json({ error: "rutaDestino debe ser una colección (ej: faqs)" }, 400);
  }

  const log = createDuplicacionLog("duplicacion_coleccion", proyectoOrigen, proyectoDestino, rutaO, rutaD);

  try {
    const dbOrigen = getFirestoreForEnvironment(proyectoOrigen);
    const dbDestino = getFirestoreForEnvironment(proyectoDestino);
    const colRefOrigen = getCollectionRef(dbOrigen, rutaO);
    const snapshot = await colRefOrigen.get();

    if (snapshot.empty) {
      return c.json({ error: "No se encontraron documentos en la colección origen", log, success: false }, 404);
    }

    if (snapshot.size > MAX_DUPLICAR_COLECCION) {
      return c.json(
        { error: `La colección tiene más de ${String(MAX_DUPLICAR_COLECCION)} documentos. Reduce el tamaño o contacta al administrador.` },
        400
      );
    }

    const colRefDestino = getCollectionRef(dbDestino, rutaD);
    const sobrescribir = opciones?.sobrescribir ?? false;
    const recursivo = opciones?.recursivo ?? false;
    const excluirColecciones = opciones?.excluirColecciones ?? [];

    for (const docSnap of snapshot.docs) {
      const docId = docSnap.id;
      const docRefDestino = colRefDestino.doc(docId);

      if (recursivo) {
        await copiarDocumentoRecursivo(colRefOrigen.doc(docId), docRefDestino, log, { excluirColecciones, sobrescribir });
        continue;
      }

      const docData = docSnap.data();
      const docDestinoSnap = await docRefDestino.get();
      if (docDestinoSnap.exists && !sobrescribir) {
        log.documentos.push({ estado: "omitido", id: docId, razon: "ya_existe" });
        log.resumen.omitidos++;
        continue;
      }

      try {
        const prepared = prepareDocumentDataForWrite(docData as Record<string, unknown>, docRefDestino.firestore);
        await docRefDestino.set(prepared);
        if (!docData.id) {
          try {
            await docRefDestino.update({ id: docId });
          } catch {
            // ignore
          }
        }
        log.documentos.push({ estado: "exitoso", id: docId });
        log.resumen.exitosos++;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        log.documentos.push({ error: message, estado: "fallido", id: docId });
        log.errores.push({ documento: docId, error: message });
        log.resumen.fallidos++;
      }
    }

    log.resumen.total = snapshot.size;
    const { extra, log: logResp } = trimDuplicacionLogParaRespuesta(log);
    return c.json({
      log: logResp,
      mensaje: `Duplicación completada: ${String(log.resumen.exitosos)} exitosos, ${String(log.resumen.fallidos)} fallidos, ${String(log.resumen.omitidos)} omitidos`,
      success: true,
      ...extra,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error("Error duplicando colección", { error: message });
    return c.json({ error: message, success: false }, 500);
  }
}

export async function duplicarDocumento(c: Context) {
  const adminCheck = await requireAdmin(c);
  if ("error" in adminCheck) return adminCheck.error;

  let body: DuplicarBody;
  try {
    body = await c.req.json<DuplicarBody>();
  } catch {
    return c.json({ error: "Body JSON inválido" }, 400);
  }

  const { opciones, proyectoDestino, proyectoOrigen, rutaDestino, rutaOrigen } = body;

  if (proyectoOrigen !== "testing" && proyectoOrigen !== "production") {
    return c.json({ error: "proyectoOrigen inválido" }, 400);
  }
  if (proyectoDestino !== "testing" && proyectoDestino !== "production") {
    return c.json({ error: "proyectoDestino inválido" }, 400);
  }

  const rutaO = typeof rutaOrigen === "string" ? rutaOrigen.trim() : "";
  const rutaD = typeof rutaDestino === "string" ? rutaDestino.trim() : "";
  if (!rutaO || !rutaD) {
    return c.json({ error: "rutaOrigen y rutaDestino son requeridas" }, 400);
  }

  const segO = rutaO.split("/").filter(Boolean);
  const segD = rutaD.split("/").filter(Boolean);
  if (segO.length === 0 || segO.length % 2 !== 0) {
    return c.json({ error: "rutaOrigen debe ser un documento (ej: faqs/abc123)" }, 400);
  }
  if (segD.length === 0 || segD.length % 2 !== 0) {
    return c.json({ error: "rutaDestino debe ser un documento (ej: faqs/abc123)" }, 400);
  }

  const log = createDuplicacionLog("duplicacion_documento", proyectoOrigen, proyectoDestino, rutaO, rutaD);

  try {
    const dbOrigen = getFirestoreForEnvironment(proyectoOrigen);
    const dbDestino = getFirestoreForEnvironment(proyectoDestino);
    const docRefOrigen = getDocumentRef(dbOrigen, rutaO);
    const docRefDestino = getDocumentRef(dbDestino, rutaD);
    const docSnap = await docRefOrigen.get();

    if (!docSnap.exists) {
      return c.json({ error: `No se encontró el documento en la ruta origen: ${rutaO}`, log, success: false }, 404);
    }

    const docData = docSnap.data();
    if (!docData) {
      return c.json({ error: "Documento sin datos", log, success: false }, 500);
    }

    const docDestinoSnap = await docRefDestino.get();
    if (docDestinoSnap.exists && !(opciones?.sobrescribir ?? false)) {
      return c.json({ error: "El documento ya existe en destino y sobrescribir=false", log, success: false }, 400);
    }

    const recursivo = opciones?.recursivo ?? false;
    if (recursivo) {
      await copiarDocumentoRecursivo(docRefOrigen, docRefDestino, log, {
        excluirColecciones: opciones?.excluirColecciones ?? [],
        sobrescribir: opciones?.sobrescribir ?? false,
      });
      log.resumen.total = log.resumen.exitosos + log.resumen.fallidos + log.resumen.omitidos;
    } else {
      const prepared = prepareDocumentDataForWrite(docData as Record<string, unknown>, docRefDestino.firestore);
      await docRefDestino.set(prepared);
      const docId = rutaD.split("/").pop() ?? docRefDestino.id;
      if (!docData.id) {
        try {
          await docRefDestino.update({ id: docId });
        } catch {
          // ignore
        }
      }

      log.resumen.total = 1;
      log.resumen.exitosos = 1;
      log.documentos.push({ estado: "exitoso", id: docRefDestino.path });
    }

    const { extra, log: logResp } = trimDuplicacionLogParaRespuesta(log);
    return c.json({
      log: logResp,
      mensaje: recursivo
        ? `Duplicación de documento (recursiva) completada: ${String(log.resumen.exitosos)} exitosos, ${String(log.resumen.fallidos)} fallidos, ${String(log.resumen.omitidos)} omitidos`
        : `Documento duplicado exitosamente${docDestinoSnap.exists ? " (sobrescrito)" : ""}`,
      success: true,
      ...extra,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error("Error duplicando documento", { error: message });
    return c.json({ error: message, success: false }, 500);
  }
}

export async function getDocument(c: Context) {
  const adminCheck = await requireAdmin(c);
  if ("error" in adminCheck) return adminCheck.error;

  const env = c.req.header("X-Environment") ?? "testing";
  if (env !== "testing" && env !== "production") {
    return c.json({ error: "Environment inválido" }, 400);
  }

  const rutaDocumento = c.req.query("rutaDocumento")?.trim();
  if (!rutaDocumento) {
    return c.json({ error: "rutaDocumento es requerido (query)" }, 400);
  }

  const segments = rutaDocumento.split("/").filter(Boolean);
  if (segments.length === 0 || segments.length % 2 !== 0) {
    return c.json({ error: "La ruta debe ser un documento (ej: faqs/abc123)" }, 400);
  }

  try {
    const db = getFirestoreForEnvironment(env);
    const docRef = getDocumentRef(db, rutaDocumento);
    const docSnap = await docRef.get();
    if (!docSnap.exists) {
      return c.json({ error: `No se encontró el documento en la ruta: ${rutaDocumento}` }, 404);
    }
    const data = docSnap.data();
    const documento = serializeFirestoreValue(data ?? {});
    return c.json({ documento, success: true });
  } catch (error) {
    logger.error("Error leyendo documento", { error: formatError(error), rutaDocumento });
    return c.json({ error: error instanceof Error ? error.message : "Error al leer el documento" }, 500);
  }
}

const MAX_ITEMS_GET_DOCUMENTOS = 15;

interface GetDocumentosBody {
  items: GetDocumentosItem[];
}

interface GetDocumentosItem {
  environment: "production" | "testing";
  rutaDocumento: string;
}

export async function getDocumentos(c: Context) {
  const adminCheck = await requireAdmin(c);
  if ("error" in adminCheck) return adminCheck.error;

  let body: GetDocumentosBody;
  try {
    body = await c.req.json<GetDocumentosBody>();
  } catch {
    return c.json({ error: "Body JSON inválido" }, 400);
  }

  const items = Array.isArray(body.items) ? body.items : [];
  if (items.length === 0) {
    return c.json({ error: "items es requerido y debe ser un array no vacío" }, 400);
  }
  const maxItemsStr = String(MAX_ITEMS_GET_DOCUMENTOS);
  if (items.length > MAX_ITEMS_GET_DOCUMENTOS) {
    return c.json({ error: `Máximo ${maxItemsStr} documentos por solicitud` }, 400);
  }

  const resultados: { documento?: Record<string, unknown>; environment: string; error?: string; rutaDocumento: string }[] = [];

  for (const item of items) {
    const ruta = typeof item.rutaDocumento === "string" ? item.rutaDocumento.trim() : "";
    const rawEnv = item.environment as string;
    const env: "production" | "testing" | null = rawEnv === "testing" ? "testing" : rawEnv === "production" ? "production" : null;

    if (!ruta) {
      resultados.push({ environment: item.environment, error: "rutaDocumento es requerido", rutaDocumento: ruta });
      continue;
    }
    if (!env) {
      resultados.push({ environment: item.environment, error: "environment debe ser testing o production", rutaDocumento: ruta });
      continue;
    }

    const segments = ruta.split("/").filter(Boolean);
    if (segments.length === 0 || segments.length % 2 !== 0) {
      resultados.push({ environment: env, error: "La ruta debe ser un documento (ej: faqs/abc123)", rutaDocumento: ruta });
      continue;
    }

    try {
      const db = getFirestoreForEnvironment(env);
      const docRef = getDocumentRef(db, ruta);
      const docSnap = await docRef.get();
      if (!docSnap.exists) {
        resultados.push({ environment: env, error: `No se encontró el documento en la ruta: ${ruta}`, rutaDocumento: ruta });
        continue;
      }
      const data = docSnap.data();
      const documento = serializeFirestoreValue(data ?? {}) as Record<string, unknown>;
      resultados.push({ documento, environment: env, rutaDocumento: ruta });
    } catch (error) {
      const errRuta = ruta;
      logger.error("Error leyendo documento en getDocumentos", { environment: env, error: formatError(error), rutaDocumento: errRuta });
      resultados.push({ environment: env, error: error instanceof Error ? error.message : "Error al leer el documento", rutaDocumento: errRuta });
    }
  }

  return c.json({ documentos: resultados, success: true });
}

export async function listSubcollections(c: Context) {
  const adminCheck = await requireAdmin(c);
  if ("error" in adminCheck) return adminCheck.error;

  const env = c.req.header("X-Environment") ?? "testing";
  if (env !== "testing" && env !== "production") {
    return c.json({ error: "Environment inválido" }, 400);
  }

  const rutaDocumento = c.req.query("rutaDocumento")?.trim();
  if (!rutaDocumento) {
    return c.json({ error: "rutaDocumento es requerido (query)" }, 400);
  }

  const segments = rutaDocumento.split("/").filter(Boolean);
  if (segments.length === 0 || segments.length % 2 !== 0) {
    return c.json({ error: "La ruta debe ser un documento (ej: faqs/abc123)" }, 400);
  }

  try {
    const db = getFirestoreForEnvironment(env);
    const docRef = getDocumentRef(db, rutaDocumento);
    const collections = await docRef.listCollections();
    return c.json({ subcolecciones: collections.map((col) => ({ id: col.id })), success: true });
  } catch (error) {
    logger.error("Error listando subcolecciones", { error: formatError(error), rutaDocumento });
    return c.json({ error: error instanceof Error ? error.message : "Error al listar subcolecciones" }, 500);
  }
}

export async function previewCollection(c: Context) {
  const adminCheck = await requireAdmin(c);
  if ("error" in adminCheck) return adminCheck.error;

  const env = c.req.header("X-Environment") ?? "testing";
  if (env !== "testing" && env !== "production") {
    return c.json({ error: "Environment inválido" }, 400);
  }

  const rutaColeccion = c.req.query("rutaColeccion")?.trim();
  if (!rutaColeccion) {
    return c.json({ error: "rutaColeccion es requerido (query)" }, 400);
  }

  try {
    const db = getFirestoreForEnvironment(env);
    const collectionRef = getCollectionRef(db, rutaColeccion);
    const snapshot = await collectionRef.limit(PREVIEW_LIMIT).get();

    const documentos = snapshot.docs.map((doc) => {
      const data = doc.data();
      return { id: doc.id, ...serializeFirestoreValue(data) as Record<string, unknown> };
    });

    return c.json({ documentos, proyecto: env, ruta: rutaColeccion, success: true, totalPreview: documentos.length });
  } catch (error) {
    logger.error("Error en preview de colección", { error: formatError(error), rutaColeccion });
    return c.json({ error: error instanceof Error ? error.message : "Error al leer la colección" }, 500);
  }
}

export async function subirDocumentos(c: Context) {
  const adminCheck = await requireAdmin(c);
  if ("error" in adminCheck) return adminCheck.error;

  const env = c.req.header("X-Environment") ?? "testing";
  if (env !== "testing" && env !== "production") {
    return c.json({ error: "Environment inválido" }, 400);
  }

  let body: SubirBody;
  try {
    body = await c.req.json<SubirBody>();
  } catch {
    return c.json({ error: "Body JSON inválido" }, 400);
  }

  const { datos, opciones, rutaColeccion } = body;

  if (typeof rutaColeccion !== "string" || !rutaColeccion.trim()) {
    return c.json({ error: "La ruta (colección o documento) es requerida" }, 400);
  }

  const sobrescribir = opciones?.sobrescribir ?? false;
  const merge = opciones?.merge ?? false;
  const path = rutaColeccion.trim();
  const pathSegments = path.split("/").filter(Boolean);

  if (pathSegments.length === 0) {
    return c.json({ error: "La ruta no puede estar vacía" }, 400);
  }

  const isDocumentPath = pathSegments.length % 2 === 0;
  const isArray = Array.isArray(datos);

  if (!isArray) {
    const singlePayload = buildPayload(datos);
    const name = getDocumentName(datos, 0);
    const resultados: ResultadosSubida = { documentos: [], errores: [], exitosos: 0, fallidos: 0, omitidos: 0 };

    try {
      const db = getFirestoreForEnvironment(env);
      if (isDocumentPath) {
        const docRef = getDocumentRef(db, path);
        const existente = await docRef.get();
        if (existente.exists && !sobrescribir) {
          resultados.omitidos = 1;
          resultados.documentos.push({ estado: "omitido", id: docRef.id, nombre: name });
          return c.json({ mensaje: "Documento ya existe (omitido). Usa sobrescribir para reemplazar.", proyecto: env, resultados, success: true });
        }
        await docRef.set(singlePayload, { merge });
        try {
          await docRef.update({ id: docRef.id });
        } catch {
          // ignore
        }
        resultados.exitosos = 1;
        resultados.documentos.push({ estado: "exitoso", id: docRef.id, nombre: name });
      } else {
        const collectionRef = getCollectionRef(db, path);
        const docRef = await collectionRef.add(singlePayload);
        try {
          await docRef.update({ id: docRef.id });
        } catch {
          // ignore
        }
        resultados.exitosos = 1;
        resultados.documentos.push({ estado: "exitoso", id: docRef.id, nombre: name });
      }
      return c.json({ mensaje: "Documento subido correctamente", proyecto: env, resultados, success: true });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.warn("Error subiendo documento único", { error: message });
      return c.json({ error: message, success: false }, 500);
    }
  }

  if (pathSegments.length % 2 === 0) {
    return c.json({ error: "Para subir varios documentos la ruta debe ser una colección (ej: faqs), no un documento (ej: faqs/id)" }, 400);
  }

  if (datos.length > MAX_DOCUMENTS_PER_REQUEST) {
    return c.json({ error: `Máximo ${String(MAX_DOCUMENTS_PER_REQUEST)} documentos por petición. Usa lotes en el cliente.` }, 400);
  }

  const db = getFirestoreForEnvironment(env);
  let collectionRef: Firestore.CollectionReference;
  try {
    collectionRef = getCollectionRef(db, path);
  } catch (err) {
    return c.json({ error: err instanceof Error ? err.message : "Ruta de colección inválida" }, 400);
  }

  const resultados: ResultadosSubida = { documentos: [], errores: [], exitosos: 0, fallidos: 0, omitidos: 0 };

  for (let i = 0; i < datos.length; i++) {
    const documento = datos[i];
    const name = getDocumentName(documento, i);

    try {
      const payload = buildPayload(documento);
      const rawId = payload.id;
      const providedId = rawId !== undefined && rawId !== null && (typeof rawId === "string" || typeof rawId === "number") ? String(rawId) : null;

      let docRef: Firestore.DocumentReference;

      if (providedId) {
        docRef = collectionRef.doc(providedId);
        const existente = await docRef.get();
        if (existente.exists && !sobrescribir) {
          resultados.omitidos++;
          resultados.documentos.push({ estado: "omitido", id: providedId, nombre: name });
          continue;
        }
        await docRef.set(payload, { merge });
        try {
          await docRef.update({ id: providedId });
        } catch {
          // id already present or same
        }
      } else {
        docRef = await collectionRef.add(payload);
        try {
          await docRef.update({ id: docRef.id });
        } catch {
          // ignore
        }
      }

      resultados.exitosos++;
      resultados.documentos.push({ estado: "exitoso", id: docRef.id, nombre: name });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.warn("Error subiendo documento", { error: message, index: i + 1, name });
      resultados.fallidos++;
      resultados.errores.push({ documento: name, error: message });
      resultados.documentos.push({ error: message, estado: "fallido", id: "", nombre: name });
    }
  }

  const mensaje = `Proceso completado: ${String(resultados.exitosos)} exitosos, ${String(resultados.fallidos)} fallidos, ${String(resultados.omitidos)} omitidos`;

  return c.json({ mensaje, proyecto: env, resultados, success: true });
}

function buildPayload(documento: unknown): Record<string, unknown> {
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

function trimDuplicacionLogParaRespuesta(log: DuplicacionLog): {
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
function prepareDocumentDataForWrite(
  docData: Record<string, unknown>,
  targetDb: Firestore.Firestore,
): Record<string, unknown> {
  const stripped = stripUndefinedDeep(docData) as Record<string, unknown>;
  return rewriteDocumentReferencesForTargetDb(stripped, targetDb) as Record<string, unknown>;
}

function stripUndefinedDeep(value: unknown): unknown {
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

function rewriteDocumentReferencesForTargetDb(value: unknown, targetDb: Firestore.Firestore): unknown {
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

async function copiarDocumentoRecursivo(
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

function createDuplicacionLog(operacion: string, proyectoOrigen: string, proyectoDestino: string, rutaOrigen: string, rutaDestino: string): DuplicacionLog {
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

function getCollectionRef(db: Firestore.Firestore, path: string): Firestore.CollectionReference {
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

function getDocumentName(doc: unknown, index: number): string {
  if (doc && typeof doc === "object") {
    const d = doc as Record<string, unknown>;
    if (typeof d.question === "string") return d.question;
    if (typeof d.name === "string") return d.name;
    if (typeof d.title === "string") return d.title;
  }
  return `Documento ${String(index + 1)}`;
}

function getDocumentRef(db: Firestore.Firestore, path: string): Firestore.DocumentReference {
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

function restoreFirestoreTypes(value: unknown): unknown {
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

function serializeFirestoreValue(value: unknown): unknown {
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