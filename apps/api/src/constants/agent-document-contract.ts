/**
 * Metadatos de persistencia del agente en Firestore.
 * @see `FIRESTORE_DATA_MODES` en `firestore-data-mode.ts`
 */
export const AGENT_DOCUMENT_CONTRACT = {
  root: {
    /** Campos opcionales de runtime leídos por MCP (además de los de negocio). */
    optionalRuntimeFields: ["firestore_data_mode"] as const,
  },
} as const;
