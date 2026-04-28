import type { Firestore } from "firebase-admin/firestore";

export type TestingDiffEntry = {
  collection: string;
  documentId: string;
  fieldKey: string;
  testingValue: unknown;
  productionValue: unknown;
};

/** Same normalization as diff listing — stable JSON for equality checks. */
export function normalizeForDiff(v: unknown): unknown {
  if (v === undefined) return null;
  try {
    const normalized = JSON.parse(JSON.stringify(v));
    return sortKeysRecursively(normalized);
  } catch {
    return v;
  }
}

function sortKeysRecursively(obj: unknown): unknown {
  if (obj === null || typeof obj !== "object") return obj;
  if (Array.isArray(obj)) return obj.map(sortKeysRecursively);
  const sorted: Record<string, unknown> = {};
  Object.keys(obj as Record<string, unknown>)
    .sort()
    .forEach((key) => {
      sorted[key] = sortKeysRecursively((obj as Record<string, unknown>)[key]);
    });
  return sorted;
}

export function testingDiffEntryKey(entry: {
  collection: string;
  documentId: string;
  fieldKey: string;
}): string {
  return `${entry.collection}\x1e${entry.documentId}\x1e${entry.fieldKey}`;
}

/**
 * Granular diff: testing/data vs production root (properties + tools).
 * Used by GET testing/diff and promote validation.
 */
export async function computeAgentTestingDiff(
  db: Firestore,
  agentId: string,
): Promise<TestingDiffEntry[]> {
  const agentRef = db.collection("agent_configurations").doc(agentId);
  const testingDataRef = agentRef.collection("testing").doc("data");
  const testingDataSnap = await testingDataRef.get();
  if (!testingDataSnap.exists) {
    throw new Error("NO_TESTING_DATA");
  }

  const [prodPropsSnap, testingPropsSnap, prodToolsSnap, testingToolsSnap] =
    await Promise.all([
      agentRef.collection("properties").get(),
      testingDataRef.collection("properties").get(),
      agentRef.collection("tools").get(),
      testingDataRef.collection("tools").get(),
    ]);

  const diff: TestingDiffEntry[] = [];

  // Properties Diff
  const allPropDocIds = new Set([
    ...prodPropsSnap.docs.map((d) => d.id),
    ...testingPropsSnap.docs.map((d) => d.id),
  ]);

  for (const docId of allPropDocIds) {
    const testingDoc = testingPropsSnap.docs.find((d) => d.id === docId);
    const prodDoc = prodPropsSnap.docs.find((d) => d.id === docId);

    const testingData = (testingDoc?.data() as Record<string, unknown>) || {};
    const prodData = (prodDoc?.data() as Record<string, unknown>) || {};

    const allKeys = new Set([
      ...Object.keys(testingData),
      ...Object.keys(prodData),
    ]);

    for (const key of allKeys) {
      if (key.startsWith("_")) continue;

      const tVal = testingData[key];
      const pVal = prodData[key];

      const tNorm = normalizeForDiff(tVal);
      const pNorm = normalizeForDiff(pVal);

      if (JSON.stringify(tNorm) !== JSON.stringify(pNorm)) {
        diff.push({
          collection: "properties",
          documentId: docId,
          fieldKey: key,
          testingValue: tNorm,
          productionValue: pNorm,
        });
      }
    }
  }

  // Tools Diff
  const allToolIds = new Set([
    ...prodToolsSnap.docs.map((d) => d.id),
    ...testingToolsSnap.docs.map((d) => d.id),
  ]);

  for (const toolId of allToolIds) {
    const testingTool = testingToolsSnap.docs.find((d) => d.id === toolId);
    const prodTool = prodToolsSnap.docs.find((d) => d.id === toolId);

    const testingData = (testingTool?.data() as Record<string, unknown>) || {};
    const prodData = (prodTool?.data() as Record<string, unknown>) || {};

    const toolExistsInTesting = testingTool?.exists;
    const toolExistsInProd = prodTool?.exists;

    if (toolExistsInTesting && !toolExistsInProd) {
      diff.push({
        collection: "tools",
        documentId: toolId,
        fieldKey: "__exists",
        testingValue: true,
        productionValue: false,
      });
      for (const key of Object.keys(testingData)) {
        if (key.startsWith("_")) continue;
        const tVal = testingData[key];
        const tNorm = normalizeForDiff(tVal);
        diff.push({
          collection: "tools",
          documentId: toolId,
          fieldKey: key,
          testingValue: tNorm,
          productionValue: null,
        });
      }
    } else if (!toolExistsInTesting && toolExistsInProd) {
      diff.push({
        collection: "tools",
        documentId: toolId,
        fieldKey: "__exists",
        testingValue: false,
        productionValue: true,
      });
    } else if (toolExistsInTesting && toolExistsInProd) {
      const allKeys = new Set([
        ...Object.keys(testingData),
        ...Object.keys(prodData),
      ]);

      for (const key of allKeys) {
        if (key.startsWith("_")) continue;

        const tVal = testingData[key];
        const pVal = prodData[key];

        const tNorm = normalizeForDiff(tVal);
        const pNorm = normalizeForDiff(pVal);

        if (JSON.stringify(tNorm) !== JSON.stringify(pNorm)) {
          diff.push({
            collection: "tools",
            documentId: toolId,
            fieldKey: key,
            testingValue: tNorm,
            productionValue: pNorm,
          });
        }
      }
    }
  }

  return diff;
}
