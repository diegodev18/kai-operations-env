import type { Firestore } from "firebase-admin/firestore";

import type { AgentDocument, LightAgent } from "@/types/agents";

import { fetchGrowersForAgent } from "./growers";
import { parseAgentDoc } from "./parseAgentDoc";

export async function buildLightAgent(
  database: Firestore,
  doc: AgentDocument,
): Promise<LightAgent | null> {
  const parsed = parseAgentDoc(doc, false);
  if (!parsed) return null;
  const agentRef = database.collection("agent_configurations").doc(doc.id);
  const [agentSnap, aiSnap, promptSnap, responseSnap, growers] =
    await Promise.all([
      agentRef.collection("properties").doc("agent").get(),
      agentRef.collection("properties").doc("ai").get(),
      agentRef.collection("properties").doc("prompt").get(),
      agentRef.collection("properties").doc("response").get(),
      fetchGrowersForAgent(agentRef),
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
  return {
    ...parsed,
    growers,
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
  };
}
