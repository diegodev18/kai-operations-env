import { z } from "zod";

export const createToolBodySchema = z.object({
  name: z.string().trim().min(1, "name es obligatorio"),
  description: z.string().trim().min(1, "description es obligatoria"),
  type: z.enum(["custom", "default", "preset"]).optional(),
  enabled: z.boolean().optional(),
  path: z.string().trim().optional(),
  displayName: z.string().trim().optional(),
  parameters: z.record(z.string(), z.unknown()).optional(),
  properties: z.record(z.string(), z.unknown()).optional(),
  required_agent_properties: z.array(z.string()).optional(),
});

export const updateToolBodySchema = createToolBodySchema.partial();

export const patchAgentBodySchema = z.object({
  version: z.string().optional(),
});

export type CreateToolBody = z.infer<typeof createToolBodySchema>;
export type UpdateToolBody = z.infer<typeof updateToolBodySchema>;
export type PatchAgentBody = z.infer<typeof patchAgentBodySchema>;