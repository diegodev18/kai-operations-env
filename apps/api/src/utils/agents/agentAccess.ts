import type { Firestore } from "firebase-admin/firestore";

import { getFirestore } from "@/lib/firestore";
import type { AgentsInfoAuthContext } from "@/types/agents";
import { isOperationsAdmin } from "@/utils/operations-access";

import { mapGrowerDocsToPayload } from "./growers";

export async function userCanAccessAgent(
  authCtx: AgentsInfoAuthContext,
  agentId: string,
): Promise<boolean> {
  if (isOperationsAdmin(authCtx.userRole)) return true;
  const emailNorm = authCtx.userEmail?.toLowerCase().trim() ?? "";
  if (!emailNorm) return false;

  const db = getFirestore();
  const [prodGrowersSnap, testingGrowersSnap] = await Promise.all([
    db.collection("agent_configurations").doc(agentId).collection("growers").get(),
    db.collection("agent_configurations").doc(agentId).collection("testing").doc("data").collection("collaborators").get(),
  ]);
  const prodGrowers = mapGrowerDocsToPayload(prodGrowersSnap.docs);
  const testingCollaborators = testingGrowersSnap.docs.map(d => ({
    email: (d.data()?.email as string)?.toLowerCase().trim() ?? "",
  }));
  const allEmails = [
    ...prodGrowers.map(g => g.email),
    ...testingCollaborators.map(c => c.email),
  ];
  return allEmails.some(email => email === emailNorm);
}

export async function resolveAgentWriteDatabase(
  agentId: string,
): Promise<{ db: Firestore; hasTestingData: boolean; inProduction: boolean }> {
  const db = getFirestore();
  const [prodSnap, testingDataSnap] = await Promise.all([
    db.collection("agent_configurations").doc(agentId).get(),
    db.collection("agent_configurations").doc(agentId).collection("testing").doc("data").get(),
  ]);
  const inProduction = prodSnap.exists;
  const hasTestingData = testingDataSnap.exists;
  return { db, hasTestingData, inProduction };
}

export async function getAgentDeploymentFlags(
  agentId: string,
): Promise<{ hasTestingData: boolean; inProduction: boolean }> {
  const db = getFirestore();
  const [prodSnap, testingDataSnap] = await Promise.all([
    db.collection("agent_configurations").doc(agentId).get(),
    db.collection("agent_configurations").doc(agentId).collection("testing").doc("data").get(),
  ]);
  return {
    hasTestingData: testingDataSnap.exists,
    inProduction: prodSnap.exists,
  };
}
