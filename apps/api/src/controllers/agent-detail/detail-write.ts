import type { Context } from "hono";
import type { DocumentReference } from "firebase-admin/firestore";
import { z } from "zod";

import { ApiErrors } from "@/lib/api-error";
import {
  PROPERTY_DOC_IDS,
  type PropertyDocId,
} from "@/constants/agent-property-defaults";
import { getFirestore, getFirestoreForEnvironment } from "@/lib/firestore";
import type { FirestoreEnvironment } from "@/lib/firestore";
import {
  FIRESTORE_DATA_MODES,
  isFirestoreDataMode,
} from "@/constants/firestore-data-mode";
import { appendImplementationActivityEntry } from "@/services/implementation-activity.service";
import type { AgentsInfoAuthContext } from "@/types/agents-types";
import { handleFirestoreError, requireAgentAccess } from "@/utils/agent-detail/access";
import {
  resolveAgentWriteDatabase,
  userCanEditAgent,
} from "@/utils/agents";
import { isOperationsAdmin } from "@/utils/operations-access";

const DYNAMIC_TABLE_SCHEMAS_COLLECTION = "dynamic_table_schemas";
const ALLOWED_SCHEMAS_SUBCOLLECTION = "allowedSchemas";

const patchAllowedDynamicTableSchemasBodySchema = z.object({
  schemaIds: z.array(z.string().min(1, "schemaId no puede estar vacío")),
});

function parseAllowedSchemasEnvironmentHeader(c: Context): FirestoreEnvironment | null {
  const raw = (c.req.header("X-Environment") ?? "testing").trim().toLowerCase();
  if (raw === "testing" || raw === "production") return raw;
  return null;
}

