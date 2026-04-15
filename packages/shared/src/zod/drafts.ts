import { z } from "zod";

export const postDraftBodySchema = z.object({
  agent_name: z.string().trim().min(1, "agent_name es obligatorio"),
  agent_personality: z
    .string()
    .trim()
    .min(1, "agent_personality es obligatorio"),
});

export const patchPersonalitySchema = z.object({
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

export const patchBusinessSchema = z.object({
  step: z.literal("business"),
  business_name: z.string().trim().min(1),
  owner_name: z.string().trim().min(1),
  industry: z.string().trim().min(1),
  description: z.string().trim().min(1),
  agent_description: z.string().trim().min(1),
  target_audience: z.string().trim().min(1),
  escalation_rules: z.string().trim().min(1),
  country: z.string().trim().min(1),
  custom_industry: z.string().trim().optional(),
  business_timezone: z.string().trim().optional(),
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
  phone_number_id: z.string().trim().optional(),
  whatsapp_token: z.string().trim().optional(),
  brand_values: z.array(z.string().trim()).optional(),
  featured_products: z.array(z.string().trim()).optional(),
  policies: z.string().trim().optional(),
  faq: z.string().trim().optional(),
  operating_hours: z.string().trim().optional(),
  active_promotions: z.string().trim().optional(),
  ai_model: z.string().trim().optional(),
  ai_temperature: z.number().min(0).max(1).optional(),
  response_wait_time: z.number().int().min(0).optional(),
  is_memory_enable: z.boolean().optional(),
  is_multi_message_response_enable: z.boolean().optional(),
  is_validator_agent_enable: z.boolean().optional(),
  mcp_max_retries: z.number().int().min(0).optional(),
  answer_not_support: z.string().max(500).optional(),
});

export const patchToolsSchema = z.object({
  step: z.literal("tools"),
  selected_tools: z.array(z.string().trim().min(1)).min(1),
});

export const patchCompleteSchema = z.object({
  step: z.literal("complete"),
});

export const agentDraftPatchBodySchema = z.discriminatedUnion("step", [
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

export const patchDraftPropertyItemSchema = createDraftPropertyItemSchema.partial();

export type PostDraftBody = z.infer<typeof postDraftBodySchema>;
export type PatchPersonality = z.infer<typeof patchPersonalitySchema>;
export type PatchBusiness = z.infer<typeof patchBusinessSchema>;
export type PatchTools = z.infer<typeof patchToolsSchema>;
export type PatchComplete = z.infer<typeof patchCompleteSchema>;
export type AgentDraftPatchBody = z.infer<typeof agentDraftPatchBodySchema>;
export type CreateDraftPendingTask = z.infer<typeof createDraftPendingTaskSchema>;
export type PatchDraftPendingTask = z.infer<typeof patchDraftPendingTaskSchema>;
export type CreateDraftPropertyItem = z.infer<typeof createDraftPropertyItemSchema>;
export type PatchDraftPropertyItem = z.infer<typeof patchDraftPropertyItemSchema>;