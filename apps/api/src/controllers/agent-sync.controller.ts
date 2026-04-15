import type { Context } from "hono";
import { z } from "zod";

import { getFirestore } from "@/lib/firestore";
import type { AgentsInfoAuthContext } from "@/types/agents";
import { appendImplementationActivityEntry } from "@/services/implementation-activity.service";
import {
  extractFirestoreIndexUrl,
  firestoreFailureHint,
  isFirebaseConfigError,
} from "@/utils/firestore/errors";
import { userCanAccessAgent } from "@/utils/agents";

function handleError(c: Context, error: unknown, logPrefix: string) {
  if (isFirebaseConfigError(error)) {
    return c.json(
      {
        error:
          "Firebase no configurado. Define credenciales de servicio (env o tokens).",
      },
      503,
    );
  }
  const hint = firestoreFailureHint(error);
  const msg = error instanceof Error ? error.message : String(error);
  const createIndexUrl = extractFirestoreIndexUrl(msg);
  console.error(`${logPrefix}`, msg);
  if (hint) {
    return c.json(
      { error: hint, ...(createIndexUrl ? { createIndexUrl } : {}) },
      503,
    );
  }
  return c.json({ error: msg }, 500);
}

export async function postSyncFromProduction(
  c: Context,
  authCtx: AgentsInfoAuthContext,
  agentId: string,
) {
  try {
    const ok = await userCanAccessAgent(authCtx, agentId);
    if (!ok) {
      return c.json({ error: "No autorizado para este agente" }, 403);
    }
    const db = getFirestore();
    const prodSnap = await db
      .collection("agent_configurations")
      .doc(agentId)
      .get();
    if (!prodSnap.exists) {
      return c.json({ error: "El agente no existe en producción" }, 404);
    }

    const testingDataRef = db
      .collection("agent_configurations")
      .doc(agentId)
      .collection("testing")
      .doc("data");

    const prodPropertiesRef = prodSnap.ref.collection("properties");
    const prodToolsRef = prodSnap.ref.collection("tools");
    const prodGrowersRef = prodSnap.ref.collection("growers");

    const testingPropertiesRef = testingDataRef.collection("properties");
    const testingToolsRef = testingDataRef.collection("tools");
    const testingCollaboratorsRef = testingDataRef.collection("collaborators");

    const [propsSnap, toolsSnap, growersSnap] = await Promise.all([
      prodPropertiesRef.get(),
      prodToolsRef.get(),
      prodGrowersRef.get(),
    ]);

    await testingDataRef.set({ _syncedAt: new Date().toISOString() }, { merge: true });

    for (const doc of propsSnap.docs) {
      await testingPropertiesRef.doc(doc.id).set(doc.data(), { merge: true });
    }

    for (const doc of toolsSnap.docs) {
      await testingToolsRef.doc(doc.id).set(doc.data(), { merge: true });
    }

    for (const doc of growersSnap.docs) {
      const collaboratorData = {
        email: doc.data()?.email,
        name: doc.data()?.name,
      };
      await testingCollaboratorsRef.doc(doc.id).set(collaboratorData, { merge: true });
    }

    return c.json({ ok: true });
  } catch (error) {
    const r = handleError(c, error, "[agents sync-from-production]");
    return r ?? c.json({ error: "No se pudo sincronizar desde producción." }, 500);
  }
}

const promoteBodySchema = z.object({
  fields: z.array(z.object({
    collection: z.string(),
    documentId: z.string(),
    fieldKey: z.string(),
    value: z.any(),
  })).min(1),
  confirmation_agent_name: z.string().trim().min(1),
});

