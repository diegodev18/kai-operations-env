import type { Firestore } from "firebase-admin/firestore";

import { getFirestoreCommercial, FieldValue } from "@/lib/firestore";
import logger, { formatError } from "@/lib/logger";
import {
  type BuilderContextPayload,
  generateSystemPromptMultiPhase,
} from "@/services/system-prompt-generator";

const AGENT_CONFIG = "agent_configurations";
const TECH_PROPERTY_DOC_IDS = [
  "agent",
  "response",
  "prompt",
  "memory",
  "limitation",
  "answer",
] as const;

function stripUndefinedDeep(value: unknown): unknown {
  if (value === null) return null;
  if (Array.isArray(value)) return value.map(stripUndefinedDeep);
  if (typeof value === "object" && value !== null) {
    const o = value as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(o)) {
      if (v === undefined) continue;
      out[k] = stripUndefinedDeep(v);
    }
    return out;
  }
  return value;
}

async function loadAgentContext(
  db: Firestore,
  agentId: string,
): Promise<BuilderContextPayload | null> {
  const agentRef = db.collection(AGENT_CONFIG).doc(agentId);
  const agentSnap = await agentRef.get();
  if (!agentSnap.exists) return null;
  const draftRoot: Record<string, unknown> = {
    id: agentSnap.id,
    ...(agentSnap.data() ?? {}),
  };
  const toolsSnap = await agentRef.collection("tools").get();
  const tools = toolsSnap.docs.map((d) => ({
    id: d.id,
    ...(d.data() as Record<string, unknown>),
  }));
  const technicalProperties: Record<string, Record<string, unknown>> = {};
  for (const docId of TECH_PROPERTY_DOC_IDS) {
    const s = await agentRef.collection("properties").doc(docId).get();
    technicalProperties[docId] = s.exists
      ? { ...(s.data() as Record<string, unknown>) }
      : {};
  }
  const creatorEmail =
    typeof draftRoot["creator_email"] === "string"
      ? draftRoot["creator_email"]
      : "";
  const builderLanguageNote =
    "Context from agent_configurations (asistente comercial). Infer builder language from business fields. " +
    (creatorEmail ? `Builder contact email locale hint: ${creatorEmail}.` : "");

  const mcpPers =
    draftRoot.mcp_configuration != null &&
    typeof draftRoot.mcp_configuration === "object"
      ? (draftRoot.mcp_configuration as Record<string, unknown>).agent_personalization
      : undefined;
  const persObj =
    mcpPers != null && typeof mcpPers === "object"
      ? (mcpPers as Record<string, unknown>)
      : undefined;
  const responseLanguageRaw =
    typeof draftRoot["response_language"] === "string"
      ? draftRoot["response_language"]
      : typeof persObj?.["response_language"] === "string"
        ? persObj["response_language"]
        : "";
  const response_language =
    typeof responseLanguageRaw === "string" && responseLanguageRaw.trim()
      ? responseLanguageRaw.trim().slice(0, 80)
      : "Spanish";

  return {
    draftRoot: stripUndefinedDeep(draftRoot) as Record<string, unknown>,
    tools,
    technicalProperties,
    builderLanguageNote,
    response_language,
  };
}

async function applyMcpGenerationPatch(
  db: Firestore,
  id: string,
  patch: Record<string, unknown>,
): Promise<void> {
  const ref = db.collection(AGENT_CONFIG).doc(id);
  const snap = await ref.get();
  if (!snap.exists) return;
  await ref.update(patch);
}

async function markFailed(db: Firestore, agentId: string, message: string): Promise<void> {
  const short = message.slice(0, 900);
  const patch = {
    "mcp_configuration.system_prompt_generation_status": "failed",
    "mcp_configuration.system_prompt_generation_error": short,
    "mcp_configuration.system_prompt_generation_updated_at":
      FieldValue.serverTimestamp(),
  };
  await applyMcpGenerationPatch(db, agentId, patch);
}

async function markReady(
  db: Firestore,
  agentId: string,
  systemPrompt: string,
): Promise<void> {
  const patch = {
    "mcp_configuration.system_prompt": systemPrompt,
    "mcp_configuration.system_prompt_generation_status": "ready",
    "mcp_configuration.system_prompt_generation_error": null,
    "mcp_configuration.system_prompt_generation_updated_at":
      FieldValue.serverTimestamp(),
  };
  await applyMcpGenerationPatch(db, agentId, patch);
}

/**
 * Generación multi-fase del system prompt en `agent_configurations` (asistente comercial).
 */
export async function runSystemPromptGenerationJob(agentId: string): Promise<void> {
  const db = getFirestoreCommercial();
  const context = await loadAgentContext(db, agentId);
  if (!context) {
    logger.warn("system prompt job: no agent document", agentId);
    await markFailed(db, agentId, "No se encontró el agente para generar contexto.");
    return;
  }

  const result = await generateSystemPromptMultiPhase(context, {});
  if ("error" in result) {
    await markFailed(db, agentId, result.error);
    return;
  }

  try {
    await markReady(db, agentId, result.system_prompt);
    logger.info("system prompt job: completed for agent", agentId);
  } catch (err) {
    logger.error("system prompt job: persist failed", formatError(err));
    await markFailed(
      db,
      agentId,
      err instanceof Error ? err.message : "Error al guardar en Firestore.",
    );
  }
}

/** Marca el documento como en generación (reintento manual). */
export async function setSystemPromptGeneratingFlags(agentId: string): Promise<void> {
  const db = getFirestoreCommercial();
  const patch = {
    "mcp_configuration.system_prompt_generation_status": "generating",
    "mcp_configuration.system_prompt_generation_error": null,
    "mcp_configuration.system_prompt_generation_updated_at":
      FieldValue.serverTimestamp(),
  };
  await applyMcpGenerationPatch(db, agentId, patch);
}
