import type { AgentsInfoAuthContext } from "@/types/agents-types";

import { userCanEditAgent } from "./agentAccess";

/**
 * Admin y commercial pueden agregar growers a cualquier agente.
 * Miembro solo si ya figura como grower de ese agente (comercial o producción).
 */
export async function userCanAddGrowerToAgent(
  authCtx: AgentsInfoAuthContext,
  agentId: string,
): Promise<boolean> {
  return userCanEditAgent(authCtx, agentId);
}
