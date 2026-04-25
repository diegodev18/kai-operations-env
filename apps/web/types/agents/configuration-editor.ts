import type { AgentPropertiesResponse } from "@/types/agents/agent-properties";
import type { DynamicTableSchemaDocument } from "@/types/dynamic-table-schema";

export type ConfigurationEditorUpdateFn = <K extends keyof AgentPropertiesResponse>(
  docId: K,
  updater: (prev: AgentPropertiesResponse[K]) => AgentPropertiesResponse[K],
) => void;

export type ConversationSectionProps = {
  formState: AgentPropertiesResponse;
  showAllSections: boolean;
  showGrowerSections: boolean;
  isAdmin: boolean;
  agentVersion: string;
  savingVersion: boolean;
  firestoreDataMode: "auto" | "testing" | "production";
  savingFirestoreDataMode: boolean;
  onVersionChange: (newVersion: string) => void;
  onFirestoreDataModeChange: (value: "auto" | "testing" | "production") => void;
  update: ConfigurationEditorUpdateFn;
};

export type AccessSectionProps = {
  formState: AgentPropertiesResponse;
  update: ConfigurationEditorUpdateFn;
};

export type AiSectionProps = {
  formState: AgentPropertiesResponse;
  update: ConfigurationEditorUpdateFn;
};

export type MemorySectionProps = {
  formState: AgentPropertiesResponse;
  update: ConfigurationEditorUpdateFn;
};

export type ValidationSectionProps = {
  formState: AgentPropertiesResponse;
  showAllSections: boolean;
  update: ConfigurationEditorUpdateFn;
};

export type DynamicTableSchemasSectionProps = {
  schemaSearch: string;
  onSchemaSearchChange: (value: string) => void;
  showOnlySelectedSchemas: boolean;
  onToggleShowOnlySelectedSchemas: () => void;
  schemasListError: string | null;
  schemasLoading: boolean;
  availableSchemas: DynamicTableSchemaDocument[];
  filteredSchemas: DynamicTableSchemaDocument[];
  schemasToRender: DynamicTableSchemaDocument[];
  hiddenSchemasCount: number;
  showAllSchemas: boolean;
  selectedAllowedSchemaIds: string[];
  onToggleSchemaSelection: (schemaId: string, checked: boolean) => void;
  onToggleShowAllSchemas: () => void;
  onSave: () => void;
  savingAllowedSchemas: boolean;
};
