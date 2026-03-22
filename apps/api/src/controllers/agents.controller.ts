import type { Context } from "hono";

import { FieldPath, type Query, type QueryDocumentSnapshot } from "firebase-admin/firestore";

import { getFirestore } from "@/lib/firestore";
import { parseAgentDoc } from "@/utils/agents";

const MAX_PAGE_LIMIT = 100;

type AgentDocument = QueryDocumentSnapshot;

const isFirebaseConfigError = (e: unknown): boolean =>
  e instanceof Error && e.message.includes("Credenciales Firebase");

export const getAgentsInfo = async (c: Context) => {
  const light = c.req.query("light") === "1";
  const includePrompt = !light;

  const limitRaw = c.req.query("limit");
  const cursor = c.req.query("cursor")?.trim() || undefined;
  const usePagination =
    light &&
    limitRaw != null &&
    limitRaw !== "" &&
    !Number.isNaN(Number(limitRaw));
  const pageLimit = usePagination
    ? Math.min(
        MAX_PAGE_LIMIT,
        Math.max(1, Math.floor(Number(limitRaw))),
      )
    : null;

  const database = getFirestore();
  const collRef = database.collection("agent_configurations");

  let agentsSnapshot;
  try {
    if (usePagination && pageLimit != null) {
      let query: Query = collRef
        .orderBy(FieldPath.documentId())
        .limit(pageLimit);
      if (cursor) {
        const cursorDoc = await collRef.doc(cursor).get();
        if (!cursorDoc.exists) {
          return c.json(
            { error: "cursor inválido o documento no encontrado" },
            400,
          );
        }
        query = collRef
          .orderBy(FieldPath.documentId())
          .startAfter(cursorDoc)
          .limit(pageLimit);
      }
      agentsSnapshot = await query.get();
    } else {
      agentsSnapshot = await collRef.get();
    }
  } catch (error) {
    if (isFirebaseConfigError(error)) {
      return c.json(
        {
          error:
            "Firebase no configurado. Define credenciales de servicio (env o tokens).",
        },
        503,
      );
    }
    throw error;
  }

  if (light) {
    interface LightAgent {
      enabled: boolean;
      id: string;
      injectCommandsInPrompt?: boolean;
      isMultiMessageResponseEnable?: boolean;
      isValidatorAgentEnable?: boolean;
      model?: string;
      name: string;
      omitFirstEchoes?: boolean;
      owner: string;
      prompt: string;
      temperature?: number;
      waitTime?: number;
    }
    const agents: LightAgent[] = [];
    for (const doc of agentsSnapshot.docs) {
      const parsed = parseAgentDoc(doc as AgentDocument, false);
      if (!parsed) continue;
      const agentRef = database.collection("agent_configurations").doc(doc.id);
      const [agentSnap, aiSnap, promptSnap, responseSnap] = await Promise.all([
        agentRef.collection("properties").doc("agent").get(),
        agentRef.collection("properties").doc("ai").get(),
        agentRef.collection("properties").doc("prompt").get(),
        agentRef.collection("properties").doc("response").get(),
      ]);
      const agentData = agentSnap.exists ? agentSnap.data() : undefined;
      const aiData = aiSnap.exists ? aiSnap.data() : undefined;
      const promptData = promptSnap.exists ? promptSnap.data() : undefined;
      const responseData = responseSnap.exists ? responseSnap.data() : undefined;
      const enabled = (agentData?.enabled as boolean | undefined) !== false;
      const modelFromAi =
        typeof aiData?.model === "string" ? aiData.model : undefined;
      const tempFromAi =
        typeof aiData?.temperature === "number"
          ? aiData.temperature
          : typeof aiData?.temperature === "string"
            ? Number(aiData.temperature)
            : undefined;
      const model =
        modelFromAi ??
        (typeof promptData?.model === "string" ? promptData.model : undefined);
      const temperature = Number.isFinite(tempFromAi)
        ? tempFromAi
        : typeof promptData?.temperature === "number"
          ? promptData.temperature
          : typeof promptData?.temperature === "string"
            ? Number(promptData.temperature)
            : undefined;
      const waitTime =
        typeof responseData?.waitTime === "number"
          ? responseData.waitTime
          : typeof responseData?.waitTime === "string"
            ? Number(responseData.waitTime)
            : undefined;
      agents.push({
        ...parsed,
        enabled,
        injectCommandsInPrompt:
          agentData?.injectCommandsInPrompt === true ||
          agentData?.isCommandsEnable === true,
        isMultiMessageResponseEnable: agentData?.isMultiMessageResponseEnable as
          | boolean
          | undefined,
        isValidatorAgentEnable: agentData?.isValidatorAgentEnable as
          | boolean
          | undefined,
        model: model ?? undefined,
        omitFirstEchoes: agentData?.omitFirstEchoes as boolean | undefined,
        temperature: Number.isFinite(temperature) ? temperature : undefined,
        waitTime: Number.isFinite(waitTime) ? waitTime : undefined,
      });
    }
    if (usePagination) {
      const lastDoc = agentsSnapshot.docs[agentsSnapshot.docs.length - 1];
      const nextCursor =
        agentsSnapshot.docs.length === pageLimit! && lastDoc != null
          ? lastDoc.id
          : null;
      return c.json({ agents, nextCursor });
    }
    return c.json({ agents });
  }

  const agents = agentsSnapshot.docs
    .map((doc: AgentDocument) => parseAgentDoc(doc, includePrompt))
    .filter((agent): agent is NonNullable<typeof agent> => agent !== null);

  return c.json({ agents });
};
