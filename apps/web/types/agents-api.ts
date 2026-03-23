/** Tipos compartidos de respuestas y payloads de `lib/agents-api`. */

export type AgentGrowerRow = { email: string; name: string };

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
