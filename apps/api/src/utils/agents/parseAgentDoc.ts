import type { QueryDocumentSnapshot } from "firebase-admin/firestore";

export type ParsedAgentDoc = {
  id: string;
  /** Igual que `businessName` (compatibilidad con clientes que usan `name`). */
  name: string;
  /** Nombre público del agente (`agent_name` en Firestore). */
  agentName: string;
  /** Nombre del negocio (`business_name` en Firestore). */
  businessName: string;
  owner: string;
  prompt: string;
  /** `mcp_configuration.system_prompt_generation_status` cuando existe. */
  systemPromptGenerationStatus?: string;
  systemPromptGenerationError?: string | null;
};

/**
 * Lee campos base de un documento `agent_configurations` en Firestore.
 */
export function parseAgentDoc(
  doc: QueryDocumentSnapshot,
  includePrompt: boolean,
): ParsedAgentDoc | null {
  try {
    const data = doc.data();
    let prompt = "";
    let systemPromptGenerationStatus: string | undefined;
    let systemPromptGenerationError: string | null | undefined;
    const mcp = data.mcp_configuration as
      | null
      | undefined
      | {
          system_prompt?: string;
          system_prompt_generation_status?: string;
          system_prompt_generation_error?: string | null;
        };
    if (includePrompt && mcp != null && typeof mcp === "object") {
      prompt =
        typeof mcp.system_prompt === "string" ? mcp.system_prompt : "";
    }
    if (mcp != null && typeof mcp === "object") {
      const st = mcp.system_prompt_generation_status;
      if (typeof st === "string" && st.length > 0) {
        systemPromptGenerationStatus = st;
      }
      const er = mcp.system_prompt_generation_error;
      if (typeof er === "string") {
        systemPromptGenerationError = er;
      } else if (er == null && "system_prompt_generation_error" in mcp) {
        systemPromptGenerationError = null;
      }
    }
    const businessName =
      typeof data.business_name === "string" ? data.business_name : "";
    const agentName =
      typeof data.agent_name === "string" ? data.agent_name : "";
    return {
      id: doc.id,
      name: businessName,
      agentName,
      businessName,
      owner: typeof data.owner_name === "string" ? data.owner_name : "",
      prompt,
      ...(systemPromptGenerationStatus != null
        ? { systemPromptGenerationStatus }
        : {}),
      ...(systemPromptGenerationError !== undefined
        ? { systemPromptGenerationError }
        : {}),
    };
  } catch {
    return null;
  }
}
