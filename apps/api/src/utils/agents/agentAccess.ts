import type { Firestore } from "firebase-admin/firestore";

import { getFirestore, getFirestoreCommercial } from "@/lib/firestore";
import type { AgentsInfoAuthContext } from "@/types/agents";
import { isOperationsAdmin } from "@/utils/operations-access";

import { mapGrowerDocsToPayload } from "./growers";

/**
 * Admin de operaciones o grower del agente (email en subcolección growers en comercial o producción).
 */
export async function userCanAccessAgent(
  authCtx: AgentsInfoAuthContext,
  agentId: string,
): Promise<boolean> {
  if (isOperationsAdmin(authCtx.userRole)) return true;
  const emailNorm = authCtx.userEmail?.toLowerCase().trim() ?? "";
  if (!emailNorm) return false;

  const prod = getFirestore();
  const com = getFirestoreCommercial();
  const [snapProd, snapCom] = await Promise.all([
    prod.collection("agent_configurations").doc(agentId).collection("growers").get(),
    com.collection("agent_configurations").doc(agentId).collection("growers").get(),
  ]);
  const growers = [
    ...mapGrowerDocsToPayload(snapProd.docs),
    ...mapGrowerDocsToPayload(snapCom.docs),
  ];
  return growers.some((g) => g.email === emailNorm);
}

/** Base de datos donde editar el agente: comercial si existe, si no producción. */
export async function resolveAgentWriteDatabase(
  agentId: string,
): Promise<{ db: Firestore; inCommercial: boolean; inProduction: boolean }> {
  const prod = getFirestore();
  const com = getFirestoreCommercial();
  const [comSnap, prodSnap] = await Promise.all([
    com.collection("agent_configurations").doc(agentId).get(),
    prod.collection("agent_configurations").doc(agentId).get(),
  ]);
  const inCommercial = comSnap.exists;
  const inProduction = prodSnap.exists;
  if (inCommercial) {
    return { db: com, inCommercial, inProduction };
  }
  if (inProduction) {
    return { db: prod, inCommercial, inProduction };
  }
  return { db: prod, inCommercial: false, inProduction: false };
}

export async function getAgentDeploymentFlags(
  agentId: string,
): Promise<{ inCommercial: boolean; inProduction: boolean }> {
  const prod = getFirestore();
  const com = getFirestoreCommercial();
  const [comSnap, prodSnap] = await Promise.all([
    com.collection("agent_configurations").doc(agentId).get(),
    prod.collection("agent_configurations").doc(agentId).get(),
  ]);
  return {
    inCommercial: comSnap.exists,
    inProduction: prodSnap.exists,
  };
}
