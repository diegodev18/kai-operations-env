import type { BuilderChatUI } from "@/types";

export type ChatMessage = {
  id: string;
  role: "assistant" | "user";
  /** Texto enviado al API (puede ser UI_VALUE / UI_FORM). */
  text: string;
  /** Texto mostrado en la burbuja del usuario (legible). */
  displayText?: string;
  ui?: BuilderChatUI;
};

export type DraftState = {
  agent_name: string;
  agent_personality: string;
  /** Idioma en que el agente hablará con el usuario (el system prompt generado se guarda en inglés). */
  response_language: string;
  business_name: string;
  owner_name: string;
  industry: string;
  description: string;
  agent_description: string;
  target_audience: string;
  escalation_rules: string;
  country: string;
  use_emojis: string;
  country_accent: string;
  agent_signature: string;
  business_timezone: string;
  selected_tools: string[];
  creation_step: "personality" | "business" | "tools" | "complete";
};

export type BusinessFieldKey =
  | "business_name"
  | "owner_name"
  | "industry"
  | "description"
  | "target_audience"
  | "agent_description"
  | "escalation_rules"
  | "business_timezone"
  | "country";

export type DraftTextKey =
  | "agent_name"
  | "agent_personality"
  | "response_language"
  | "business_name"
  | "owner_name"
  | "industry"
  | "description"
  | "agent_description"
  | "target_audience"
  | "escalation_rules"
  | "country"
  | "use_emojis"
  | "country_accent"
  | "agent_signature"
  | "business_timezone";

export type ManualNode = {
  id: string;
  title: string;
  value: string;
};

export type ManualSection = "business" | "personality";
export type BuilderMode = "unselected" | "conversational" | "form";
export type FormStep = "business" | "tools" | "personality" | "review";

export type RequiredNodeFieldKey =
  | BusinessFieldKey
  | "agent_name"
  | "agent_personality"
  | "response_language";
