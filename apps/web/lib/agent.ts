/** Estado operativo del agente para el dashboard de operaciones. */
export type AgentOperationalStatus =
  | "active"
  | "off"
  | "testing"
  | "suspended";

export type AgentBilling = {
  domiciliated: boolean;
  lastPaymentDate?: string | null;
  paymentAlert: boolean;
};

export type GrowerRef = {
  name: string;
  email: string;
};

export interface Agent {
  id: string;
  name: string;
  owner: string;
  prompt?: string;
  enabled?: boolean;
  model?: string;
  temperature?: number;
  growers?: GrowerRef[];
}

export interface AgentWithOperations extends Agent {
  operationalStatus: AgentOperationalStatus;
  billing: AgentBilling;
  industry?: string | null;
}

export const DEFAULT_AGENT_BILLING: AgentBilling = {
  domiciliated: false,
  lastPaymentDate: null,
  paymentAlert: false,
};

export function toAgentWithOperations(
  raw: Agent & Partial<AgentWithOperations>,
): AgentWithOperations {
  const enabled = raw.enabled !== false;
  const operationalStatus: AgentOperationalStatus =
    raw.operationalStatus ?? (enabled ? "active" : "off");
  const billing = raw.billing ?? DEFAULT_AGENT_BILLING;
  return {
    ...raw,
    operationalStatus,
    billing,
    growers: Array.isArray(raw.growers) ? raw.growers : [],
    industry: raw.industry ?? null,
  };
}
