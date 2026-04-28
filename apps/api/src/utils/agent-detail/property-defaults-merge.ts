import {
  PROPERTY_DEFAULTS,
  type PropertyDocId,
} from "@/constants/agent-property-defaults";

export function mergeWithDefaults<T extends PropertyDocId>(
  docId: T,
  data: Record<string, unknown> | undefined,
): (typeof PROPERTY_DEFAULTS)[T] {
  const defaults = PROPERTY_DEFAULTS[docId] as Record<string, unknown>;
  if (!data || typeof data !== "object")
    return PROPERTY_DEFAULTS[docId] as (typeof PROPERTY_DEFAULTS)[T];
  if (docId === "ai") {
    const defAi = PROPERTY_DEFAULTS.ai;
    const thinkingData = data.thinking as Record<string, unknown> | undefined;
    const thinking = {
      includeThoughts:
        typeof thinkingData?.includeThoughts === "boolean"
          ? thinkingData.includeThoughts
          : defAi.thinking.includeThoughts,
      level:
        typeof thinkingData?.level === "string"
          ? thinkingData.level
          : defAi.thinking.level,
    };
    const model =
      typeof data.model === "string" && data.model.trim() !== ""
        ? data.model
        : defAi.model;
    const temperature =
      typeof data.temperature === "number"
        ? data.temperature
        : typeof data.temperature === "string"
          ? Number(data.temperature)
          : defAi.temperature;
    return {
      ...defaults,
      ...data,
      model,
      temperature: Number.isFinite(temperature) ? temperature : defAi.temperature,
      thinking,
    } as (typeof PROPERTY_DEFAULTS)[T];
  }
  if (docId === "prompt") {
    const defPrompt = PROPERTY_DEFAULTS.prompt;
    const authData = data.auth as Record<string, string> | undefined;
    const model =
      typeof data.model === "string" && data.model.trim() !== ""
        ? data.model
        : defPrompt.model;
    const temperature =
      typeof data.temperature === "number"
        ? data.temperature
        : typeof data.temperature === "string"
          ? Number(data.temperature)
          : defPrompt.temperature;
    return {
      ...defaults,
      ...data,
      auth: {
        auth:
          typeof authData?.auth === "string"
            ? authData.auth
            : defPrompt.auth.auth,
        unauth:
          typeof authData?.unauth === "string"
            ? authData.unauth
            : defPrompt.auth.unauth,
      },
      model,
      temperature: Number.isFinite(temperature) ? temperature : defPrompt.temperature,
    } as (typeof PROPERTY_DEFAULTS)[T];
  }
  return { ...defaults, ...data } as (typeof PROPERTY_DEFAULTS)[T];
}
