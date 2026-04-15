import type { DocumentReference } from "firebase-admin/firestore";

import { PROPERTY_DEFAULTS } from "@/constants/agentPropertyDefaults";

/** Aligned with apps/web agent-configuration-editor AGENT_LLM_MODELS. */
export const BUILDER_LLM_MODELS = [
  "gemini-2.5-flash",
  "gemini-2.5-pro",
  "gemini-3-flash-preview",
  "gemini-3.1-flash-lite-preview",
] as const;

export type BuilderLlmModel = (typeof BUILDER_LLM_MODELS)[number];

export function getDefaultTemperatureForModel(model: string): number {
  if (/gemini-3/i.test(model)) return 0.25;
  if (/gemini-2\.5/i.test(model)) return 0.05;
  return 0.05;
}

function resolveTimeZone(businessTimezone: string | undefined): string {
  const t = (businessTimezone ?? "").trim();
  if (t.length > 0) return t;
  return PROPERTY_DEFAULTS.time.zone;
}

export type BuilderAdvancedPatchInput = {
  business_timezone?: string;
  require_auth?: boolean;
  ai_model?: string;
  ai_temperature?: number;
  response_wait_time?: number;
  is_memory_enable?: boolean;
  is_multi_message_response_enable?: boolean;
  is_validator_agent_enable?: boolean;
  mcp_max_retries?: number;
  answer_not_support?: string;
};

/**
 * Merges builder "Avanzado" fields into draft `properties/*` and
 * `testing/data/properties/*` (same shape as agent-configuration-editor).
 * Call after `writeDefaultAgentProperties` on first business PATCH, or alone if docs already exist.
 */
export async function applyBuilderAdvancedProperties(
  draftRef: DocumentReference,
  body: BuilderAdvancedPatchInput,
): Promise<void> {
  const db = draftRef.firestore;
  const batch = db.batch();

  const modelRaw = body.ai_model?.trim() ?? "";
  const model = BUILDER_LLM_MODELS.includes(modelRaw as BuilderLlmModel)
    ? modelRaw
    : PROPERTY_DEFAULTS.ai.model;

  const temperature =
    body.ai_temperature !== undefined && Number.isFinite(body.ai_temperature)
      ? Math.min(1, Math.max(0, body.ai_temperature))
      : getDefaultTemperatureForModel(model);

  const waitTime =
    body.response_wait_time !== undefined && Number.isFinite(body.response_wait_time)
      ? Math.max(0, Math.floor(body.response_wait_time))
      : PROPERTY_DEFAULTS.response.waitTime;

  const mcpMaxRetries =
    body.mcp_max_retries !== undefined && Number.isFinite(body.mcp_max_retries)
      ? Math.max(0, Math.floor(body.mcp_max_retries))
      : PROPERTY_DEFAULTS.mcp.maxRetries;

  const zone = resolveTimeZone(body.business_timezone);

  const notSupportRaw = body.answer_not_support?.trim();
  const notSupport =
    notSupportRaw && notSupportRaw.length > 0
      ? notSupportRaw.slice(0, 500)
      : PROPERTY_DEFAULTS.answer.notSupport;

  const requireAuth = body.require_auth === true;

  const agentPatch = {
    isAuthEnable: requireAuth,
    isMemoryEnable:
      body.is_memory_enable !== undefined
        ? body.is_memory_enable
        : PROPERTY_DEFAULTS.agent.isMemoryEnable,
    isMultiMessageEnable: false,
    isMultiMessageResponseEnable:
      body.is_multi_message_response_enable !== undefined
        ? body.is_multi_message_response_enable
        : PROPERTY_DEFAULTS.agent.isMultiMessageResponseEnable,
    isValidatorAgentEnable:
      body.is_validator_agent_enable !== undefined
        ? body.is_validator_agent_enable
        : PROPERTY_DEFAULTS.agent.isValidatorAgentEnable,
  };

  const aiPatch = {
    model,
    temperature,
  };

  const responsePatch = {
    waitTime,
  };

  const mcpPatch = {
    maxRetries: mcpMaxRetries,
  };

  const timePatch = {
    zone,
  };

  const answerPatch = {
    notSupport,
  };

  const promptPatch = {
    model,
    temperature,
  };

  const props = draftRef.collection("properties");
  const testingProps = draftRef.collection("testing").doc("data").collection("properties");

  const pairs: Array<[string, Record<string, unknown>]> = [
    ["agent", agentPatch as Record<string, unknown>],
    ["ai", aiPatch as Record<string, unknown>],
    ["response", responsePatch as Record<string, unknown>],
    ["mcp", mcpPatch as Record<string, unknown>],
    ["time", timePatch as Record<string, unknown>],
    ["answer", answerPatch as Record<string, unknown>],
    ["prompt", promptPatch as Record<string, unknown>],
  ];

  for (const [docId, data] of pairs) {
    batch.set(props.doc(docId), data, { merge: true });
    batch.set(testingProps.doc(docId), data, { merge: true });
  }

  await batch.commit();

  await draftRef.update({
    "ai.model": model,
    "ai.temperature": temperature,
  });
}
