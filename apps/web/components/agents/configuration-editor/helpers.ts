import type { AgentPropertiesResponse, PropertyDocumentId } from "@/types";
import {
  DEFAULT_LLM_MODEL,
  DOCUMENT_IDS,
  getDefaultTemperatureForModel,
} from "./constants";

export function payloadsEqual(
  a: Record<string, unknown>,
  b: Record<string, unknown>,
): boolean {
  return valueEquals(deepSortKeys(a), deepSortKeys(b));
}

function deepSortKeys(obj: unknown): unknown {
  if (obj === null || typeof obj !== "object") return obj;
  if (Array.isArray(obj)) return obj.map(deepSortKeys);
  const sorted: Record<string, unknown> = {};
  Object.keys(obj as object).sort().forEach((key) => {
    sorted[key] = deepSortKeys((obj as Record<string, unknown>)[key]);
  });
  return sorted;
}

export function valueEquals(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a === null || b === null) return a === b;
  if (typeof a !== typeof b) return false;

  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    return a.every((item, i) => valueEquals(item, b[i]));
  }

  if (typeof a === "object" && typeof b === "object") {
    if (a === null || b === null) return a === b;
    const keysA = Object.keys(a as object);
    const keysB = Object.keys(b as object);
    if (keysA.length !== keysB.length) return false;
    return keysA.every((key) =>
      valueEquals(
        (a as Record<string, unknown>)[key],
        (b as Record<string, unknown>)[key],
      ),
    );
  }

  return JSON.stringify(a) === JSON.stringify(b);
}

export function getPendingDocumentIds(
  formState: AgentPropertiesResponse,
  originalData: AgentPropertiesResponse | null,
): PropertyDocumentId[] {
  if (!originalData) return [];
  return DOCUMENT_IDS.filter((docId) => {
    const payloadForm = buildPayloadForDocument(docId, formState);
    const payloadOriginal = buildPayloadForDocument(docId, originalData);
    return !payloadsEqual(payloadForm, payloadOriginal);
  });
}

export function buildPayloadForDocument(
  documentId: PropertyDocumentId,
  formState: AgentPropertiesResponse,
): Record<string, unknown> {
  switch (documentId) {
    case "agent": {
      const agent = formState.agent ?? {};
      const rawMax = agent.maxFunctionCalls ?? 4;
      const maxFunctionCalls = Math.min(
        8,
        Math.max(1, Number.isFinite(rawMax) ? rawMax : 4),
      );
      return {
        enabled: agent.enabled !== false,
        isAuthEnable: agent.isAuthEnable,
        injectCommandsInPrompt: agent.injectCommandsInPrompt,
        isMemoryEnable: agent.isMemoryEnable,
        isMultiMessageEnable: agent.isMultiMessageEnable,
        isMultiMessageResponseEnable: agent.isMultiMessageResponseEnable,
        maxFunctionCalls,
        omitFirstEchoes: agent.omitFirstEchoes,
        isValidatorAgentEnable: agent.isValidatorAgentEnable ?? false,
        excludedNumbers: agent.excludedNumbers ?? [],
      };
    }
    case "answer":
      return { notSupport: formState.answer?.notSupport ?? "" };
    case "ai": {
      const thinking = formState.ai?.thinking;
      const aiModel = formState.ai?.model ?? DEFAULT_LLM_MODEL;
      const aiTemp =
        formState.ai?.temperature !== undefined &&
        formState.ai?.temperature !== null
          ? Number(formState.ai.temperature)
          : getDefaultTemperatureForModel(aiModel);
      return {
        model: aiModel,
        temperature: Number.isFinite(aiTemp)
          ? aiTemp
          : getDefaultTemperatureForModel(aiModel),
        thinking: {
          budget: thinking?.budget,
          includeThoughts: thinking?.includeThoughts ?? false,
          level: thinking?.level ?? "",
        },
      };
    }
    case "response": {
      const response = formState.response ?? {};
      const maxResponseLinesEnabled =
        response.maxResponseLinesEnabled ?? false;
      const maxResponseLines = response.maxResponseLines ?? 50;
      return {
        maxResponseLinesEnabled,
        maxResponseLines: maxResponseLinesEnabled ? maxResponseLines : undefined,
        waitTime: response.waitTime ?? 3,
      };
    }
    case "time":
      return {
        zone: formState.time?.zone ?? "America/Mexico_City",
        echoesWaitMinutes: formState.time?.echoesWaitMinutes ?? 480,
      };
    case "prompt": {
      const prompt = formState.prompt ?? {};
      return {
        isMultiFunctionCallingEnable: prompt.isMultiFunctionCallingEnable,
      };
    }
    case "memory":
      return { limit: formState.memory?.limit ?? 15 };
    case "mcp":
      return { maxRetries: formState.mcp?.maxRetries ?? 1 };
    case "limitation": {
      const lim = formState.limitation;
      return {
        userLimitation: lim?.userLimitation ?? false,
        allowedUsers: Array.isArray(lim?.allowedUsers) ? lim.allowedUsers : [],
      };
    }
    default:
      return {};
  }
}

