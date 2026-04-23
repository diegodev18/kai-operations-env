import type { Context } from "hono";
import { FieldValue } from "firebase-admin/firestore";

import { ApiErrors } from "@/lib/api-error";
import { appendImplementationActivityEntry } from "@/services/implementation-activity.service";
import type { AgentsInfoAuthContext } from "@/types/agents-types";
import { resolveAgentWriteDatabase, userCanAccessAgent } from "@/utils/agents";
import {
  extractFirestoreIndexUrl,
  firestoreFailureHint,
  isFirebaseConfigError,
} from "@/utils/firestore/errors";

const TOOL_TYPES = ["custom", "default", "preset"] as const;

/** Reject values that look like pasted IDE/repo paths instead of MCP tool identifiers. */
function looksLikeAccidentalRepoPath(value: string): boolean {
  const s = value.trim();
  if (!s) return false;
  if (s.includes("@")) return true;
  if (/\bKAI-OPERATIONS-ENV\b/i.test(s)) return true;
  if (s.includes("/apps/web/") || s.includes("/components/")) return true;
  if (/\.(tsx|jsx|cts|mts)$/i.test(s)) return true;
  if (/\.ts$/i.test(s) && s.includes("/")) return true;
  return false;
}

function isFirebaseErr(error: unknown): boolean {
  return isFirebaseConfigError(error);
}

function handleFs(c: Context, error: unknown, log: string) {
  if (isFirebaseErr(error)) {
    return c.json(
      {
        error:
          "Firebase no configurado. Define credenciales de servicio (env o tokens).",
      },
      503,
    );
  }
  const hint = firestoreFailureHint(error);
  const msg = error instanceof Error ? error.message : String(error);
  const createIndexUrl = extractFirestoreIndexUrl(msg);
  console.error(log, msg);
  if (hint) {
    return c.json(
      { error: hint, ...(createIndexUrl ? { createIndexUrl } : {}) },
      503,
    );
  }
  return ApiErrors.internal(c, "Error en Firestore");
}

async function requireAccess(
  c: Context,
  authCtx: AgentsInfoAuthContext,
  agentId: string,
) {
  try {
    const ok = await userCanAccessAgent(authCtx, agentId);
    if (!ok) return ApiErrors.forbidden(c, "No autorizado para este agente");
    return null;
  } catch (e) {
    return handleFs(c, e, "[agent-tools access]");
  }
}

function parseToolDoc(
  id: string,
  data: Record<string, unknown>,
): {
  description: string;
  displayName?: string;
  enabled?: boolean;
  id: string;
  name: string;
  parameters?: unknown;
  properties?: unknown;
  crmConfig?: unknown;
  path?: string;
  required_agent_properties?: string[];
  type: string;
} {
  const rawProps = data.required_agent_properties;
  const required_agent_properties =
    Array.isArray(rawProps) && rawProps.every((x) => typeof x === "string")
      ? rawProps
      : undefined;
  return {
    description: typeof data.description === "string" ? data.description : "",
    displayName:
      typeof data.displayName === "string" ? data.displayName : undefined,
    enabled: typeof data.enabled === "boolean" ? data.enabled : true,
    id,
    name: typeof data.name === "string" ? data.name : "",
    parameters: data.parameters,
    properties: data.properties,
    crmConfig: data.crmConfig,
    path:
      typeof data.path === "string" && data.path.trim()
        ? data.path.trim()
        : undefined,
    required_agent_properties: required_agent_properties?.length
      ? required_agent_properties
      : undefined,
    type:
      typeof data.type === "string" &&
      TOOL_TYPES.includes(data.type as (typeof TOOL_TYPES)[number])
        ? data.type
        : "custom",
  };
}

const TOOL_FIELD_LABELS_ES: Record<string, string> = {
  name: "nombre interno",
  description: "descripción",
  type: "tipo",
  parameters: "parámetros",
  properties: "propiedades",
  crmConfig: "CRM",
  required_agent_properties: "propiedades de agente requeridas",
  displayName: "nombre para mostrar",
  path: "ruta",
  enabled: "activación",
};

