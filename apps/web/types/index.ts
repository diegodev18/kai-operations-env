/** Barrel público de `types/`. Preferir `import type { … } from "@/types"`. */

export * from "./agents/agents-api";
export * from "./agents/agent-tool";
export * from "./agents/agent-properties";
export * from "./agents/configuration-editor";
export * from "./agents/prompt-designer";
export * from "./form-builder";
export * from "./chat/prompt-chat";
export * from "./chat/prompt-diff";
export * from "./integration/integration-simulator";
export type {
  DynamicTableEnumOption,
  DynamicTableField,
  DynamicTableFieldType,
  DynamicTableReferenceConfig,
  DynamicTableSchemaDocument,
} from "./dynamic-table-schema";
export { DYNAMIC_TABLE_FIELD_TYPES } from "./dynamic-table-schema";
export * from "./crm";
export * from "./parameter-schema/editor";
export { EMPTY_SCHEMA, SCHEMA_TYPES } from "@/consts/parameter-schema";
export type { SchemaType } from "@/consts/parameter-schema";
