import type { Context } from "hono";
import admin from "firebase-admin";
import type { DocumentData } from "firebase-admin/firestore";

import { FieldValue, getFirestoreForEnvironment } from "@/lib/firestore";
import type { FirestoreEnvironment } from "@/lib/firestore";
import logger, { formatError } from "@/lib/logger";
import { requireAdmin, stripUndefinedDeep } from "@/utils/database/admin-operations";
import {
  dynamicTableSchemaCreateBodySchema,
  dynamicTableSchemaNewDocumentInputSchema,
  dynamicTableSchemaPatchBodySchema,
  type DynamicTableSchemaCreateBody,
} from "@/utils/dynamic-table-schemas/schema-zod";

const COLLECTION = "dynamic_table_schemas";
const LIST_LIMIT = 200;

function parseEnvironment(c: Context): FirestoreEnvironment | null {
  const env = (c.req.header("X-Environment") ?? "testing").trim();
  if (env === "testing" || env === "production") return env;
  return null;
}

function zodErrorResponse(c: Context, err: import("zod").ZodError) {
  const message = err.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
  return c.json({ error: message, issues: err.issues }, 400);
}

function serializeTimestamp(val: unknown): string | null {
  if (val instanceof admin.firestore.Timestamp) {
    return val.toDate().toISOString();
  }
  if (
    val &&
    typeof val === "object" &&
    "_seconds" in val &&
    typeof (val as { _seconds: unknown })._seconds === "number"
  ) {
    const s = val as { _seconds: number; _nanoseconds?: number };
    return new admin.firestore.Timestamp(s._seconds, s._nanoseconds ?? 0).toDate().toISOString();
  }
  return null;
}

function serializeSchemaDocument(
  id: string,
  data: DocumentData | undefined,
): Record<string, unknown> | null {
  if (!data) return null;
  return {
    schemaId: typeof data.schemaId === "string" ? data.schemaId : id,
    label: data.label ?? "",
    description: data.description ?? null,
    version: typeof data.version === "number" ? data.version : 1,
    targetCollection: data.targetCollection ?? "",
    fields: Array.isArray(data.fields) ? data.fields : [],
    createdAt: serializeTimestamp(data.createdAt),
    updatedAt: serializeTimestamp(data.updatedAt),
  };
}

function existingPayloadFromDoc(
  data: DocumentData | undefined,
  schemaId: string,
): DynamicTableSchemaCreateBody | null {
  if (!data) return null;
  const label = typeof data.label === "string" ? data.label : "";
  const description = typeof data.description === "string" ? data.description : undefined;
  const version = typeof data.version === "number" ? data.version : 1;
  const targetCollection = typeof data.targetCollection === "string" ? data.targetCollection : "";
  const fields = Array.isArray(data.fields) ? data.fields : [];
  const parsed = dynamicTableSchemaCreateBodySchema.safeParse({
    schemaId,
    label,
    description,
    version,
    targetCollection,
    fields,
  });
  return parsed.success ? parsed.data : null;
}

export async function listDynamicTableSchemas(c: Context) {
  const adminCheck = await requireAdmin(c);
  if ("error" in adminCheck) return adminCheck.error;

  const env = parseEnvironment(c);
  if (!env) return c.json({ error: "Environment inválido (use testing o production)" }, 400);

  try {
    const db = getFirestoreForEnvironment(env);
    const snap = await db
      .collection(COLLECTION)
      .orderBy("updatedAt", "desc")
      .limit(LIST_LIMIT)
      .get()
      .catch(async () => {
        return db.collection(COLLECTION).limit(LIST_LIMIT).get();
      });

    const schemas = snap.docs
      .map((doc) => serializeSchemaDocument(doc.id, doc.data()))
      .filter((s): s is Record<string, unknown> => s !== null);

    return c.json({ schemas, success: true });
  } catch (error) {
    logger.error("listDynamicTableSchemas", { error: formatError(error) });
    return c.json({ error: error instanceof Error ? error.message : "Error al listar esquemas" }, 500);
  }
}

export async function getDynamicTableSchema(c: Context) {
  const adminCheck = await requireAdmin(c);
  if ("error" in adminCheck) return adminCheck.error;

  const env = parseEnvironment(c);
  if (!env) return c.json({ error: "Environment inválido" }, 400);

  const schemaId = c.req.param("schemaId")?.trim();
  if (!schemaId) return c.json({ error: "schemaId requerido" }, 400);

  try {
    const db = getFirestoreForEnvironment(env);
    const docSnap = await db.collection(COLLECTION).doc(schemaId).get();
    if (!docSnap.exists) {
      return c.json({ error: "Esquema no encontrado" }, 404);
    }
    const schema = serializeSchemaDocument(docSnap.id, docSnap.data());
    return c.json({ schema, success: true });
  } catch (error) {
    logger.error("getDynamicTableSchema", { error: formatError(error), schemaId });
    return c.json({ error: error instanceof Error ? error.message : "Error al leer esquema" }, 500);
  }
}

