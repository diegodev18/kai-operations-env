/**
 * Modo de enrutamiento de datos en Firestore (MCP-KAI-AGENTS / AGENTS_TOOLS_MCP).
 * Raíz: `agent_configurations/{agentId}.firestore_data_mode`
 */
export const FIRESTORE_DATA_MODES = ["auto", "testing", "production"] as const;

export type FirestoreDataMode = (typeof FIRESTORE_DATA_MODES)[number];

export function isFirestoreDataMode(v: unknown): v is FirestoreDataMode {
  return (
    v === "auto" || v === "testing" || v === "production"
  );
}

export function normalizeFirestoreDataMode(raw: unknown): FirestoreDataMode {
  return isFirestoreDataMode(raw) ? raw : "auto";
}
