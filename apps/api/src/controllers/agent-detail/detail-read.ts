import type { Context } from "hono";
import type { QueryDocumentSnapshot } from "firebase-admin/firestore";

import { ApiErrors } from "@/lib/api-error";
import { PROPERTY_DOC_IDS } from "@/constants/agentPropertyDefaults";
import { getFirestore } from "@/lib/firestore";
import type { AgentsInfoAuthContext } from "@/types/agents-types";
import {
  getAgentDeploymentFlags,
  parseAgentDoc,
  resolveAgentWriteDatabase,
} from "@/utils/agents";
import { serializeValue } from "@/utils/agents/serializeAgentRootForClient";
import {
  assembleBuilderFormPayload,
  BUILDER_SNAPSHOT_INITIAL_DOC,
  BUILDER_SNAPSHOTS_COLLECTION,
  type BuilderFormInitialPayload,
} from "@/utils/agent-detail/builder-form";
import {
  handleFirestoreError,
  normalizeAgentStatus,
  requireAgentAccess,
} from "@/utils/agent-detail/access";
import { mergeWithDefaults } from "@/utils/agent-detail/property-defaults-merge";

export async function getAgentById(
  c: Context,
  authCtx: AgentsInfoAuthContext,
  agentId: string,
) {
  const denied = await requireAgentAccess(c, authCtx, agentId);
  if (denied) return denied;

  try {
    const flags = await getAgentDeploymentFlags(agentId);
    if (!flags.hasTestingData && !flags.inProduction) {
      return ApiErrors.notFound(c, "Agente no encontrado");
    }
    const db = getFirestore();
    const docRef = db.collection("agent_configurations").doc(agentId);
    const [snapshot, agentPropSnap] = await Promise.all([
      docRef.get(),
      docRef.collection("properties").doc("agent").get(),
    ]);
    if (!snapshot.exists) {
      return ApiErrors.notFound(c, "Agente no encontrado");
    }
    const agent = parseAgentDoc(snapshot as QueryDocumentSnapshot, true);
    if (!agent) {
      return ApiErrors.internal(c, "No se pudo leer el agente");
    }
    const agentData = agentPropSnap.exists ? agentPropSnap.data() : undefined;
    const enabled = (agentData?.enabled as boolean | undefined) !== false;
    const status = normalizeAgentStatus(snapshot.data()?.status);
    return c.json({
      ...agent,
      enabled,
      status,
      in_commercial: flags.hasTestingData,
      in_production: flags.inProduction,
      primary_source: flags.hasTestingData ? "commercial" : "production",
    });
  } catch (error) {
    const r = handleFirestoreError(c, error, "[agents/:id GET]");
    return r ?? c.json({ error: "Error al leer agente" }, 500);
  }
}

export async function getAgentProperties(
  c: Context,
  authCtx: AgentsInfoAuthContext,
  agentId: string,
) {
  const denied = await requireAgentAccess(c, authCtx, agentId);
  if (denied) return denied;

  try {
    const { db: database, hasTestingData, inProduction } =
      await resolveAgentWriteDatabase(agentId);
    if (!hasTestingData && !inProduction) {
      return ApiErrors.notFound(c, "Agente no encontrado");
    }
    const agentRef = database.collection("agent_configurations").doc(agentId);
    const agentSnap = await agentRef.get();

    const propertiesRef = hasTestingData
      ? agentRef.collection("testing").doc("data").collection("properties")
      : agentRef.collection("properties");
    const result: Record<string, unknown> = {};

    for (const docId of PROPERTY_DOC_IDS) {
      const snap = await propertiesRef.doc(docId).get();
      const data = snap.exists ? snap.data() : undefined;
      result[docId] = mergeWithDefaults(
        docId,
        data as Record<string, unknown> | undefined,
      );
    }
    const allPropsSnap = await propertiesRef.get();
    for (const doc of allPropsSnap.docs) {
      if (result[doc.id] !== undefined) continue;
      result[doc.id] = doc.data();
    }

    const promptMerged = result.prompt as Record<string, unknown>;
    const aiMerged = result.ai as Record<string, unknown> | undefined;
    const hasModelInAi =
      aiMerged &&
      typeof aiMerged.model === "string" &&
      aiMerged.model.trim() !== "";
    const hasTempInAi =
      aiMerged?.temperature !== undefined &&
      aiMerged.temperature !== null &&
      Number.isFinite(Number(aiMerged.temperature));
    if (aiMerged && hasModelInAi) promptMerged.model = aiMerged.model as string;
    if (aiMerged && hasTempInAi) {
      promptMerged.temperature = Number(aiMerged.temperature);
    }
    if (!hasModelInAi || !hasTempInAi) {
      const agentData = agentSnap.data() as Record<string, unknown> | undefined;
      const ai = agentData?.ai as Record<string, unknown> | undefined;
      if (!hasModelInAi && ai?.model != null && typeof ai.model === "string") {
        promptMerged.model = ai.model;
      }
      if (
        !hasTempInAi &&
        ai?.temperature !== undefined &&
        ai?.temperature !== null &&
        Number.isFinite(Number(ai.temperature))
      ) {
        promptMerged.temperature = Number(ai.temperature);
      }
    }

    const agentResult = result.agent as Record<string, unknown> | undefined;
    if (agentResult && typeof agentResult === "object") {
      const inject =
        agentResult.injectCommandsInPrompt === true ||
        agentResult.isCommandsEnable === true;
      agentResult.injectCommandsInPrompt = inject;
      delete agentResult.isCommandsEnable;
    }

    return c.json({
      ...result,
      in_commercial: hasTestingData,
      in_production: inProduction,
      primary_source: hasTestingData ? "commercial" : "production",
    });
  } catch (error) {
    const r = handleFirestoreError(c, error, "[agents/:id/properties GET]");
    return r ?? c.json({ error: "Error al leer propiedades" }, 500);
  }
}

