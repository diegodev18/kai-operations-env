import type { PropertyDocumentId } from "@/types";

export const DOCUMENT_IDS: PropertyDocumentId[] = [
  "agent",
  "ai",
  "answer",
  "response",
  "time",
  "prompt",
  "memory",
  "mcp",
  "limitation",
];

export const DEFAULT_LLM_MODEL = "gemini-2.5-flash";

export const AGENT_LLM_MODELS = [
  "gemini-2.5-flash",
  "gemini-2.5-pro",
  "gemini-3-flash-preview",
  "gemini-3.1-flash-lite-preview",
] as const;

export const DOCUMENT_LABELS: Record<PropertyDocumentId, string> = {
  agent: "Conversación y comportamiento",
  ai: "IA y razonamiento",
  answer: "Mensajes",
  response: "Cadencia de respuesta",
  time: "Horarios y pausas",
  prompt: "Herramientas del agente",
  memory: "Memoria",
  mcp: "Revisión de respuestas",
  limitation: "Acceso y seguridad",
};

/** Default temperature by model family when not set in properties. */
export function getDefaultTemperatureForModel(model: string): number {
  if (/gemini-3/i.test(model)) return 0.25;
  if (/gemini-2\.5/i.test(model)) return 0.05;
  return 0.05;
}
