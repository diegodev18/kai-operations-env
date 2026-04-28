import type { Context } from "hono";

import { getFirestoreForEnvironment } from "@/lib/firestore";
import logger, { formatError } from "@/lib/logger";
import {
  MAX_ITEMS_GET_DOCUMENTOS,
  PREVIEW_LIMIT,
  requireAdmin,
  getCollectionRef,
  getDocumentRef,
  serializeFirestoreValue,
  type GetDocumentosBody,
} from "@/utils/database/admin-operations";

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
