import { z } from "zod";

export const postDraftBodySchema = z.object({
  agent_name: z.string().trim().min(1, "agent_name es obligatorio"),
  agent_personality: z
    .string()
    .trim()
    .min(1, "agent_personality es obligatorio"),
});

const patchPersonalitySchema = z.object({
  step: z.literal("personality"),
  agent_name: z.string().trim().min(1),
  agent_personality: z.string().trim().min(1),
  response_language: z.string().trim().min(1).max(80),
  use_emojis: z.string().trim().min(1),
  country_accent: z.string().trim().min(1),
  agent_signature: z.string().trim().min(1),
  tone: z.enum(["formal", "casual", "professional", "friendly"]),
  greeting_message: z.string().trim().max(500).optional(),
  response_length: z.enum(["short", "medium", "long"]).optional(),
  required_phrases: z.array(z.string().trim()).optional(),
  topics_to_avoid: z.array(z.string().trim()).optional(),
  conversation_style: z.enum(["interrogative", "informative"]).optional(),
});

const patchBusinessSchema = z.object({
  step: z.literal("business"),
  business_name: z.string().trim().min(1),
  owner_name: z.string().trim().min(1),
  industry: z.string().trim().min(1),
  custom_industry: z.string().trim().optional(),
  description: z.string().trim().min(1),
  agent_description: z.string().trim().min(1),
  target_audience: z.string().trim().min(1),
  escalation_rules: z.string().trim().min(1),
  country: z.string().trim().min(1),
  business_timezone: z.string().trim().optional(),
  phone_number_id: z.string().trim().optional(),
  whatsapp_token: z.string().trim().optional(),
  brand_values: z.array(z.string().trim()).optional(),
  featured_products: z.array(z.string().trim()).optional(),
  policies: z.string().trim().optional(),
  faq: z.string().trim().optional(),
  operating_hours: z.string().trim().optional(),
  active_promotions: z.string().trim().optional(),
  business_hours: z.string().trim().optional(),
  require_auth: z.boolean().optional(),
  flow_answers: z.record(z.string(), z.string()).optional(),
  flow_questions: z
    .array(
      z.object({
        field: z.string().trim().min(1),
        label: z.string().trim().min(1),
        type: z.enum(["text", "textarea", "select"]),
        placeholder: z.string().trim().optional(),
        options: z.array(z.string().trim()).optional(),
        suggestions: z.array(z.string().trim()).optional(),
        suggestion_mode: z.enum(["single", "multi"]).optional(),
        required: z.boolean().optional(),
      }),
    )
    .optional(),
  pipelines: z.array(z.record(z.string(), z.unknown())).optional(),
  /** Builder paso Avanzado → properties (mismo criterio que agent-configuration-editor). */
  ai_model: z.string().trim().optional(),
  ai_temperature: z.number().min(0).max(1).optional(),
  response_wait_time: z.number().int().min(0).optional(),
  is_memory_enable: z.boolean().optional(),
  is_multi_message_response_enable: z.boolean().optional(),
  is_validator_agent_enable: z.boolean().optional(),
  mcp_max_retries: z.number().int().min(0).optional(),
  answer_not_support: z.string().max(500).optional(),
});

const patchToolsSchema = z.object({
  step: z.literal("tools"),
  selected_tools: z.array(z.string().trim().min(1)).min(1),
  toolFlowsMarkdownEs: z.string().max(100_000).optional(),
});

const patchCompleteSchema = z.object({
  step: z.literal("complete"),
});

export const patchDraftBodySchema = z.discriminatedUnion("step", [
  patchPersonalitySchema,
  patchBusinessSchema,
  patchToolsSchema,
  patchCompleteSchema,
]);

export const createDraftPendingTaskSchema = z.object({
  title: z.string().trim().min(1, "title es obligatorio"),
  context: z.string().trim().optional(),
  postponed_from: z.string().trim().optional(),
});

export const patchDraftPendingTaskSchema = z.object({
  status: z.enum(["pending", "completed"]).optional(),
  title: z.string().trim().min(1).optional(),
  context: z.string().trim().optional(),
});

export const createDraftPropertyItemSchema = z.object({
  title: z.string().trim().min(1, "title es obligatorio"),
  content: z.string().trim().min(1, "content es obligatorio"),
});

export const patchDraftPropertyItemSchema = z
  .object({
    title: z.string().trim().min(1).optional(),
    content: z.string().trim().min(1).optional(),
  })
  .refine((body) => Object.keys(body).length > 0, {
    message: "No hay cambios para aplicar",
  });
