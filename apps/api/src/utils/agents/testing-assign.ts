import { getFirestore } from "@/lib/firestore";

import { mapGrowerDocsToPayload } from "./growers";

/**
 * Emails de stakeholders del agente (misma unión que `userCanAccessAgent` / `userCanEditAgent`).
 */
export async function collectAgentStakeholderEmails(
  agentId: string,
): Promise<Set<string>> {
  const db = getFirestore();
  const agentRef = db.collection("agent_configurations").doc(agentId);
  const [prodGrowersSnap, testingGrowersSnap, techLeadsSnap] = await Promise.all([
    agentRef.collection("growers").get(),
    agentRef.collection("testing").doc("data").collection("collaborators").get(),
    agentRef.collection("techLeads").get(),
  ]);
  const prodGrowers = mapGrowerDocsToPayload(prodGrowersSnap.docs);
  const testingCollaborators = testingGrowersSnap.docs.map((d) => ({
    email: (d.data()?.email as string)?.toLowerCase().trim() ?? "",
  }));
  const techLeads = techLeadsSnap.docs.map((d) => ({
    email: (d.data()?.email as string)?.toLowerCase().trim() ?? "",
  }));
  const allEmails = [
    ...prodGrowers.map((g) => g.email),
    ...testingCollaborators.map((c) => c.email),
    ...techLeads.map((t) => t.email),
  ];
  const set = new Set<string>();
  for (const e of allEmails) {
    if (e.length > 0) set.add(e);
  }
  return set;
}

export type ApplyUsersBuildersTestingAssignmentParams = {
  agentId: string;
  phoneNumber: string;
  userId: string;
  userName: string;
  userEmail: string;
};

export async function applyUsersBuildersTestingAssignment(
  params: ApplyUsersBuildersTestingAssignmentParams,
): Promise<{ createdUserBuilder: boolean }> {
  const { agentId, phoneNumber, userId, userName, userEmail } = params;
  const firestore = getFirestore();
  const usersBuildersCollection = firestore.collection("usersBuilders");
  const usersBuildersQuery = await usersBuildersCollection
    .where("phoneNumber", "==", phoneNumber)
    .limit(1)
    .get();

  const now = new Date().toISOString();
  let createdUserBuilder = false;

  if (usersBuildersQuery.empty) {
    createdUserBuilder = true;
    await usersBuildersCollection.doc(phoneNumber).set({
      uid: userId,
      email: userEmail,
      name: userName,
      phoneNumber,
      customAgentConfigId: agentId,
      isTestingCustomAgent: true,
      testingStartedAt: now,
      lastAgentChange: now,
      createdAt: now,
      updatedAt: now,
    });
  } else {
    await usersBuildersQuery.docs[0]!.ref.update({
      customAgentConfigId: agentId,
      isTestingCustomAgent: true,
      testingStartedAt: now,
      lastAgentChange: now,
      updatedAt: now,
    });
  }

  return { createdUserBuilder };
}