function toolDisplayLabel(toolId: string, data: Record<string, unknown>): string {
  const parsed = parseToolDoc(toolId, data);
  const label = parsed.displayName?.trim() || parsed.name?.trim();
  return label.length > 0 ? label : toolId;
}

function spanishToolFieldLabels(keys: string[]): string {
  return keys.map((k) => TOOL_FIELD_LABELS_ES[k] ?? k).join(", ");
}

export async function getAgentTools(
  c: Context,
  authCtx: AgentsInfoAuthContext,
  agentId: string,
) {
  const denied = await requireAccess(c, authCtx, agentId);
  if (denied) return denied;

  try {
    const { db: database, hasTestingData, inProduction } =
      await resolveAgentWriteDatabase(agentId);
    if (!hasTestingData && !inProduction) {
      return ApiErrors.notFound(c, "Agente no encontrado");
    }
    const agentRef = database.collection("agent_configurations").doc(agentId);

    const toolsRef = hasTestingData
      ? agentRef.collection("testing").doc("data").collection("tools")
      : agentRef.collection("tools");

    const toolsSnap = await toolsRef.get();
    const tools = toolsSnap.docs.map((doc) =>
      parseToolDoc(doc.id, doc.data() as Record<string, unknown>),
    );
    return c.json({ tools });
  } catch (error) {
    const r = handleFs(c, error, "[agent-tools GET]");
    return r ?? ApiErrors.internal(c, "Error al listar tools");
  }
}

export async function createAgentTool(
  c: Context,
  authCtx: AgentsInfoAuthContext,
  agentId: string,
) {
  const denied = await requireAccess(c, authCtx, agentId);
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

  const b = body as Record<string, unknown>;
  const name = typeof b.name === "string" ? b.name.trim() : "";
  const description =
    typeof b.description === "string" ? b.description.trim() : "";
  const type =
    typeof b.type === "string" &&
    TOOL_TYPES.includes(b.type as (typeof TOOL_TYPES)[number])
      ? b.type
      : "custom";

  if (!name) {
    return ApiErrors.validation(c, "name es obligatorio");
  }
  if (!description) {
    return ApiErrors.validation(c, "description es obligatoria");
  }

  const enabled = typeof b.enabled === "boolean" ? b.enabled : true;

  const parameters =
    b.parameters != null &&
    typeof b.parameters === "object" &&
    !Array.isArray(b.parameters)
      ? b.parameters
      : undefined;
  const properties =
    b.properties != null &&
    typeof b.properties === "object" &&
    !Array.isArray(b.properties)
      ? b.properties
      : undefined;

  const rawRequired = b.required_agent_properties;
  const required_agent_properties =
    Array.isArray(rawRequired) && rawRequired.every((x) => typeof x === "string")
      ? rawRequired.map((s) => String(s).trim()).filter(Boolean)
      : undefined;

  const displayName =
    typeof b.displayName === "string" ? b.displayName.trim() || undefined : undefined;

  let pathValue: string | undefined =
    typeof b.path === "string" ? b.path.trim() || undefined : undefined;
  if (
    (type === "default" || type === "preset") &&
    !pathValue &&
    name
  ) {
    pathValue = name.replace(/_/g, "/");
  }

  if (looksLikeAccidentalRepoPath(name)) {
    return ApiErrors.validation(
      c,
      "El nombre no debe ser una ruta de archivo del repositorio; usa el identificador de la tool (p. ej. kai_database_register_new_client).",
    );
  }
  if (pathValue && looksLikeAccidentalRepoPath(pathValue)) {
    return ApiErrors.validation(
      c,
      "path debe ser la ruta MCP del módulo (p. ej. kai/categoria/nombre_tool), no una ruta de archivo local.",
    );
  }

  try {
    const { db: database, hasTestingData, inProduction } =
      await resolveAgentWriteDatabase(agentId);
    if (!hasTestingData && !inProduction) {
      return ApiErrors.notFound(c, "Agente no encontrado");
    }
    const agentRef = database.collection("agent_configurations").doc(agentId);

    const toolsRef = hasTestingData
      ? agentRef.collection("testing").doc("data").collection("tools")
      : agentRef.collection("tools");

    const toolData: Record<string, unknown> = {
      createdAt: FieldValue.serverTimestamp(),
      description,
      enabled,
      name,
      type,
      updatedAt: FieldValue.serverTimestamp(),
    };
    if (displayName) toolData.displayName = displayName;
    if (pathValue) toolData.path = pathValue;
    if (parameters) {
      toolData.parameters = parameters;
    }
    if (properties) {
      toolData.properties = properties;
    }
    if (required_agent_properties?.length) {
      toolData.required_agent_properties = required_agent_properties;
    }

    const ref = await toolsRef.add(toolData);
    await ref.update({ id: ref.id });

    const createdLabel = (displayName?.trim() || name).slice(0, 200);
    void appendImplementationActivityEntry(database, agentId, {
      kind: "system",
      actorEmail: authCtx.userEmail?.toLowerCase().trim() ?? null,
      action: "tool_created",
      summary: `Agregó la herramienta «${createdLabel}».`,
      metadata: { toolId: ref.id, name },
    });

    const created = parseToolDoc(ref.id, { ...toolData, id: ref.id });
    return c.json(created, 201);
  } catch (error) {
    const r = handleFs(c, error, "[agent-tools POST]");
    return r ?? c.json({ error: "Error al crear tool" }, 500);
  }
}