export async function getAgentBuilderForm(
  c: Context,
  authCtx: AgentsInfoAuthContext,
  agentId: string,
) {
  const denied = await requireAgentAccess(c, authCtx, agentId);
  if (denied) return denied;

  try {
    const flags = await getAgentDeploymentFlags(agentId);
    if (!flags.hasTestingData && !flags.inProduction) {
      return ApiErrors.notFound(c, "Agente no encontrado");
    }

    const { db: database, hasTestingData, inProduction } =
      await resolveAgentWriteDatabase(agentId);
    const agentRef = database.collection("agent_configurations").doc(agentId);

    const live = await assembleBuilderFormPayload(agentRef, hasTestingData);
    if (!live) {
      return ApiErrors.notFound(c, "Agente no encontrado");
    }

    const initialSnap = await agentRef
      .collection(BUILDER_SNAPSHOTS_COLLECTION)
      .doc(BUILDER_SNAPSHOT_INITIAL_DOC)
      .get();

    let initial: BuilderFormInitialPayload | null = null;
    if (initialSnap.exists) {
      const d = initialSnap.data() as Record<string, unknown>;
      initial = {
        root: (d.root ?? {}) as Record<string, unknown>,
        personality: (d.personality ?? null) as Record<string, unknown> | null,
        business: (d.business ?? null) as Record<string, unknown> | null,
        advanced: (d.advanced ?? {}) as Record<string, unknown>,
        saved_at: serializeValue(d.saved_at) as string | null,
      };
    }

    return c.json({
      initial,
      live,
      has_initial_snapshot: initial != null,
      root: live.root,
      personality: live.personality,
      business: live.business,
      advanced: live.advanced,
      in_commercial: hasTestingData,
      in_production: inProduction,
      primary_source: hasTestingData ? "commercial" : "production",
    });
  } catch (error) {
    const r = handleFirestoreError(c, error, "[agents/:id/builder-form GET]");
    return r ?? c.json({ error: "Error al leer formulario del agente" }, 500);
  }
}

export async function getProductionPrompt(
  c: Context,
  authCtx: AgentsInfoAuthContext,
  agentId: string,
) {
  const denied = await requireAgentAccess(c, authCtx, agentId);
  if (denied) return denied;

  try {
    const prod = getFirestore();
    const docRef = prod.collection("agent_configurations").doc(agentId);
    const [agentSnap, promptSnap] = await Promise.all([
      docRef.get(),
      docRef.collection("properties").doc("prompt").get(),
    ]);

    if (!agentSnap.exists) {
      return ApiErrors.notFound(c, "El agente no existe en producción");
    }

    const agentData = agentSnap.data() ?? {};
    const mcp = agentData.mcp_configuration as Record<string, unknown> | undefined;
    const systemPrompt = typeof mcp?.system_prompt === "string" ? mcp.system_prompt : "";

    const promptData = promptSnap.exists ? promptSnap.data() : undefined;
    const basePrompt = typeof promptData?.base === "string" ? promptData.base : "";

    const authData = promptData?.auth as Record<string, unknown> | undefined;
    const authPrompt = authData?.auth as string | undefined;
    const unauthPrompt = authData?.unauth as string | undefined;

    const result: { prompt: string; auth?: { auth: string; unauth: string } } = {
      prompt: basePrompt || systemPrompt,
    };
    if (authPrompt !== undefined || unauthPrompt !== undefined) {
      result.auth = {
        auth: typeof authPrompt === "string" ? authPrompt : "",
        unauth: typeof unauthPrompt === "string" ? unauthPrompt : "",
      };
    }

    return c.json(result);
  } catch (error) {
    const r = handleFirestoreError(c, error, "[agents/:id/production-prompt GET]");
    return r ?? c.json({ error: "Error al leer prompt de producción" }, 500);
  }
}
