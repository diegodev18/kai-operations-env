import type { AgentToolType } from "@/types";

export type JsonRecord = Record<string, unknown>;

export type ToolTypeFilter = "all" | AgentToolType;
export type ToolEnabledFilter = "all" | "enabled" | "disabled";

export const TOOL_TYPE_OPTIONS: { value: AgentToolType; label: string }[] = [
  { value: "custom", label: "Custom" },
  { value: "default", label: "Default" },
  { value: "preset", label: "Preset" },
];

export const TOOL_TYPE_FILTERS: { value: ToolTypeFilter; label: string }[] = [
  { value: "all", label: "Todas" },
  { value: "default", label: "Default" },
  { value: "custom", label: "Custom" },
  { value: "preset", label: "Preset" },
];
