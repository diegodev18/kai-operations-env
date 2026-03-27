/** Estado persistido en `mcp_configuration.system_prompt_generation_status`. */
export type SystemPromptGenerationStatus =
  | "idle"
  | "pending"
  | "generating"
  | "ready"
  | "failed";

export const DEFAULT_SYSTEM_PROMPT_GENERATION_STATUS: SystemPromptGenerationStatus =
  "idle";
