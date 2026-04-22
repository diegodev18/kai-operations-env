/** Barrel público de `types/`. Preferir `import type { … } from "@/types"`. */

export * from "./agents/agents-api";
export * from "./agents/agent-tool";
export * from "./agents/agent-properties";
export * from "./form-builder";
export * from "./chat/prompt-chat";
export * from "./chat/prompt-diff";
export * from "./integration/integration-simulator";
export * from "./parameter-schema/editor";
export { EMPTY_SCHEMA, SCHEMA_TYPES } from "@/consts/parameter-schema";
export type { SchemaType } from "@/consts/parameter-schema";
