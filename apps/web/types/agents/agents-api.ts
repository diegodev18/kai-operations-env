/** Tipos de respuestas y payloads del cliente HTTP de agentes (`services/agents`). */

export type AgentGrowerRow = { email: string; name: string };

export type AgentTechLeadRow = { email: string; name: string };

export type ImplementationTaskStatus = "pending" | "completed";

export type ImplementationTaskAttachment = {
  name: string;
  url: string;
  uploadedAt: string;
};

export type ImplementationTaskType =
  | "connect-number"
  | "csf-request"
  | "payment-domiciliation"
  | "quote-sent"
  | "representative-contact"
  | "custom";

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
  mandatory?: boolean;
  taskType?: ImplementationTaskType;
  attachments?: ImplementationTaskAttachment[];
  representativeEmail?: string | null;
  representativePhone?: string | null;
};

export type ImplementationActivityKind = "comment" | "system";

export type ImplementationActivityEntry = {
  id: string;
  kind: ImplementationActivityKind;
  createdAt: string | null;
  actorEmail: string | null;
  format?: "html";
  bodyHtml?: string;
  hidden?: boolean;
  action?: string;
  summary?: string;
  metadata?: Record<string, unknown>;
};

export type AgentCommercialStatus =
  | "building"
  | "internal_test"
  | "client_test"
  | "iterating"
  | "delivered";

export type AgentServerStatus =
  | "active"
  | "disabled"
  | "no_connected_number";

export type LifecycleUpdatedFrom = "manual" | "automation" | "sync";

export type AgentImplementationLifecycle = {
  createdAt: string | null;
  soldAt: string | null;
  deliveredAt: string | null;
  nextMeetingAt: string | null;
  commercialStatus: AgentCommercialStatus;
  serverStatus: AgentServerStatus;
  serverStatusAuto: AgentServerStatus;
  serverStatusOverride: AgentServerStatus | null;
  updatedBy: string | null;
  updatedFrom: LifecycleUpdatedFrom;
  reasonCode: string | null;
  updatedAt: string | null;
};

/** Respuesta de GET .../whatsapp-integration-status (sin datos sensibles). */
export type WhatsappIntegrationStatusItem = {
  id: string;
  phoneNumber?: string;
  formattedPhoneNumber?: string;
  setupStatus?: string;
  registrationStatus?: string;
  connectedAt?: string | null;
  isCoexistence?: boolean;
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
  /** CRM configuration for the tool (opcional). */
  crmConfig?: unknown;
};

export type AgentDraftPatchBody =
  | {
      step: "personality";
      agent_name: string;
      agent_personality: string;
      response_language: string;
      use_emojis: string;
      country_accent: string;
      agent_signature: string;
      tone?: "formal" | "casual" | "professional" | "friendly";
      greeting_message?: string;
      response_length?: "short" | "medium" | "long";
      required_phrases?: string[];
      topics_to_avoid?: string[];
      conversation_style?: "interrogative" | "informative";
    }
  | {
      step: "business";
      business_name: string;
      owner_name: string;
      industry: string;
      custom_industry?: string;
      description: string;
      agent_description: string;
      target_audience: string;
      escalation_rules: string;
      country: string;
      business_timezone?: string;
      business_hours?: string;
      require_auth?: boolean;
      flow_answers?: Record<string, string>;
      flow_questions?: Array<{
        field: string;
        label: string;
        type: "text" | "textarea" | "select";
        placeholder?: string;
        options?: string[];
        suggestions?: string[];
        suggestion_mode?: "single" | "multi";
        required?: boolean;
      }>;
      pipelines?: Array<Record<string, unknown>>;
      phone_number_id?: string;
      whatsapp_token?: string;
      brand_values?: string[];
      featured_products?: string[];
      policies?: string;
      faq?: string;
      operating_hours?: string;
      active_promotions?: string;
      ai_model?: string;
      ai_temperature?: number;
      response_wait_time?: number;
      is_memory_enable?: boolean;
      is_multi_message_response_enable?: boolean;
      is_validator_agent_enable?: boolean;
      mcp_max_retries?: number;
      answer_not_support?: string;
    }
  | { step: "tools"; selected_tools: string[]; toolFlowsMarkdownEs?: string }
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
  /** Checkboxes + botón confirmar; el envío usa el prefijo UI_MULTI. */
  multiSelect?: boolean;
  /** Texto del botón al usar multiSelect (p. ej. "Aplicar cambios"). */
  submitLabel?: string;
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
}>;

/** Payload camelCase guardado en Firestore `builderCompanies` / API builder saved-companies. */
export type BuilderCompanyPayload = {
  businessName: string;
  industry: string;
  customIndustry?: string;
  description: string;
  targetAudience: string;
  agentDescription: string;
  escalationRules: string;
  country: string;
  businessTimezone?: string;
  brandValues?: string[];
  policies?: string;
};

export type SavedBuilderCompany = {
  id: string;
  name: string;
  payload: BuilderCompanyPayload;
  createdAt: string | null;
  updatedAt: string | null;
};

/** Respuesta de GET /api/agents/:id/builder-form (solo lectura). */
export type AgentBuilderFormAdvanced = {
  agent?: Record<string, unknown>;
  ai?: Record<string, unknown>;
  answer?: Record<string, unknown>;
  response?: Record<string, unknown>;
  time?: Record<string, unknown>;
  mcp?: Record<string, unknown>;
};

/** Bloque root + personality + business + advanced (live o primer envío). */
export type AgentBuilderFormPayload = {
  root: Record<string, unknown>;
  personality: Record<string, unknown> | null;
  business: Record<string, unknown> | null;
  advanced: AgentBuilderFormAdvanced;
};

/** Snapshot inmutable del primer envío (incl. fecha de guardado). */
export type AgentBuilderFormInitialPayload = AgentBuilderFormPayload & {
  saved_at?: string | null;
};

export type AgentBuilderFormResponse = {
  initial: AgentBuilderFormInitialPayload | null;
  /** Ausente en respuestas antiguas; usar `root`/`personality`/… en la raíz. */
  live?: AgentBuilderFormPayload;
  has_initial_snapshot?: boolean;
  /** Duplican `live` cuando existe (retrocompat). */
  root: Record<string, unknown>;
  personality: Record<string, unknown> | null;
  business: Record<string, unknown> | null;
  advanced: AgentBuilderFormAdvanced;
  in_commercial?: boolean;
  in_production?: boolean;
  primary_source?: "commercial" | "production";
};

/** Ítem de lista en documentos de propiedades del borrador (personality / business). */
export type DraftPropertyItem = {
  id: string;
  title: string;
  content: string;
  created_at?: string | null;
  updated_at?: string | null;
};