/**
 * Builds a payload with only the top-level keys that differ from originalData.
 * Used so unchanged fields stay unset and the agent keeps defaults.
 */
export function buildPartialPayloadForDocument(
  documentId: PropertyDocumentId,
  formState: AgentPropertiesResponse,
  originalData: AgentPropertiesResponse | null,
): Record<string, unknown> {
  if (!originalData) return buildPayloadForDocument(documentId, formState);
  const fullForm = buildPayloadForDocument(documentId, formState);
  const fullOriginal = buildPayloadForDocument(documentId, originalData);
  const result: Record<string, unknown> = {};
  for (const key of Object.keys(fullForm)) {
    if (!valueEquals(fullForm[key], fullOriginal[key])) {
      result[key] = fullForm[key];
    }
  }
  return result;
}

export function getValueAtPath(
  root: Record<string, unknown>,
  path: string,
): unknown {
  if (!path) return undefined;
  const parts = path.split(".");
  let cur: unknown = root;
  for (const p of parts) {
    if (
      cur === null ||
      cur === undefined ||
      typeof cur !== "object" ||
      Array.isArray(cur)
    ) {
      return undefined;
    }
    cur = (cur as Record<string, unknown>)[p];
  }
  return cur;
}

/** Rutas tipo `maxFunctionCalls` o `thinking.level` donde difiere el payload respecto al original. */
function collectChangedLeafPaths(
  formVal: unknown,
  origVal: unknown,
  basePath: string,
): string[] {
  if (valueEquals(formVal, origVal)) return [];

  const bothPlainObjects =
    formVal !== null &&
    origVal !== null &&
    typeof formVal === "object" &&
    typeof origVal === "object" &&
    !Array.isArray(formVal) &&
    !Array.isArray(origVal);

  if (bothPlainObjects) {
    const fo = formVal as Record<string, unknown>;
    const oo = origVal as Record<string, unknown>;
    const keys = new Set([...Object.keys(fo), ...Object.keys(oo)]);
    const out: string[] = [];
    for (const k of keys) {
      const nextPath = basePath ? `${basePath}.${k}` : k;
      out.push(...collectChangedLeafPaths(fo[k], oo[k], nextPath));
    }
    return out.length > 0 ? out : [basePath];
  }

  return [basePath];
}

export function getChangedFieldPathsForDocument(
  documentId: PropertyDocumentId,
  formState: AgentPropertiesResponse,
  originalData: AgentPropertiesResponse,
): string[] {
  const fullForm = buildPayloadForDocument(documentId, formState) as Record<
    string,
    unknown
  >;
  const fullOriginal = buildPayloadForDocument(
    documentId,
    originalData,
  ) as Record<string, unknown>;
  const paths: string[] = [];
  const keys = new Set([...Object.keys(fullForm), ...Object.keys(fullOriginal)]);
  for (const key of keys) {
    paths.push(...collectChangedLeafPaths(fullForm[key], fullOriginal[key], key));
  }
  return [...new Set(paths)].sort((a, b) =>
    a.localeCompare(b, "es", { sensitivity: "base" }),
  );
}
