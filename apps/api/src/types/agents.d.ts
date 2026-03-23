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
  omitFirstEchoes?: boolean;
  owner: string;
  prompt: string;
  temperature?: number;
  waitTime?: number;
}