export async function updateAgentTool(
  c: Context,
  authCtx: AgentsInfoAuthContext,
  agentId: string,
  toolId: string,
) {
  const denied = await requireAccess(c, authCtx, agentId);
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

  const b = body as Record<string, unknown>;
  const updates: Record<string, unknown> = {};
  if (typeof b.name === "string" && b.name.trim()) updates.name = b.name.trim();
  if (typeof b.description === "string") updates.description = b.description.trim();
  if (
    typeof b.type === "string" &&
    TOOL_TYPES.includes(b.type as (typeof TOOL_TYPES)[number])
  ) {
    updates.type = b.type;
  }
  if (b.parameters !== undefined) {
    updates.parameters =
      b.parameters != null &&
      typeof b.parameters === "object" &&
      !Array.isArray(b.parameters)
        ? b.parameters
        : null;
  }
  if (b.properties !== undefined) {
    updates.properties =
      b.properties != null &&
      typeof b.properties === "object" &&
      !Array.isArray(b.properties)
        ? b.properties
        : null;
  }
  if (b.crmConfig !== undefined) {
    updates.crmConfig =
      b.crmConfig != null &&
      typeof b.crmConfig === "object"
        ? b.crmConfig
        : null;
  }
  if (b.required_agent_properties !== undefined) {
    const raw = b.required_agent_properties;
    updates.required_agent_properties =
      Array.isArray(raw) && raw.every((x) => typeof x === "string")
        ? raw.map((s) => String(s).trim()).filter(Boolean)
        : null;
  }
  if (b.displayName !== undefined) {
    updates.displayName =
      typeof b.displayName === "string" && b.displayName.trim()
        ? b.displayName.trim()
        : null;
  }
  if (b.path !== undefined) {
    updates.path =
      typeof b.path === "string" && b.path.trim() ? b.path.trim() : null;
  }

  if (b.enabled !== undefined) {
    updates.enabled = typeof b.enabled === "boolean" ? b.enabled : undefined;
    if (updates.enabled === undefined) delete updates.enabled;
  }

  if (Object.keys(updates).length === 0) {
    return ApiErrors.validation(c, "No hay campos válidos para actualizar");
  }

  if (typeof updates.name === "string" && looksLikeAccidentalRepoPath(updates.name)) {
    return ApiErrors.validation(
      c,
      "El nombre no debe ser una ruta de archivo del repositorio; usa el identificador de la tool (p. ej. kai_database_register_new_client).",
    );
  }
  if (
    typeof updates.path === "string" &&
    updates.path &&
    looksLikeAccidentalRepoPath(updates.path)
  ) {
    return ApiErrors.validation(
      c,
      "path debe ser la ruta MCP del módulo (p. ej. kai/categoria/nombre_tool), no una ruta de archivo local.",
    );
  }

  updates.updatedAt = FieldValue.serverTimestamp();

  try {
    const { db: database, hasTestingData, inProduction } =
      await resolveAgentWriteDatabase(agentId);
    if (!hasTestingData && !inProduction) {
      return ApiErrors.notFound(c, "Agente no encontrado");
    }
    const agentRef = database.collection("agent_configurations").doc(agentId);

    const toolsRef = hasTestingData
      ? agentRef.collection("testing").doc("data").collection("tools")
      : agentRef.collection("tools");
    const toolRef = toolsRef.doc(toolId);
    const toolSnap = await toolRef.get();
    if (!toolSnap.exists) {
      return ApiErrors.notFound(c, "Tool no encontrada");
    }

    const existingData = toolSnap.data() as Record<string, unknown>;
    const labelBefore = toolDisplayLabel(toolId, existingData);

    await toolRef.update(updates);
    const updatedSnap = await toolRef.get();
    const data = updatedSnap.data() as Record<string, unknown>;
    const result = parseToolDoc(toolId, { ...data, id: toolId });

    const fieldKeys = Object.keys(updates).filter((k) => k !== "updatedAt");
    const actorEmail = authCtx.userEmail?.toLowerCase().trim() ?? null;

    if (
      fieldKeys.length === 1 &&
      fieldKeys[0] === "enabled" &&
      typeof updates.enabled === "boolean"
    ) {
      const on = updates.enabled;
      void appendImplementationActivityEntry(database, agentId, {
        kind: "system",
        actorEmail,
        action: on ? "tool_enabled" : "tool_disabled",
        summary: on
          ? `Activó la herramienta «${labelBefore}».`
          : `Desactivó la herramienta «${labelBefore}».`,
        metadata: { toolId, name: parseToolDoc(toolId, existingData).name },
      });
    } else {
      const labelAfter = toolDisplayLabel(toolId, data);
      const parts = spanishToolFieldLabels(fieldKeys);
      const summary = parts
        ? `Modificó la herramienta «${labelAfter}» (${parts}).`
        : `Modificó la herramienta «${labelAfter}».`;
      void appendImplementationActivityEntry(database, agentId, {
        kind: "system",
        actorEmail,
        action: "tool_updated",
        summary,
        metadata: { toolId, fields: fieldKeys },
      });
    }

    return c.json(result);
  } catch (error) {
    const r = handleFs(c, error, "[agent-tools PATCH]");
    return r ?? c.json({ error: "Error al actualizar tool" }, 500);
  }
}

