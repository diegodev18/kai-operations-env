import { PROPERTY_DOC_IDS } from "@/constants/agentPropertyDefaults";

/** Subconjunto de `properties` del borrador expuesto como bundle técnico. */
export const DRAFT_TECHNICAL_PROPERTY_DOC_IDS = [
  "agent",
  "response",
  "prompt",
  "memory",
  "limitation",
  "answer",
] as const satisfies readonly (typeof PROPERTY_DOC_IDS)[number][];
