import type { Context } from "hono";

import { getFirestore } from "@/lib/firestore";
import type { AgentsInfoAuthContext } from "@/types/agents";
import { userCanAccessAgent } from "@/utils/agents";
import {
  extractFirestoreIndexUrl,
  firestoreFailureHint,
  isFirebaseConfigError,
} from "@/utils/firestore/errors";

const TOOL_TYPES = ["custom", "default", "preset"] as const;

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
  return c.json({ error: "Error en Firestore" }, 500);
}

async function requireAccess(
  c: Context,
  authCtx: AgentsInfoAuthContext,
  agentId: string,
) {
  try {
    const db = getFirestore();
    const ok = await userCanAccessAgent(db, authCtx, agentId);
    if (!ok) return c.json({ error: "No autorizado para este agente" }, 403);
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

export async function getAgentTools(
  c: Context,
  authCtx: AgentsInfoAuthContext,
  agentId: string,
) {
  const denied = await requireAccess(c, authCtx, agentId);
  if (denied) return denied;

  try {
    const database = getFirestore();
    const agentRef = database.collection("agent_configurations").doc(agentId);
    const agentSnap = await agentRef.get();
    if (!agentSnap.exists) {
      return c.json({ error: "Agente no encontrado" }, 404);
    }

    const toolsSnap = await agentRef.collection("tools").get();
    const tools = toolsSnap.docs.map((doc) =>
      parseToolDoc(doc.id, doc.data() as Record<string, unknown>),
    );
    return c.json({ tools });
  } catch (error) {
    const r = handleFs(c, error, "[agent-tools GET]");
    return r ?? c.json({ error: "Error al listar tools" }, 500);
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
    return c.json({ error: "JSON inválido" }, 400);
  }

  if (body == null || typeof body !== "object" || Array.isArray(body)) {
    return c.json({ error: "El cuerpo debe ser un objeto" }, 400);
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
    return c.json({ error: "name es obligatorio" }, 400);
  }
  if (!description) {
    return c.json({ error: "description es obligatoria" }, 400);
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

  try {
    const database = getFirestore();
    const agentRef = database.collection("agent_configurations").doc(agentId);
    const agentSnap = await agentRef.get();
    if (!agentSnap.exists) {
      return c.json({ error: "Agente no encontrado" }, 404);
    }

    const toolData: Record<string, unknown> = {
      description,
      enabled,
      name,
      type,
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

    const ref = await agentRef.collection("tools").add(toolData);
    await ref.update({ id: ref.id });

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
    return c.json({ error: "JSON inválido" }, 400);
  }

  if (body == null || typeof body !== "object" || Array.isArray(body)) {
    return c.json({ error: "El cuerpo debe ser un objeto" }, 400);
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
    return c.json({ error: "No hay campos válidos para actualizar" }, 400);
  }

  try {
    const database = getFirestore();
    const toolRef = database
      .collection("agent_configurations")
      .doc(agentId)
      .collection("tools")
      .doc(toolId);
    const toolSnap = await toolRef.get();
    if (!toolSnap.exists) {
      return c.json({ error: "Tool no encontrada" }, 404);
    }

    await toolRef.update(updates);
    const updatedSnap = await toolRef.get();
    const data = updatedSnap.data() as Record<string, unknown>;
    const result = parseToolDoc(toolId, { ...data, id: toolId });
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
    const database = getFirestore();
    const agentRef = database.collection("agent_configurations").doc(agentId);
    const agentSnap = await agentRef.get();
    if (!agentSnap.exists) {
      return c.json({ error: "Agente no encontrado" }, 404);
    }

    const toolRef = agentRef.collection("tools").doc(toolId);
    const toolSnap = await toolRef.get();
    if (!toolSnap.exists) {
      return c.json({ error: "Tool no encontrada" }, 404);
    }

    await toolRef.delete();
    return c.json({ success: true });
  } catch (error) {
    const r = handleFs(c, error, "[agent-tools DELETE]");
    return r ?? c.json({ error: "Error al eliminar tool" }, 500);
  }
}