export async function deleteAgentTool(
  c: Context,
  authCtx: AgentsInfoAuthContext,
  agentId: string,
  toolId: string,
) {
  const denied = await requireAccess(c, authCtx, agentId);
  if (denied) return denied;

  try {
    const { db: database, hasTestingData, inProduction } =
      await resolveAgentWriteDatabase(agentId);
    if (!hasTestingData && !inProduction) {
      return ApiErrors.notFound(c, "Agente no encontrado");
    }
    const agentRef = database.collection("agent_configurations").doc(agentId);

    const toolsRef = hasTestingData
      ? agentRef.collection("testing").doc("data").collection("tools")
      : agentRef.collection("tools");
    const toolRef = toolsRef.doc(toolId);
    const toolSnap = await toolRef.get();
    if (!toolSnap.exists) {
      return ApiErrors.notFound(c, "Tool no encontrada");
    }

    const deletedData = toolSnap.data() as Record<string, unknown>;
    const deletedLabel = toolDisplayLabel(toolId, deletedData);

    await toolRef.delete();

    void appendImplementationActivityEntry(database, agentId, {
      kind: "system",
      actorEmail: authCtx.userEmail?.toLowerCase().trim() ?? null,
      action: "tool_deleted",
      summary: `Eliminó la herramienta «${deletedLabel}».`,
      metadata: { toolId, name: parseToolDoc(toolId, deletedData).name },
    });

    return c.json({ success: true });
  } catch (error) {
    const r = handleFs(c, error, "[agent-tools DELETE]");
    return r ?? ApiErrors.internal(c, "Error al eliminar tool");
  }
}
