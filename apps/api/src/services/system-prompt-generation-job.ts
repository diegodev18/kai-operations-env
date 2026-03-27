import type { Firestore } from "firebase-admin/firestore";

import { getFirestore, FieldValue } from "@/lib/firestore";
import logger, { formatError } from "@/lib/logger";
import {
  type BuilderContextPayload,
  generateSystemPromptMultiPhase,
} from "@/services/system-prompt-generator";

const AGENT_DRAFTS = "agent_drafts";
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

const AGENT_CONFIG = "agent_configurations";

async function loadBuilderContext(
  db: Firestore,
  draftId: string,
): Promise<BuilderContextPayload | null> {
  const draftRef = db.collection(AGENT_DRAFTS).doc(draftId);
  const draftSnap = await draftRef.get();
  if (!draftSnap.exists) return null;
  const draftRoot: Record<string, unknown> = {
    id: draftSnap.id,
    ...(draftSnap.data() ?? {}),
  };
  const toolsSnap = await draftRef.collection("tools").get();
  const tools = toolsSnap.docs.map((d) => ({
    id: d.id,
    ...(d.data() as Record<string, unknown>),
  }));
  const technicalProperties: Record<string, Record<string, unknown>> = {};
  for (const docId of TECH_PROPERTY_DOC_IDS) {
    const s = await draftRef.collection("properties").doc(docId).get();
    technicalProperties[docId] = s.exists
      ? { ...(s.data() as Record<string, unknown>) }
      : {};
  }
  const creatorEmail =
    typeof draftRoot["creator_email"] === "string"
      ? draftRoot["creator_email"]
      : "";
  const builderLanguageNote =
    "The builder user and business fields may be in Spanish or another language; " +
    "infer the user's language from those strings. " +
    (creatorEmail ? `Builder contact email locale hint: ${creatorEmail}.` : "");

  return {
    draftRoot: stripUndefinedDeep(draftRoot) as Record<string, unknown>,
    tools,
    technicalProperties,
    builderLanguageNote,
  };
}

/** Contexto desde `agent_configurations` cuando no hay borrador (reintento desde panel). */
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
  const builderLanguageNote =
    "Context loaded from agent_configurations (no draft). Infer builder language from business fields.";
  return {
    draftRoot: stripUndefinedDeep(draftRoot) as Record<string, unknown>,
    tools,
    technicalProperties,
    builderLanguageNote,
  };
}

async function loadContextForId(
  db: Firestore,
  id: string,
): Promise<BuilderContextPayload | null> {
  const fromDraft = await loadBuilderContext(db, id);
  if (fromDraft) return fromDraft;
  return loadAgentContext(db, id);
}

async function applyMcpGenerationPatch(
  db: Firestore,
  docPath: typeof AGENT_DRAFTS | typeof AGENT_CONFIG,
  id: string,
  patch: Record<string, unknown>,
): Promise<void> {
  const ref = db.collection(docPath).doc(id);
  const snap = await ref.get();
  if (!snap.exists) return;
  await ref.update(patch);
}

async function markFailed(db: Firestore, draftId: string, message: string): Promise<void> {
  const short = message.slice(0, 900);
  const patch = {
    "mcp_configuration.system_prompt_generation_status": "failed",
    "mcp_configuration.system_prompt_generation_error": short,
    "mcp_configuration.system_prompt_generation_updated_at":
      FieldValue.serverTimestamp(),
  };
  await applyMcpGenerationPatch(db, AGENT_DRAFTS, draftId, patch);
  await applyMcpGenerationPatch(db, AGENT_CONFIG, draftId, patch);
}

async function markReady(
  db: Firestore,
  draftId: string,
  systemPrompt: string,
): Promise<void> {
  const patch = {
    "mcp_configuration.system_prompt": systemPrompt,
    "mcp_configuration.system_prompt_generation_status": "ready",
    "mcp_configuration.system_prompt_generation_error": null,
    "mcp_configuration.system_prompt_generation_updated_at":
      FieldValue.serverTimestamp(),
  };
  await applyMcpGenerationPatch(db, AGENT_DRAFTS, draftId, patch);
  await applyMcpGenerationPatch(db, AGENT_CONFIG, draftId, patch);
}

/**
 * Ejecuta generación multi-fase y persiste en `agent_drafts` y, si existe, `agent_configurations` con el mismo id.
 */
export async function runSystemPromptGenerationJob(draftId: string): Promise<void> {
  const db = getFirestore();
  const context = await loadContextForId(db, draftId);
  if (!context) {
    logger.warn("system prompt job: no draft or agent document", draftId);
    await markFailed(db, draftId, "No se encontró borrador ni agente para generar contexto.");
    return;
  }

  const result = await generateSystemPromptMultiPhase(context, {});
  if ("error" in result) {
    await markFailed(db, draftId, result.error);
    return;
  }

  try {
    await markReady(db, draftId, result.system_prompt);
    logger.info("system prompt job: completed for draft", draftId);
  } catch (err) {
    logger.error("system prompt job: persist failed", formatError(err));
    await markFailed(
      db,
      draftId,
      err instanceof Error ? err.message : "Error al guardar en Firestore.",
    );
  }
}

/** Marca ambos documentos como en generación si existen (reintento manual). */
export async function setSystemPromptGeneratingFlags(draftId: string): Promise<void> {
  const db = getFirestore();
  const patch = {
    "mcp_configuration.system_prompt_generation_status": "generating",
    "mcp_configuration.system_prompt_generation_error": null,
    "mcp_configuration.system_prompt_generation_updated_at":
      FieldValue.serverTimestamp(),
  };
  await applyMcpGenerationPatch(db, AGENT_DRAFTS, draftId, patch);
  await applyMcpGenerationPatch(db, AGENT_CONFIG, draftId, patch);
}
