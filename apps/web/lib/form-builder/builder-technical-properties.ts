/** Alineado con apps/api/src/constants/builder-suggested-properties.ts y PROPERTY_DEFAULTS (MVP). */
export const BUILDER_TECHNICAL_FIELDS: Array<{
  documentId: string;
  fieldKey: string;
  kind: "boolean" | "number" | "string";
}> = [
  { documentId: "agent", fieldKey: "isMultiMessageEnable", kind: "boolean" },
  { documentId: "agent", fieldKey: "isMultiMessageResponseEnable", kind: "boolean" },
  { documentId: "agent", fieldKey: "isAuthEnable", kind: "boolean" },
  { documentId: "agent", fieldKey: "isMemoryEnable", kind: "boolean" },
  { documentId: "agent", fieldKey: "maxFunctionCalls", kind: "number" },
  { documentId: "agent", fieldKey: "omitFirstEchoes", kind: "boolean" },
  { documentId: "agent", fieldKey: "injectCommandsInPrompt", kind: "boolean" },
  { documentId: "response", fieldKey: "waitTime", kind: "number" },
  { documentId: "response", fieldKey: "maxResponseLinesEnabled", kind: "boolean" },
  { documentId: "response", fieldKey: "maxResponseLines", kind: "number" },
  { documentId: "prompt", fieldKey: "isMultiFunctionCallingEnable", kind: "boolean" },
  { documentId: "memory", fieldKey: "limit", kind: "number" },
  { documentId: "limitation", fieldKey: "userLimitation", kind: "boolean" },
  { documentId: "answer", fieldKey: "notSupport", kind: "string" },
];

/** Aristas padre → hijo en el diagrama: el hijo solo aplica o tiene sentido si el padre está activo / configurado. */
export const BUILDER_TECH_PROPERTY_DEPENDENCY_EDGES: Array<{
  parent: { documentId: string; fieldKey: string };
  child: { documentId: string; fieldKey: string };
}> = [
  {
    parent: { documentId: "agent", fieldKey: "isMemoryEnable" },
    child: { documentId: "memory", fieldKey: "limit" },
  },
  {
    parent: { documentId: "response", fieldKey: "maxResponseLinesEnabled" },
    child: { documentId: "response", fieldKey: "maxResponseLines" },
  },
  {
    parent: { documentId: "prompt", fieldKey: "isMultiFunctionCallingEnable" },
    child: { documentId: "agent", fieldKey: "maxFunctionCalls" },
  },
  {
    parent: { documentId: "agent", fieldKey: "isMultiMessageResponseEnable" },
    child: { documentId: "response", fieldKey: "waitTime" },
  },
];

/** Valores por defecto del servidor al crear el borrador (subset). */
export const BUILDER_TECH_DEFAULTS: Record<string, Record<string, unknown>> = {
  agent: {
    isMultiMessageEnable: false,
    isMultiMessageResponseEnable: true,
    isAuthEnable: false,
    isMemoryEnable: false,
    maxFunctionCalls: 4,
    omitFirstEchoes: false,
    injectCommandsInPrompt: false,
  },
  response: {
    waitTime: 3,
    maxResponseLinesEnabled: false,
  },
  prompt: {
    isMultiFunctionCallingEnable: true,
  },
  memory: {
    limit: 15,
  },
  limitation: {
    userLimitation: false,
  },
  answer: {
    notSupport: "Hola súper! Cómo te llamas?",
  },
};

export function getTechFieldDefault(documentId: string, fieldKey: string): unknown {
  return BUILDER_TECH_DEFAULTS[documentId]?.[fieldKey];
}

export function isTechFieldAtDefault(
  documentId: string,
  fieldKey: string,
  current: unknown,
): boolean {
  const def = getTechFieldDefault(documentId, fieldKey);
  const cur =
    current === undefined || current === null ? def : current;
  if (def === undefined || def === null) {
    return cur === undefined || cur === null;
  }
  return JSON.stringify(cur) === JSON.stringify(def);
}

export function formatTechnicalFieldValue(
  kind: "boolean" | "number" | "string",
  value: unknown,
): string {
  if (kind === "boolean") {
    if (value === true) return "Sí";
    if (value === false) return "No";
    return "Sin definir";
  }
  if (kind === "number") {
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
    return "—";
  }
  if (typeof value === "string" && value.trim()) {
    return value.trim().slice(0, 46);
  }
  return "Sin definir";
}
