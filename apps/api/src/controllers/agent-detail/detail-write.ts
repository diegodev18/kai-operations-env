import type { Context } from "hono";

import { ApiErrors } from "@/lib/api-error";
import {
  PROPERTY_DOC_IDS,
  type PropertyDocId,
} from "@/constants/agentPropertyDefaults";
import { getFirestore } from "@/lib/firestore";
import {
  FIRESTORE_DATA_MODES,
  isFirestoreDataMode,
} from "@/constants/firestore-data-mode";
import { appendImplementationActivityEntry } from "@/services/implementation-activity.service";
import type { AgentsInfoAuthContext } from "@/types/agents";
import { resolveAgentWriteDatabase, userCanEditAgent } from "@/utils/agents";
import { isOperationsAdmin } from "@/utils/operations-access";
import { handleFirestoreError, requireAgentAccess } from "@/utils/agent-detail/access";

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

    if (documentId === "ai") {
      const aiBody = body as Record<string, unknown>;
      const model =
        typeof aiBody.model === "string" && aiBody.model.trim() !== ""
          ? aiBody.model
          : null;
      const temperature =
        aiBody.temperature !== undefined &&
        aiBody.temperature !== null &&
        Number.isFinite(Number(aiBody.temperature))
          ? Number(aiBody.temperature)
          : null;
      const updateData: Record<string, unknown> = {};
      if (model !== null) updateData["ai.model"] = model;
      if (temperature !== null) updateData["ai.temperature"] = temperature;
      if (Object.keys(updateData).length > 0) {
        await agentRef.update(updateData);
      }
    }

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
