import type Firestore from "firebase-admin/firestore";
import type { Context } from "hono";

import { getFirestoreForEnvironment } from "@/lib/firestore";
import logger from "@/lib/logger";
import {
  requireAdmin,
  getDocumentRef,
  restoreFirestoreTypes,
  buildPayload,
  getCollectionRef,
  getDocumentName,
  MAX_DOCUMENTS_PER_REQUEST,
  type ActualizarDocumentoBody,
  type ResultadosSubida,
  type SubirBody,
} from "@/utils/database/admin-operations";

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
