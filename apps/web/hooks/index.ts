export { useAuth } from "./auth/auth";
export { useUserRole } from "./auth/user-role";

export { useApiResource } from "./api/api-resource";

export { useAgentIdParam } from "./agents/agent-id-param";
export { useBuilderFormReadonlyData } from "./agents/builder-form-readonly";

export { useAgentTools } from "./agents/tools/agent-tools";
export {
  createAgentTool,
  updateAgentTool,
  deleteAgentTool,
} from "./agents/tools/agent-tools.actions";
export { useToolsCatalog } from "./agents/tools/tools-catalog";

export { useAgentProperties } from "./agents/properties/agent-properties";
export {
  useTestingProperties,
  type RefetchTestingPropertiesOptions,
} from "./agents/properties/testing-properties";
export {
  updateAgentPropertyDocument,
  updateTestingPropertyDocument,
} from "./agents/properties/agent-properties.actions";

export {
  useProductionPrompt,
  fetchProductionPromptSnapshot,
} from "./agents/prompt/production-prompt";
export {
  updateAgentPrompt,
  promotePromptToProduction,
} from "./agents/prompt/agent-prompt.actions";

export { useTestingData } from "./agents/testing-data";
export { useTestingDiff } from "./agents/testing/testing-diff";
export type { TestingDiffItem } from "./agents/testing/testing-diff";
export { useConfigurationEditorTeamManagement } from "./agents/configuration-editor/team-management";
export { useConfigurationEditorDynamicSchemas } from "./agents/configuration-editor/dynamic-schemas";
export { usePromptDesignerPreferences } from "./agents/prompt-designer/preferences";
export { usePromptDesignerDialogs } from "./agents/prompt-designer/dialogs";
export { usePromptDesignerChatAttachments } from "./agents/prompt-designer/chat-attachments";
export { usePromptDesignerEditorState } from "./agents/prompt-designer/editor-state";
export { usePromptDesignerSync } from "./agents/prompt-designer/sync";

export { useDynamicTableSchemasList } from "./dynamic-tables/dynamic-table-schemas-list";
export { useDynamicTableSchemaDetail } from "./dynamic-tables/dynamic-table-schema-detail";

export {
  useCrmCompanies,
  useCrmCompanyDetail,
} from "./crm/companies";
export {
  useCrmOpportunities,
  useCrmOpportunityDetail,
} from "./crm/opportunities";

export { useAdminWallet } from "./bonuses/wallet";
export { useTips, useTeamMembers } from "./bonuses/tips";
export { useMyBalance, useAdminBalances } from "./bonuses/balances";

export { usePromptChat, isChatStatusMessage } from "./chat/prompt-chat";
export { usePromptModels } from "./chat/prompt-models";
export type {
  ChatMessage,
  ChatMessageImage,
  ChatMessagePdf,
  PromptModelId,
  PromptModelInfo,
  PromptMode,
  PromptTarget,
  SuggestedPrompts,
} from "./chat/prompt-chat";
