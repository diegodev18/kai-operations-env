import type { AgentsInfoAuthContext } from "@/types/agents";

import { userCanAccessAgent } from "./agentAccess";

/**
 * Admin puede agregar growers a cualquier agente.
 * Miembro solo si ya figura como grower de ese agente (comercial o producción).
 */
export async function userCanAddGrowerToAgent(
  authCtx: AgentsInfoAuthContext,
  agentId: string,
): Promise<boolean> {
  return userCanAccessAgent(authCtx, agentId);
}
