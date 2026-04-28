import type { DocumentReference } from "firebase-admin/firestore";

import { FieldValue } from "@/lib/firestore";

/**
 * Defaults aligned with KAI-DEV-ENV agents.controller and MCP AGENT_PROPERTIES.md.
 * Written once under agent_drafts/{id}/properties/*.
 */
export const PROPERTY_DEFAULTS = {
  agent: {
    enabled: true,
    excludedNumbers: [] as string[],
    injectCommandsInPrompt: false,
    isAuthEnable: false,
    isMemoryEnable: false,
    isMultiMessageEnable: false,
    isMultiMessageResponseEnable: true,
    isValidatorAgentEnable: false,
    maxFunctionCalls: 4,
    omitFirstEchoes: false,
  },
  ai: {
    model: "gemini-2.5-flash",
    temperature: 0.05,
    thinking: {
      includeThoughts: false,
      level: "",
    },
  },
  answer: {
    notSupport: "Hola súper! Cómo te llamas?",
  },
  mcp: {
    maxRetries: 1,
  },
  memory: {
    limit: 15,
  },
  prompt: {
    base: "",
    auth: { auth: "", unauth: "" },
    isMultiFunctionCallingEnable: true,
    model: "gemini-2.5-flash",
    temperature: 0.05,
  },
  response: {
    waitTime: 3,
  },
  time: {
    zone: "America/Mexico_City",
  },
  limitation: {
    allowedUsers: [] as string[],
    userLimitation: false,
  },
} as const;

export const PROPERTY_DOC_IDS = [
  "agent",
  "ai",
  "answer",
  "response",
  "time",
  "prompt",
  "memory",
  "mcp",
  "limitation",
] as const;

export type PropertyDocId = (typeof PROPERTY_DOC_IDS)[number];

/** Batch-set default property documents under draftRef/properties. */
export async function writeDefaultAgentProperties(
  draftRef: DocumentReference,
): Promise<void> {
  const batch = draftRef.firestore.batch();
  const props = draftRef.collection("properties");
  for (const docId of PROPERTY_DOC_IDS) {
    const data = PROPERTY_DEFAULTS[docId];
    batch.set(props.doc(docId), deepClonePlain(data) as Record<string, unknown>);
  }
  await batch.commit();
}

/** Batch-set default property documents under testing/data/properties. */
export async function writeDefaultTestingProperties(
  draftRef: DocumentReference,
): Promise<void> {
  const batch = draftRef.firestore.batch();
  const testingProps = draftRef.collection("testing").doc("data").collection("properties");
  for (const docId of PROPERTY_DOC_IDS) {
    const data = PROPERTY_DEFAULTS[docId];
    batch.set(testingProps.doc(docId), deepClonePlain(data) as Record<string, unknown>);
  }
  await batch.commit();
}

function deepClonePlain<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export function serverTimestampField() {
  return FieldValue.serverTimestamp();
}
