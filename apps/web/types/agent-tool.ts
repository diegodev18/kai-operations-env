export type AgentToolType = "custom" | "default" | "preset";

export interface AgentTool {
  id: string;
  name: string;
  displayName?: string;
  description: string;
  enabled?: boolean;
  parameters?: {
    type?: string;
    properties?: Record<string, unknown>;
    required?: string[];
  };
  properties?: Record<string, unknown>;
  crmConfig?: unknown;
  path?: string;
  type: AgentToolType;
  createdAt?: string;
  updatedAt?: string;
}

export interface CreateAgentToolBody {
  name: string;
  description: string;
  type?: AgentToolType;
  enabled?: boolean;
  parameters?: Record<string, unknown>;
  properties?: Record<string, unknown>;
  crmConfig?: unknown;
  displayName?: string;
  path?: string;
}

export interface UpdateAgentToolBody {
  name?: string;
  description?: string;
  type?: AgentToolType;
  parameters?: Record<string, unknown> | null;
  properties?: Record<string, unknown> | null;
  crmConfig?: unknown | null;
  displayName?: string | null;
  path?: string | null;
  enabled?: boolean;
}
