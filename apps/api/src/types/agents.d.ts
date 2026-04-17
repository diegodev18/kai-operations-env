import type { QueryDocumentSnapshot } from "firebase-admin/firestore";

import type { GrowerPayload, TechLeadPayload } from "@/utils/agents";

export type AgentsInfoAuthContext = {
  userEmail?: string;
  userRole?: string;
  /** Better Auth user id (para ownership de borradores). */
  userId?: string;
  /** Nombre visible del usuario (growers / UI). */
  userName?: string;
};

export type AgentDocument = QueryDocumentSnapshot;

export interface AgentBilling {
  domiciliated: boolean;
  defaultPaymentAmount?: number;
  lastPaymentDate: string | null;
  paymentDueDate: string | null;
  paymentAlert: boolean;
}

export interface LightAgent {
  enabled: boolean;
  growers: GrowerPayload[];
  techLeads?: TechLeadPayload[];
  id: string;
  injectCommandsInPrompt?: boolean;
  isMultiMessageResponseEnable?: boolean;
  isValidatorAgentEnable?: boolean;
  model?: string;
  name: string;
  /** Nombre público del agente (Firestore `agent_name`). */
  agentName: string;
  /** Nombre del negocio (Firestore `business_name`). */
  businessName: string;
  omitFirstEchoes?: boolean;
  owner: string;
  prompt: string;
  /** `mcp_configuration.system_prompt_generation_status` en Firestore. */
  systemPromptGenerationStatus?: string;
  systemPromptGenerationError?: string | null;
  temperature?: number;
  waitTime?: number;
  /** Versión del agente. */
  version?: string;
  /** Rutas MCP: `testing/data` vs producción (`firestore_data_mode` en raíz). */
  firestoreDataMode: "auto" | "testing" | "production";
  /** Datos de cobranza del agente. */
  billing?: AgentBilling;
  /** El agente es favorito del usuario actual. */
  isFavorite?: boolean;
  /** Estado de visibilidad en Operations. */
  status?: "active" | "archived";
}

export type ImplementationTaskStatus = "pending" | "completed";

export interface ImplementationTaskPayload {
  id: string;
  title: string;
  description?: string;
  status: ImplementationTaskStatus;
  dueDate?: string | null;
  assigneeEmails: string[];
  createdByEmail?: string;
  createdAt?: string | null;
  updatedAt?: string | null;
}
