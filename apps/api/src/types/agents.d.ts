import type { QueryDocumentSnapshot } from "firebase-admin/firestore";

import type { GrowerPayload } from "@/utils/agents";

export type AgentsInfoAuthContext = {
  userEmail?: string;
  userRole?: string;
  /** Better Auth user id (para ownership de borradores). */
  userId?: string;
  /** Nombre visible del usuario (growers / UI). */
  userName?: string;
};

export type AgentDocument = QueryDocumentSnapshot;

export interface LightAgent {
  enabled: boolean;
  growers: GrowerPayload[];
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