export async function createDynamicTableSchema(c: Context) {
  const adminCheck = await requireAdmin(c);
  if ("error" in adminCheck) return adminCheck.error;

  const env = parseEnvironment(c);
  if (!env) return c.json({ error: "Environment inválido" }, 400);

  let raw: unknown;
  try {
    raw = await c.req.json();
  } catch {
    return c.json({ error: "Body JSON inválido" }, 400);
  }

  const parsed = dynamicTableSchemaNewDocumentInputSchema.safeParse(raw);
  if (!parsed.success) return zodErrorResponse(c, parsed.error);

  const body = parsed.data;
  try {
    const db = getFirestoreForEnvironment(env);
    const ref = db.collection(COLLECTION).doc();
    const schemaId = ref.id;

    const payload = stripUndefinedDeep({
      schemaId,
      label: body.label,
      description: body.description,
      version: body.version,
      targetCollection: body.targetCollection,
      fields: body.fields,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    }) as Record<string, unknown>;

    await ref.set(payload);

    const written = await ref.get();
    const schema = serializeSchemaDocument(written.id, written.data());
    return c.json({ schema, success: true }, 201);
  } catch (error) {
    logger.error("createDynamicTableSchema", { error: formatError(error) });
    return c.json({ error: error instanceof Error ? error.message : "Error al crear esquema" }, 500);
  }
}

export async function patchDynamicTableSchema(c: Context) {
  const adminCheck = await requireAdmin(c);
  if ("error" in adminCheck) return adminCheck.error;

  const env = parseEnvironment(c);
  if (!env) return c.json({ error: "Environment inválido" }, 400);

  const schemaId = c.req.param("schemaId")?.trim();
  if (!schemaId) return c.json({ error: "schemaId requerido" }, 400);

  let raw: unknown;
  try {
    raw = await c.req.json();
  } catch {
    return c.json({ error: "Body JSON inválido" }, 400);
  }

  const patchParsed = dynamicTableSchemaPatchBodySchema.safeParse(raw);
  if (!patchParsed.success) return zodErrorResponse(c, patchParsed.error);

  try {
    const db = getFirestoreForEnvironment(env);
    const ref = db.collection(COLLECTION).doc(schemaId);
    const snap = await ref.get();
    if (!snap.exists) {
      return c.json({ error: "Esquema no encontrado" }, 404);
    }

    const existingPayload = existingPayloadFromDoc(snap.data(), schemaId);
    if (!existingPayload) {
      return c.json({ error: "Documento inválido o corrupto" }, 400);
    }

    const patch = patchParsed.data;
    const merged: DynamicTableSchemaCreateBody = {
      schemaId,
      label: patch.label ?? existingPayload.label,
      description: patch.description !== undefined ? patch.description : existingPayload.description,
      version: patch.version ?? existingPayload.version,
      targetCollection: patch.targetCollection ?? existingPayload.targetCollection,
      fields: patch.fields ?? existingPayload.fields,
    };

    const fullParsed = dynamicTableSchemaCreateBodySchema.safeParse(merged);
    if (!fullParsed.success) return zodErrorResponse(c, fullParsed.error);

    const body = fullParsed.data;
    const payload = stripUndefinedDeep({
      schemaId: body.schemaId,
      label: body.label,
      description: body.description,
      version: body.version,
      targetCollection: body.targetCollection,
      fields: body.fields,
      updatedAt: FieldValue.serverTimestamp(),
    }) as Record<string, unknown>;

    await ref.update(payload);

    const written = await ref.get();
    const schema = serializeSchemaDocument(written.id, written.data());
    return c.json({ schema, success: true });
  } catch (error) {
    logger.error("patchDynamicTableSchema", { error: formatError(error), schemaId });
    return c.json({ error: error instanceof Error ? error.message : "Error al actualizar esquema" }, 500);
  }
}

export async function deleteDynamicTableSchema(c: Context) {
  const adminCheck = await requireAdmin(c);
  if ("error" in adminCheck) return adminCheck.error;

  const env = parseEnvironment(c);
  if (!env) return c.json({ error: "Environment inválido" }, 400);

  const schemaId = c.req.param("schemaId")?.trim();
  if (!schemaId) return c.json({ error: "schemaId requerido" }, 400);

  try {
    const db = getFirestoreForEnvironment(env);
    const ref = db.collection(COLLECTION).doc(schemaId);
    const snap = await ref.get();
    if (!snap.exists) {
      return c.json({ error: "Esquema no encontrado" }, 404);
    }
    await ref.delete();
    return c.json({ success: true });
  } catch (error) {
    logger.error("deleteDynamicTableSchema", { error: formatError(error), schemaId });
    return c.json({ error: error instanceof Error ? error.message : "Error al eliminar esquema" }, 500);
  }
}
