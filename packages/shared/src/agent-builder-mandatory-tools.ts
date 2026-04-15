/**
 * Tools that every agent created in the operations builder always includes
 * (catalog `name` field). Used for UI (non-removable) and LLM prompts.
 */
export const AGENT_BUILDER_MANDATORY_TOOL_NAMES = [
  "kai_knowledge_base_ask_for_knowledge_base",
  "kai_help_escalate_to_support",
] as const;

export type AgentBuilderMandatoryToolName =
  (typeof AGENT_BUILDER_MANDATORY_TOOL_NAMES)[number];

/**
 * English prompt copy (e.g. flow-questions) so the model knows these capabilities
 * are always on and must not be re-asked. User-facing strings in the JSON output
 * remain Spanish per the caller's instructions.
 */
export const AGENT_BUILDER_MANDATORY_TOOLS_LLM_CONTEXT = `
The assistant will always have these capabilities (do not ask whether the business wants them):
- Answer using knowledge the business uploads (FAQs, policies, menu, prices, etc.).
- Hand off or escalate the conversation to a person or human support when needed.

Do not generate questions whose only purpose is whether the assistant "can" do those two things—they are always enabled.
`.trim();
