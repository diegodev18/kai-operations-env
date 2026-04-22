/** Estado operativo del agente para el dashboard de operaciones. */
export type AgentOperationalStatus =
  | "active"
  | "off"
  | "testing"
  | "suspended";

export type AgentBilling = {
  /** `true` / `false` explícitos; `null` = sin información en Firestore. */
  domiciliated: boolean | null;
  defaultPaymentAmount?: number;
  lastPaymentDate?: string | null;
  paymentDueDate?: string | null;
  paymentAlert: boolean;
};

export type PaymentRecord = {
  id: string;
  amount: number;
  period: string;
  paymentMethod: string;
  reference?: string;
  notes?: string;
  receiptUrl?: string;
  paidAt: string;
  markedBy: string;
  createdAt: string;
};

export type GrowerRef = {
  name: string;
  email: string;
};

export interface Agent {
  id: string;
  name: string;
  /** Nombre público del agente (API: `agent_name` en Firestore). */
  agentName?: string;
  /** Nombre del negocio (API: `business_name` en Firestore). Equivale a `name` cuando solo hay uno. */
  businessName?: string;
  owner: string;
  prompt?: string;
  /** Estado de generación async del system prompt (MCP). */
  systemPromptGenerationStatus?: string;
  systemPromptGenerationError?: string | null;
  enabled?: boolean;
  model?: string;
  temperature?: number;
  growers?: GrowerRef[];
  /** Existe en asistente comercial (testing). */
  inCommercial?: boolean;
  /** Existe en proyecto kai (producción). */
  inProduction?: boolean;
  /** Origen de lectura preferido en detalle (`GET /agents/:id`). */
  primarySource?: "commercial" | "production";
  /** Versión del agente. */
  version?: string;
  /** Rutas de datos MCP: automático, siempre testing/data o siempre producción. */
  firestoreDataMode?: "auto" | "testing" | "production";
  /** El agente es favorito del usuario actual (desde el backend). */
  isFavorite?: boolean;
  /** Estado del agente en Operations. */
  status?: "active" | "archived";
}

export interface AgentWithOperations extends Agent {
  operationalStatus: AgentOperationalStatus;
  billing: AgentBilling;
}

export const DEFAULT_AGENT_BILLING: AgentBilling = {
  domiciliated: null,
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
  };
}