function dedupeSchemaIdsPreserveOrder(ids: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const id of ids) {
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

export async function updateAgentPropertyDocument(
  c: Context,
  authCtx: AgentsInfoAuthContext,
  agentId: string,
  documentId: string,
) {
  const denied = await requireAgentAccess(c, authCtx, agentId);
  if (denied) return denied;

  const canEdit = await userCanEditAgent(authCtx, agentId);
  if (!canEdit) {
    return c.json(
      { error: "No tienes permisos para editar este agente" },
      403,
    );
  }

  const isKnownDoc = PROPERTY_DOC_IDS.includes(documentId as PropertyDocId);
  const isValidDynamicDoc = /^[a-zA-Z0-9_-]{1,64}$/.test(documentId);
  if (!isKnownDoc && !isValidDynamicDoc) {
    return ApiErrors.validation(c, "documentId inválido");
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
  if (
    documentId === "agent" &&
    bodyObj.enabled === false &&
    !isOperationsAdmin(authCtx.userRole)
  ) {
    return ApiErrors.forbidden(c, "Solo un administrador puede apagar el agente");
  }

  try {
    const { db: database, hasTestingData, inProduction } =
      await resolveAgentWriteDatabase(agentId);
    if (!hasTestingData && !inProduction) {
      return ApiErrors.notFound(c, "Agente no encontrado");
    }
    const agentRef = database.collection("agent_configurations").doc(agentId);

    const docRef = hasTestingData
      ? agentRef.collection("testing").doc("data").collection("properties").doc(documentId)
      : agentRef.collection("properties").doc(documentId);
    await docRef.set(body as Record<string, unknown>, { merge: true });

    return c.json({ documentId, success: true });
  } catch (error) {
    const r = handleFirestoreError(c, error, "[agents/:id/properties PATCH]");
    return r ?? c.json({ error: "Error al guardar propiedades" }, 500);
  }
}

/**
 * Actualiza campos del documento raíz del agente (agent_configurations/{agentId}).
 * Solo permite campos seguros: version, firestore_data_mode.
 */
export async function patchAgent(
  c: Context,
  authCtx: AgentsInfoAuthContext,
  agentId: string,
) {
  const denied = await requireAgentAccess(c, authCtx, agentId);
  if (denied) return denied;

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
  const updateData: Record<string, unknown> = {};

  if ("version" in bodyObj) {
    updateData.version = bodyObj.version;
  }

  const rawMode =
    bodyObj.firestore_data_mode ?? bodyObj.firestoreDataMode;
  if (rawMode !== undefined) {
    if (!isOperationsAdmin(authCtx.userRole)) {
      return ApiErrors.forbidden(
        c,
        "Solo administradores pueden cambiar el modo de datos MCP (firestore_data_mode).",
      );
    }
    if (!isFirestoreDataMode(rawMode)) {
      return ApiErrors.validation(
        c,
        `firestore_data_mode debe ser uno de: ${FIRESTORE_DATA_MODES.join(", ")}`,
      );
    }
    updateData.firestore_data_mode = rawMode;
  }

  if (Object.keys(updateData).length === 0) {
    return ApiErrors.validation(c, "No hay campos válidos para actualizar");
  }

  try {
    const { db: database, hasTestingData, inProduction } =
      await resolveAgentWriteDatabase(agentId);
    if (!hasTestingData && !inProduction) {
      return ApiErrors.notFound(c, "Agente no encontrado");
    }
    const docRef = database.collection("agent_configurations").doc(agentId);
    await docRef.update(updateData);

    if ("version" in updateData) {
      const integrationsSnap = await database
        .collection("whatsapp_integrations")
        .where("agentDocId", "==", agentId)
        .get();
      for (const integrationDoc of integrationsSnap.docs) {
        await integrationDoc.ref.update({ version: updateData.version });
      }
    }

    return c.json({ success: true, updated: updateData });
  } catch (error) {
    const r = handleFirestoreError(c, error, "[agents/:id PATCH]");
    return r ?? c.json({ error: "Error al actualizar agente" }, 500);
  }
}

/**
 * Sincroniza `allowedSchemasIds` en el doc raíz y la subcolección `allowedSchemas`.
 * Valida IDs contra `dynamic_table_schemas` del proyecto indicado por `X-Environment`.
 */
export async function patchAgentAllowedDynamicTableSchemas(
  c: Context,
  authCtx: AgentsInfoAuthContext,
  agentId: string,
) {
  const denied = await requireAgentAccess(c, authCtx, agentId);
  if (denied) return denied;

  const canEdit = await userCanEditAgent(authCtx, agentId);
  if (!canEdit) {
    return c.json({ error: "No tienes permisos para editar este agente" }, 403);
  }

  const env = parseAllowedSchemasEnvironmentHeader(c);
  if (!env) {
    return ApiErrors.validation(c, "X-Environment debe ser testing o production");
  }

  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return ApiErrors.validation(c, "JSON inválido");
  }

  const parsed = patchAllowedDynamicTableSchemasBodySchema.safeParse(body);
  if (!parsed.success) {
    const msg = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
    return ApiErrors.validation(c, msg);
  }

  const schemaIds = dedupeSchemaIdsPreserveOrder(parsed.data.schemaIds);

  try {
    const envDb = getFirestoreForEnvironment(env);
    const validation = await Promise.all(
      schemaIds.map(async (id) => {
        const snap = await envDb.collection(DYNAMIC_TABLE_SCHEMAS_COLLECTION).doc(id).get();
        return { id, exists: snap.exists };
      }),
    );
    const missing = validation.filter((v) => !v.exists).map((v) => v.id);
    if (missing.length > 0) {
      return ApiErrors.validation(
        c,
        `Esquemas no encontrados en ${env}: ${missing.join(", ")}`,
      );
    }

    const { db: database, hasTestingData, inProduction } =
      await resolveAgentWriteDatabase(agentId);
    if (!hasTestingData && !inProduction) {
      return ApiErrors.notFound(c, "Agente no encontrado");
    }

    const agentRef = database.collection("agent_configurations").doc(agentId);
    const allowedRef = agentRef.collection(ALLOWED_SCHEMAS_SUBCOLLECTION);
    const existingSnap = await allowedRef.get();
    const existingIds = new Set(existingSnap.docs.map((d) => d.id));
    const targetSet = new Set(schemaIds);
    const toDelete = [...existingIds].filter((id) => !targetSet.has(id));

    const BATCH_MAX = 450;
    type BatchOp =
      | { type: "update"; ref: DocumentReference; data: Record<string, unknown> }
      | { type: "set"; ref: DocumentReference; data: Record<string, unknown> }
      | { type: "delete"; ref: DocumentReference };

    const ops: BatchOp[] = [
      {
        type: "update",
        ref: agentRef,
        data: { allowedSchemasIds: schemaIds },
      },
    ];
    for (const id of schemaIds) {
      ops.push({
        type: "set",
        ref: allowedRef.doc(id),
        data: { schemaId: id, schemaName: id, type: "global" },
      });
    }
    for (const id of toDelete) {
      ops.push({ type: "delete", ref: allowedRef.doc(id) });
    }

    for (let i = 0; i < ops.length; i += BATCH_MAX) {
      const slice = ops.slice(i, i + BATCH_MAX);
      const batch = database.batch();
      for (const op of slice) {
        if (op.type === "update") batch.update(op.ref, op.data);
        else if (op.type === "set") batch.set(op.ref, op.data);
        else batch.delete(op.ref);
      }
      await batch.commit();
    }

    return c.json({ success: true, allowedSchemasIds: schemaIds });
  } catch (error) {
    const r = handleFirestoreError(c, error, "[agents/:id/allowed-dynamic-table-schemas PATCH]");
    return r ?? c.json({ error: "Error al guardar esquemas permitidos" }, 500);
  }
}

export async function postAgentOperationsArchive(
  c: Context,
  authCtx: AgentsInfoAuthContext,
  agentId: string,
) {
  const denied = await requireAgentAccess(c, authCtx, agentId);
  if (denied) return denied;

  if (!isOperationsAdmin(authCtx.userRole)) {
    return ApiErrors.forbidden(c, "Solo un administrador puede archivar agentes");
  }

  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return ApiErrors.validation(c, "JSON inválido");
  }

  const bodyObj =
    body != null && typeof body === "object" && !Array.isArray(body)
      ? (body as Record<string, unknown>)
      : null;
  if (!bodyObj) {
    return ApiErrors.validation(c, "El cuerpo debe ser un objeto");
  }

  const statusRaw = bodyObj.status;
  if (statusRaw !== "active" && statusRaw !== "archived") {
    return ApiErrors.validation(c, "status debe ser 'active' o 'archived'");
  }
  const status = statusRaw as "active" | "archived";
  const confirm = typeof bodyObj.confirm === "string" ? bodyObj.confirm : "";
  if (status === "archived" && confirm !== "CONFIRMAR") {
    return ApiErrors.validation(c, "Debes escribir CONFIRMAR para archivar");
  }

  try {
    const prod = getFirestore();
    const docRef = prod.collection("agent_configurations").doc(agentId);
    const snap = await docRef.get();
    if (!snap.exists) {
      return ApiErrors.notFound(c, "Agente no encontrado");
    }

    await docRef.update({ status });

    const actorEmail = authCtx.userEmail?.toLowerCase().trim() ?? null;
    void appendImplementationActivityEntry(prod, agentId, {
      kind: "system",
      actorEmail,
      action: status === "archived" ? "agent_archived" : "agent_unarchived",
      summary:
        status === "archived"
          ? "Archivó el agente en el panel de operaciones."
          : "Desarchivó el agente en el panel de operaciones.",
    });

    return c.json({ ok: true, status });
  } catch (error) {
    const r = handleFirestoreError(c, error, "[agents/:id/operations-archive POST]");
    return r ?? c.json({ error: "Error al actualizar status del agente" }, 500);
  }
}
