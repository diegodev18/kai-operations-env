import { serializeValue } from "@/utils/agents/serializeAgentRootForClient";

import { DRAFT_PROPERTY_DOC_IDS } from "./constants";

export function extractMcpGenerationMeta(data: Record<string, unknown>): {
  systemPromptGenerationStatus?: string;
  systemPromptGenerationError?: string | null;
} {
  const mcp = data.mcp_configuration;
  if (mcp == null || typeof mcp !== "object" || Array.isArray(mcp)) {
    return {};
  }
  const o = mcp as Record<string, unknown>;
  const st = o.system_prompt_generation_status;
  const err = o.system_prompt_generation_error;
  const out: {
    systemPromptGenerationStatus?: string;
    systemPromptGenerationError?: string | null;
  } = {};
  if (typeof st === "string" && st.length > 0) {
    out.systemPromptGenerationStatus = st;
  }
  if (typeof err === "string") {
    out.systemPromptGenerationError = err;
  } else if (err == null && "system_prompt_generation_error" in o) {
    out.systemPromptGenerationError = null;
  }
  return out;
}

export function serializePendingTaskForClient(
  id: string,
  data: Record<string, unknown>,
): Record<string, unknown> {
  return {
    id,
    title: typeof data.title === "string" ? data.title : "",
    context: typeof data.context === "string" ? data.context : "",
    status: data.status === "completed" ? "completed" : "pending",
    postponed_from:
      typeof data.postponed_from === "string" ? data.postponed_from : "",
    created_at: serializeValue(data.created_at),
    updated_at: serializeValue(data.updated_at),
    completed_at: serializeValue(data.completed_at),
  };
}

export function isDraftPropertyDocumentId(value: string): boolean {
  return DRAFT_PROPERTY_DOC_IDS.has(value);
}

export function serializeDraftPropertyItemForClient(
  id: string,
  data: Record<string, unknown>,
): Record<string, unknown> {
  return {
    id,
    title: typeof data.title === "string" ? data.title : "",
    content: typeof data.content === "string" ? data.content : "",
    created_at: serializeValue(data.created_at),
    updated_at: serializeValue(data.updated_at),
  };
}
