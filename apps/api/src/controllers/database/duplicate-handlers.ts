import type { Context } from "hono";

import { getFirestoreForEnvironment } from "@/lib/firestore";
import logger from "@/lib/logger";
import {
  requireAdmin,
  getCollectionRef,
  getDocumentRef,
  createDuplicacionLog,
  trimDuplicacionLogParaRespuesta,
  copiarDocumentoRecursivo,
  prepareDocumentDataForWrite,
  MAX_DUPLICAR_COLECCION,
  type DuplicarBody,
} from "@/utils/database/admin-operations";

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
