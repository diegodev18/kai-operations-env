import type { Firestore } from "firebase-admin/firestore";

import type { AgentsInfoAuthContext } from "@/types/agents";
import { isOperationsAdmin } from "@/utils/operations-access";

import { mapGrowerDocsToPayload } from "./growers";

/**
 * Admin puede agregar growers a cualquier agente.
 * Miembro solo si ya figura como grower de ese agente (misma lógica que el listado).
 */
export async function userCanAddGrowerToAgent(
  database: Firestore,
  authCtx: AgentsInfoAuthContext,
  agentId: string,
): Promise<boolean> {
  if (isOperationsAdmin(authCtx.userRole)) return true;
  const emailNorm = authCtx.userEmail?.toLowerCase().trim() ?? "";
  if (!emailNorm) return false;
  const snap = await database
    .collection("agent_configurations")
    .doc(agentId)
    .collection("growers")
    .get();
  const growers = mapGrowerDocsToPayload(snap.docs);
  return growers.some((g) => g.email === emailNorm);
}
