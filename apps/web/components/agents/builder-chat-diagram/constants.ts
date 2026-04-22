import type { BusinessFieldKey, FormStep } from "./types";

export const THINKING_LABELS = [
  "Construyendo agente...",
  "Refinando agente...",
  "Analizando contexto...",
  "Buscando tools relevantes...",
  "Ajustando la respuesta...",
  "Optimizando el flujo...",
];

export const BUSINESS_FLOW: BusinessFieldKey[] = [
  "business_name",
  "owner_name",
  "industry",
  "description",
  "target_audience",
  "agent_description",
  "escalation_rules",
  "business_timezone",
  "country",
];

export const FORM_STEPS: FormStep[] = ["business", "tools", "personality", "review"];

export const BUSINESS_FIELD_GRAPH: Array<{ key: BusinessFieldKey; label: string }> = [
  { key: "business_name", label: "Nombre" },
  { key: "owner_name", label: "Responsable" },
  { key: "industry", label: "Industria" },
  { key: "description", label: "Descripción" },
  { key: "target_audience", label: "Audiencia" },
  { key: "agent_description", label: "Rol del agente" },
  { key: "escalation_rules", label: "Escalamiento" },
  { key: "business_timezone", label: "Zona horaria" },
  { key: "country", label: "País" },
];

/** Altura del área de mensaje: crece hasta 4 líneas (`leading-5`), luego scroll. */
export const CHAT_COMPOSER_LINE_HEIGHT_PX = 20;
export const CHAT_COMPOSER_PAD_Y_PX = 12;
export const CHAT_COMPOSER_MIN_HEIGHT_PX =
  CHAT_COMPOSER_LINE_HEIGHT_PX + CHAT_COMPOSER_PAD_Y_PX;
export const CHAT_COMPOSER_MAX_HEIGHT_PX =
  CHAT_COMPOSER_LINE_HEIGHT_PX * 4 + CHAT_COMPOSER_PAD_Y_PX;
