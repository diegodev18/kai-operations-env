import type { QueryDocumentSnapshot } from "firebase-admin/firestore";

export type ParsedAgentDoc = {
  id: string;
  name: string;
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
    return {
      id: doc.id,
      name: typeof data.business_name === "string" ? data.business_name : "",
      owner: typeof data.owner_name === "string" ? data.owner_name : "",
      prompt,
    };
  } catch {
    return null;
  }
}
