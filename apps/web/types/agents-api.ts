/** Tipos compartidos de respuestas y payloads de `lib/agents-api`. */

export type AgentGrowerRow = { email: string; name: string };

export type ImplementationTaskStatus = "pending" | "completed";

export type ImplementationTask = {
  id: string;
  title: string;
  description?: string;
  status: ImplementationTaskStatus;
  dueDate?: string | null;
  assigneeEmails: string[];
  createdByEmail?: string;
  createdAt?: string | null;
  updatedAt?: string | null;
};

export type ToolsCatalogItem = {
  id: string;
  name: string;
  displayName: string;
  description: string;
  path: string;
  type: string;
  category: string;
  /** Schema JSON para el LLM (opcional). */
  parameters?: Record<string, unknown>;
  /** Schema OpenAPI de propiedades del agente (opcional). */
  properties?: Record<string, unknown>;
};

export type AgentDraftPatchBody =
  | {
      step: "personality";
      agent_name: string;
      agent_personality: string;
    }
  | {
      step: "business";
      business_name: string;
      owner_name: string;
      industry: string;
      description: string;
      agent_description: string;
      target_audience: string;
      escalation_rules: string;
      country?: string;
      phone_number_id?: string;
      whatsapp_token?: string;
    }
  | { step: "tools"; selected_tools: string[] }
  | { step: "complete" };

export type AgentDraftClient = Record<string, unknown>;

export type DraftPendingTaskStatus = "pending" | "completed";

export type DraftPendingTask = {
  id: string;
  title: string;
  context?: string;
  status: DraftPendingTaskStatus;
  postponed_from?: string;
  created_at?: string | null;
  updated_at?: string | null;
  completed_at?: string | null;
};

export type BuilderChatMessage = {
  role: "assistant" | "user";
  text: string;
};

/** UI interactiva opcional emitida por el builder (un bloque por turno). */
export type BuilderChatUIOptions = {
  type: "options";
  uiId: string;
  title?: string;
  options: Array<{ id: string; label: string; value: string }>;
};

export type BuilderChatUIFormField = {
  key: string;
  label: string;
  kind: "text" | "textarea" | "select";
  required?: boolean;
  placeholder?: string;
  options?: Array<{ value: string; label: string }>;
};

export type BuilderChatUIForm = {
  type: "form";
  uiId: string;
  formId: string;
  title?: string;
  fields: BuilderChatUIFormField[];
  submitLabel?: string;
};

export type BuilderChatUI = BuilderChatUIOptions | BuilderChatUIForm;

export type BuilderChatDraftPatch = Partial<{
  agent_name: string;
  agent_personality: string;
  business_name: string;
  owner_name: string;
  industry: string;
  description: string;
  agent_description: string;
  target_audience: string;
  escalation_rules: string;
  country: string;
  selected_tools: string[];
}>;