export async function postPromoteToProduction(
  c: Context,
  authCtx: AgentsInfoAuthContext,
  agentId: string,
) {
  let raw: unknown;
  try {
    raw = await c.req.json();
  } catch {
    return c.json({ error: "JSON inválido" }, 400);
  }
  const parsed = promoteBodySchema.safeParse(raw);
  if (!parsed.success) {
    const msg = parsed.error.issues.map((i) => i.message).join("; ");
    return c.json({ error: msg }, 400);
  }

  try {
    const ok = await userCanAccessAgent(authCtx, agentId);
    if (!ok) {
      return c.json({ error: "No autorizado para este agente" }, 403);
    }
    const db = getFirestore();
    const agentRef = db.collection("agent_configurations").doc(agentId);
    const snap = await agentRef.get();
    if (!snap.exists) {
      return c.json(
        { error: "El agente no existe en producción" },
        404,
      );
    }
    const normalizedInput = parsed.data.confirmation_agent_name
      .trim()
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");
    if (normalizedInput !== "confirmar") {
      return c.json(
        {
          error:
            "El nombre de confirmación no coincide con el nombre del agente.",
        },
        400,
      );
    }

    for (const field of parsed.data.fields) {
      if (field.collection === "properties") {
        const prodDocRef = agentRef.collection("properties").doc(field.documentId);
        await prodDocRef.set({ [field.fieldKey]: field.value }, { merge: true });

        if (
          field.documentId === "prompt" &&
          field.fieldKey === "base" &&
          typeof field.value === "string"
        ) {
          await agentRef.update({
            "mcp_configuration.system_prompt": field.value,
          });
        }
      } else if (field.collection === "tools") {
        const prodToolRef = agentRef.collection("tools").doc(field.documentId);
        await prodToolRef.set({ [field.fieldKey]: field.value }, { merge: true });
      } else if (field.collection === "collaborators") {
        const prodGrowerRef = agentRef.collection("growers").doc(field.documentId);
        await prodGrowerRef.set({ [field.fieldKey]: field.value }, { merge: true });
      }
    }

    const collectionLabelEs: Record<string, string> = {
      properties: "propiedades",
      tools: "herramientas",
      collaborators: "colaboradores",
    };
    const actorEmail = authCtx.userEmail?.toLowerCase().trim() ?? null;
    const loggedCollections = new Set(["properties", "tools", "collaborators"]);
    for (const field of parsed.data.fields) {
      if (!loggedCollections.has(field.collection)) continue;
      const collectionEs =
        collectionLabelEs[field.collection] ?? field.collection;
      void appendImplementationActivityEntry(db, agentId, {
        kind: "system",
        actorEmail,
        action: "promoted_to_production",
        summary: `Subió a producción (${collectionEs}: ${field.documentId} -> ${field.fieldKey}).`,
        metadata: {
          collection: field.collection,
          documentId: field.documentId,
          fieldKey: field.fieldKey,
        },
      });
    }

    return c.json({ ok: true });
  } catch (error) {
    const r = handleError(c, error, "[agents promote-to-production]");
    return r ?? c.json({ error: "No se pudo promover a producción." }, 500);
  }
}

export async function getTestingDiff(
  c: Context,
  authCtx: AgentsInfoAuthContext,
  agentId: string,
) {
  try {
    const ok = await userCanAccessAgent(authCtx, agentId);
    if (!ok) {
      return c.json({ error: "No autorizado para este agente" }, 403);
    }
    const db = getFirestore();
    const agentRef = db.collection("agent_configurations").doc(agentId);

    const testingDataRef = agentRef.collection("testing").doc("data");
    const testingDataSnap = await testingDataRef.get();
    if (!testingDataSnap.exists) {
      return c.json({ error: "No hay datos de testing" }, 404);
    }

    const [prodPropsSnap, testingPropsSnap, prodToolsSnap, testingToolsSnap] = await Promise.all([
      agentRef.collection("properties").get(),
      testingDataRef.collection("properties").get(),
      agentRef.collection("tools").get(),
      testingDataRef.collection("tools").get(),
    ]);

    const diff: Array<{
      collection: string;
      documentId: string;
      fieldKey: string;
      testingValue: unknown;
      productionValue: unknown;
    }> = [];

    const normalize = (v: any): any => {
      if (v === undefined) return null;
      try {
        const normalized = JSON.parse(JSON.stringify(v));
        return sortKeysRecursively(normalized);
      } catch {
        return v;
      }
    };

    const sortKeysRecursively = (obj: any): any => {
      if (obj === null || typeof obj !== "object") return obj;
      if (Array.isArray(obj)) return obj.map(sortKeysRecursively);
      const sorted: Record<string, any> = {};
      Object.keys(obj).sort().forEach((key) => {
        sorted[key] = sortKeysRecursively(obj[key]);
      });
      return sorted;
    };

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

        const tNorm = normalize(tVal);
        const pNorm = normalize(pVal);

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

      // Check if tool exists in both
      const toolExistsInTesting = testingTool?.exists;
      const toolExistsInProd = prodTool?.exists;

      if (toolExistsInTesting && !toolExistsInProd) {
        // Tool added in testing
        diff.push({
          collection: "tools",
          documentId: toolId,
          fieldKey: "__exists",
          testingValue: true,
          productionValue: false,
        });
      } else if (!toolExistsInTesting && toolExistsInProd) {
        // Tool removed in testing
        diff.push({
          collection: "tools",
          documentId: toolId,
          fieldKey: "__exists",
          testingValue: false,
          productionValue: true,
        });
      } else if (toolExistsInTesting && toolExistsInProd) {
        // Tool exists in both, compare fields
        const allKeys = new Set([
          ...Object.keys(testingData),
          ...Object.keys(prodData),
        ]);

        for (const key of allKeys) {
          if (key.startsWith("_")) continue;

          const tVal = testingData[key];
          const pVal = prodData[key];

          const tNorm = normalize(tVal);
          const pNorm = normalize(pVal);

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

    return c.json({ diff });
  } catch (error) {
    const r = handleError(c, error, "[agents testing diff]");
    return r ?? c.json({ error: "No se pudo obtener el diff." }, 500);
  }
}
