import { FieldValue, type QueryDocumentSnapshot } from "firebase-admin/firestore";

import { getFirestore } from "@/lib/firestore";

import { mapGrowerDocsToPayload } from "./growers";

/** Solo dígitos para comparar phoneNumber en Firestore / Postgres. */
export function normalizePhoneDigits(input: string): string {
  return input.replace(/\D/g, "");
}

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

export type UsersBuilderSearchHit = {
  /** ID del documento en Firestore (puede repetirse `phoneNumber` en varios docs). */
  docId: string;
  phoneNumber: string;
  name: string;
  email: string;
  uid: string;
};

function hitFromDoc(doc: QueryDocumentSnapshot): UsersBuilderSearchHit | null {
  const d = doc.data() as Record<string, unknown>;
  const pn = String(d.phoneNumber ?? "").trim();
  if (!pn) return null;
  return {
    docId: doc.id,
    phoneNumber: pn,
    name: typeof d.name === "string" ? d.name : "",
    email: typeof d.email === "string" ? d.email : "",
    uid: typeof d.uid === "string" ? d.uid : "",
  };
}

/**
 * Busca en `usersBuilders` por `phoneNumber`: igualdad (todos los docs) y prefijo (range).
 * Deduplica por **doc id**, no por teléfono, para listar varios perfiles con el mismo número.
 */
export async function searchUsersBuildersByPhoneDigits(
  phoneDigits: string,
): Promise<{ hits: UsersBuilderSearchHit[]; exactMatchFound: boolean }> {
  if (phoneDigits.length < 3) {
    return { hits: [], exactMatchFound: false };
  }
  const firestore = getFirestore();
  const col = firestore.collection("usersBuilders");
  const dedupe = new Map<string, UsersBuilderSearchHit>();

  const snapEq = await col.where("phoneNumber", "==", phoneDigits).limit(60).get();
  let exactMatchFound = !snapEq.empty;
  for (const doc of snapEq.docs) {
    const hit = hitFromDoc(doc);
    if (hit) dedupe.set(doc.id, hit);
  }

  const end = `${phoneDigits}\uf8ff`;
  const snapPref = await col
    .where("phoneNumber", ">=", phoneDigits)
    .where("phoneNumber", "<=", end)
    .limit(40)
    .get();
  for (const doc of snapPref.docs) {
    if (dedupe.has(doc.id)) continue;
    const hit = hitFromDoc(doc);
    if (hit) dedupe.set(doc.id, hit);
  }

  return {
    hits: [...dedupe.values()],
    exactMatchFound,
  };
}

function formatUpdateDateString(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export type RichUsersBuilderCreateInput = {
  phoneNumber: string;
  name: string;
  email: string;
  /** Identificador de cuenta; el servidor lo resuelve por teléfono en Postgres o UUID. */
  uid: string;
  actorUserId: string;
  agentId: string;
};

/**
 * Documento inicial al crear `usersBuilders` por asignación de testing (alineado al ejemplo de producción).
 */
export function buildRichUsersBuilderCreatePayload(
  input: RichUsersBuilderCreateInput,
): Record<string, unknown> {
  const nowIso = new Date().toISOString();
  const ts = FieldValue.serverTimestamp();
  return {
    accessRole: "regular",
    companyID: "",
    companyRole: "Miembro",
    createdBy: input.actorUserId,
    folio: "1",
    name: input.name,
    organizationId: input.actorUserId,
    password: input.phoneNumber,
    permit: 1,
    phoneNumber: input.phoneNumber,
    photoURL: "",
    receivedNotifications: true,
    role: "regular",
    status: "Aprobado",
    status_lead: "prospect",
    uid: input.uid,
    email: input.email,
    updateDateString: formatUpdateDateString(new Date()),
    createdAt: ts,
    isTestingCustomAgent: true,
    tokenVersion: 1,
    customAgentConfigId: input.agentId,
    testingStartedAt: nowIso,
    lastAgentChange: nowIso,
    updatedAt: nowIso,
    assignedModules: ["base"],
    activeModule: "base",
    userUpdatedAt: ts,
    modelUpdatedAt: ts,
  };
}

const testingAssignmentPatch = (agentId: string, nowIso: string) => ({
  customAgentConfigId: agentId,
  isTestingCustomAgent: true,
  testingStartedAt: nowIso,
  lastAgentChange: nowIso,
  updatedAt: nowIso,
});

/**
 * Actualiza un `usersBuilders` concreto por id de documento (varios docs pueden compartir `phoneNumber`).
 */
export async function assignTestingToUsersBuilderDocId(
  docId: string,
  agentId: string,
): Promise<void> {
  const firestore = getFirestore();
  const ref = firestore.collection("usersBuilders").doc(docId);
  const snap = await ref.get();
  if (!snap.exists) {
    throw new Error("USERS_BUILDERS_DOC_NOT_FOUND");
  }
  const nowIso = new Date().toISOString();
  await ref.update(testingAssignmentPatch(agentId, nowIso));
}

/**
 * Crea `usersBuilders` con `identity` cuando no existe ningún doc con ese `phoneNumber`.
 */
export async function assignTestingByPhoneNumber(params: {
  agentId: string;
  phoneNumber: string;
  actorUserId: string;
  identity: { name: string; email: string; uid: string };
}): Promise<{ createdUserBuilder: boolean }> {
  const { agentId, phoneNumber, actorUserId, identity } = params;
  const firestore = getFirestore();
  const col = firestore.collection("usersBuilders");
  const snap = await col.where("phoneNumber", "==", phoneNumber).limit(1).get();

  if (!snap.empty) {
    throw new Error("USERS_BUILDERS_ALREADY_EXISTS");
  }

  if (!identity.name?.trim() || !identity.email?.trim()) {
    throw new Error("USERS_BUILDERS_CREATE_REQUIRES_IDENTITY");
  }

  const payload = buildRichUsersBuilderCreatePayload({
    phoneNumber,
    name: identity.name.trim(),
    email: identity.email.trim().toLowerCase(),
    uid: identity.uid.trim(),
    actorUserId,
    agentId,
  });

  await col.doc(phoneNumber).set(payload);
  return { createdUserBuilder: true };
}
