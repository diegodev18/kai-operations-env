export type PersonalityTrait =
  | "friendly"
  | "professional"
  | "humorous"
  | "empathetic"
  | "direct"
  | "close"
  | "patient"
  | "proactive"
  | "technical";

export type EmojiPreference = "never" | "moderate" | "always";

export type FormSectionId =
  | "templates"
  | "business"
  | "tools"
  | "personality"
  | "advanced"
  | "flows"
  | "pipelines"
  | "review";

export interface FormSection {
  id: FormSectionId;
  title: string;
  description: string;
  icon: string;
  required: boolean;
}

export interface FormQuestion {
  id: string;
  field: string;
  label: string;
  type: "text" | "textarea" | "select" | "toggle" | "radio";
  placeholder?: string;
  required?: boolean;
  dependsOn?: {
    field: string;
    hasValue?: boolean;
  };
  suggestions?: string[];
  aiSuggestion?: boolean;
}

export interface ToolCategory {
  id: string;
  label: string;
  icon: string;
  color: string;
}

export interface AgentTemplate {
  id: string;
  label: string;
  description: string;
  icon: string;
  suggestedTools: string[];
  presetPersonality: {
    use_emojis: EmojiPreference;
    traits: PersonalityTrait[];
  };
  prefill: Record<string, string>;
  industry?: string;
  agent_description?: string;
}

/** Pregunta dinámica del paso Flujos (alineada con el API). */
export type AgentFlowQuestion = {
  field: string;
  label: string;
  type: "text" | "textarea" | "select";
  placeholder?: string;
  options?: string[];
  /** Respuestas ejemplo para text/textarea: chips en la UI. */
  suggestions?: string[];
  /** Con `suggestions`: una opción o varias. */
  suggestion_mode?: "single" | "multi";
  required?: boolean;
};

export type PersonalityTone = "formal" | "casual" | "professional" | "friendly";

export type ResponseLength = "short" | "medium" | "long";

export type ConversationStyle = "interrogative" | "informative";

export type StageType = "OPPORTUNITIES" | "INTEREST" | "REQUIRES_ATTENTION" | "COMPLETED" | "CANCELLED";

export interface Stage {
  id: string;
  name: string;
  stageType: StageType | null;
  order: number;
  color: string;
  icon: string;
  description?: string;
  isClosedWon: boolean;
  isClosedLost: boolean;
  isDefault: boolean;
}

export interface Pipeline {
  id: string;
  name: string;
  description?: string;
  isDefault: boolean;
  stages: Stage[];
}

export interface FormBuilderState {
  business_name: string;
  owner_name: string;
  industry: string;
  custom_industry: string;
  description: string;
  target_audience: string;
  agent_description: string;
  escalation_rules: string;
  country: string;
  business_timezone: string;
  agent_name: string;
  agent_personality: string;
  response_language: string;
  use_emojis: EmojiPreference;
  country_accent: string;
  agent_signature: string;
  personality_traits: PersonalityTrait[];
  tone: PersonalityTone;
  greetingMessage: string;
  responseLength: ResponseLength;
  requiredPhrases: string[];
  topicsToAvoid: string[];
  conversationStyle: ConversationStyle;
  brandValues: string[];
  policies: string;
  selected_tools: string[];
  /** Manual de flujos de herramientas (markdown en español); vacío si se omite el paso. */
  toolFlowsMarkdownEs: string;
  whatsapp_enabled: boolean;
  email_enabled: boolean;
  chat_enabled: boolean;
  require_auth: boolean;
  /** Avanzado: alineado con properties (agent-configuration-editor). */
  ai_model: string;
  ai_temperature: number;
  response_wait_time: number;
  is_memory_enable: boolean;
  is_multi_message_response_enable: boolean;
  is_validator_agent_enable: boolean;
  mcp_max_retries: number;
  answer_not_support: string;
  flow_questions: AgentFlowQuestion[];
  flow_answers: Record<string, string>;
  pipelines: Pipeline[];
}
