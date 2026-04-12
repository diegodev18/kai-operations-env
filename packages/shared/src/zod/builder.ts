import { z } from "zod";

export const messageSchema = z.object({
  role: z.enum(["assistant", "user"]),
  text: z.string(),
});

export const draftStateSchema = z.record(z.string(), z.unknown());

export const builderChatBodySchema = z.object({
  messages: z.array(messageSchema).min(1, "Al menos un mensaje es requerido"),
  draftState: draftStateSchema.optional(),
  pendingTasksCount: z.number().optional(),
  draftId: z.string().optional(),
});

export const recommendToolsBodySchema = z.object({
  business_name: z.string().optional(),
  owner_name: z.string().optional(),
  industry: z.string().optional(),
  custom_industry: z.string().optional(),
  description: z.string().optional(),
  target_audience: z.string().optional(),
  agent_description: z.string().optional(),
  escalation_rules: z.string().optional(),
  country: z.string().optional(),
  business_timezone: z.string().optional(),
  agent_name: z.string().optional(),
  agent_personality: z.string().optional(),
  response_language: z.string().optional(),
  business_hours: z.string().optional(),
  require_auth: z.boolean().optional(),
  operational_context: z.string().optional(),
  tools_context_data_actions: z.string().optional(),
  tools_context_commerce_reservations: z.string().optional(),
  tools_context_integrations: z.string().optional(),
});

export const flowQuestionsBodySchema = recommendToolsBodySchema.omit({
  operational_context: true,
  tools_context_data_actions: true,
  tools_context_commerce_reservations: true,
  tools_context_integrations: true,
});

export type BuilderChatBody = z.infer<typeof builderChatBodySchema>;
export type RecommendToolsBody = z.infer<typeof recommendToolsBodySchema>;
export type FlowQuestionsBody = z.infer<typeof flowQuestionsBodySchema>;