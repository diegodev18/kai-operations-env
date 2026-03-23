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
  path?: string;
  type: AgentToolType;
  required_agent_properties?: string[];
}

export interface CreateAgentToolBody {
  name: string;
  description: string;
  type?: AgentToolType;
  enabled?: boolean;
  parameters?: Record<string, unknown>;
  displayName?: string;
  path?: string;
  required_agent_properties?: string[];
}

export interface UpdateAgentToolBody {
  name?: string;
  description?: string;
  type?: AgentToolType;
  parameters?: Record<string, unknown> | null;
  displayName?: string | null;
  path?: string | null;
  required_agent_properties?: string[] | null;
  enabled?: boolean;
}
