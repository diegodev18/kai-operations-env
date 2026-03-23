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
    if (includePrompt) {
      const mcp = data.mcp_configuration as
        | null
        | undefined
        | { system_prompt?: string };
      prompt =
        mcp != null && typeof mcp.system_prompt === "string"
          ? mcp.system_prompt
          : "";
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
    };
  } catch {
    return null;
  }
}
