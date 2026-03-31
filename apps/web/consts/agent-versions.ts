/** Available agent versions with their feature descriptions. */
export const AGENT_VERSIONS = [
  {
    value: "production",
    label: "production",
    description: "Versión estable actualmente en producción.",
  },
  {
    value: "2.0.0",
    label: "2.0.0",
    description: "Nueva arquitectura de prompts con soporte multi-función mejorado.",
  },
] as const;

export type AgentVersion = (typeof AGENT_VERSIONS)[number]["value"];
