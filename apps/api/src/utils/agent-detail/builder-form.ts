import type { DocumentReference } from "firebase-admin/firestore";

import {
  type PropertyDocId,
} from "@/constants/agentPropertyDefaults";
import { FieldValue } from "@/lib/firestore";
import {
  serializeAgentConfigurationRootForClient,
  serializeValue,
} from "@/utils/agents/serializeAgentRootForClient";
import { resolveAgentWriteDatabase } from "@/utils/agents";

import { mergeWithDefaults } from "./property-defaults-merge";

const BUILDER_FORM_ADVANCED_DOC_IDS = [
  "agent",
  "ai",
  "answer",
  "response",
  "time",
  "mcp",
] as const satisfies readonly PropertyDocId[];

export const BUILDER_SNAPSHOTS_COLLECTION = "builderSnapshots";
export const BUILDER_SNAPSHOT_INITIAL_DOC = "initial";

export type BuilderFormPayloadSnapshot = {
  root: Record<string, unknown>;
  personality: Record<string, unknown> | null;
  business: Record<string, unknown> | null;
  advanced: Record<string, unknown>;
};

export type BuilderFormInitialPayload = BuilderFormPayloadSnapshot & {
  saved_at?: string | null;
};

/**
 * Arma el mismo payload que expone GET /agents/:id/builder-form (estado "live").
 */
export async function assembleBuilderFormPayload(
  agentRef: DocumentReference,
  hasTestingData: boolean,
): Promise<BuilderFormPayloadSnapshot | null> {
  const rootSnap = await agentRef.get();
  if (!rootSnap.exists) return null;

  const propertiesRef = hasTestingData
    ? agentRef.collection("testing").doc("data").collection("properties")
    : agentRef.collection("properties");

  const advancedSnaps = await Promise.all(
    BUILDER_FORM_ADVANCED_DOC_IDS.map((id) => propertiesRef.doc(id).get()),
  );
  const [personalitySnap, businessSnap] = await Promise.all([
    propertiesRef.doc("personality").get(),
    propertiesRef.doc("business").get(),
  ]);

  const advanced: Record<string, unknown> = {};
  for (let i = 0; i < BUILDER_FORM_ADVANCED_DOC_IDS.length; i++) {
    const docId = BUILDER_FORM_ADVANCED_DOC_IDS[i];
    const snap = advancedSnaps[i];
    const data = snap.exists
      ? (snap.data() as Record<string, unknown> | undefined)
      : undefined;
    const merged = mergeWithDefaults(docId, data);
    let serialized = serializeValue(merged) as Record<string, unknown>;
    if (docId === "agent" && serialized && typeof serialized === "object") {
      const inject =
        serialized.injectCommandsInPrompt === true ||
        serialized.isCommandsEnable === true;
      serialized = { ...serialized, injectCommandsInPrompt: inject };
      delete serialized.isCommandsEnable;
    }
    advanced[docId] = serialized;
  }

  const rootRaw = rootSnap.data() as Record<string, unknown>;

  return {
    root: serializeAgentConfigurationRootForClient(rootRaw),
    personality: personalitySnap.exists
      ? (serializeValue(
          personalitySnap.data() as Record<string, unknown>,
        ) as Record<string, unknown>)
      : null,
    business: businessSnap.exists
      ? (serializeValue(
          businessSnap.data() as Record<string, unknown>,
        ) as Record<string, unknown>)
      : null,
    advanced,
  };
}

/**
 * Guarda una sola vez el formulario tal como quedó al completar la creación (primer envío).
 */
export async function persistInitialBuilderSnapshotIfMissing(
  agentRef: DocumentReference,
): Promise<void> {
  const { hasTestingData } = await resolveAgentWriteDatabase(agentRef.id);
  const snapRef = agentRef
    .collection(BUILDER_SNAPSHOTS_COLLECTION)
    .doc(BUILDER_SNAPSHOT_INITIAL_DOC);
  const existing = await snapRef.get();
  if (existing.exists) return;

  const payload = await assembleBuilderFormPayload(agentRef, hasTestingData);
  if (!payload) return;

  await snapRef.set({
    root: payload.root,
    personality: payload.personality,
    business: payload.business,
    advanced: payload.advanced,
    saved_at: FieldValue.serverTimestamp(),
  });
}
