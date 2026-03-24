import {
  PROPERTY_DEFAULTS,
  PROPERTY_DOC_IDS,
  type PropertyDocId,
} from "@/constants/agentPropertyDefaults";

export type BuilderPropertyValueKind = "boolean" | "number" | "string";

export type BuilderAllowlistEntry = {
  documentId: PropertyDocId;
  fieldKey: string;
  kind: BuilderPropertyValueKind;
  min?: number;
  max?: number;
  maxStringLen?: number;
};

/** Campos que el builder puede leer/escribir (paridad con AgentConfigurationEditor, MVP). */
export const BUILDER_TECHNICAL_PROPERTY_ALLOWLIST: BuilderAllowlistEntry[] = [
  {
    documentId: "agent",
    fieldKey: "isMultiMessageEnable",
    kind: "boolean",
  },
  {
    documentId: "agent",
    fieldKey: "isMultiMessageResponseEnable",
    kind: "boolean",
  },
  {
    documentId: "agent",
    fieldKey: "isAuthEnable",
    kind: "boolean",
  },
  {
    documentId: "agent",
    fieldKey: "isMemoryEnable",
    kind: "boolean",
  },
  {
    documentId: "agent",
    fieldKey: "maxFunctionCalls",
    kind: "number",
    min: 1,
    max: 8,
  },
  {
    documentId: "agent",
    fieldKey: "omitFirstEchoes",
    kind: "boolean",
  },
  {
    documentId: "agent",
    fieldKey: "injectCommandsInPrompt",
    kind: "boolean",
  },
  {
    documentId: "response",
    fieldKey: "waitTime",
    kind: "number",
    min: 0,
    max: 120,
  },
  {
    documentId: "response",
    fieldKey: "maxResponseLinesEnabled",
    kind: "boolean",
  },
  {
    documentId: "response",
    fieldKey: "maxResponseLines",
    kind: "number",
    min: 1,
    max: 80,
  },
  {
    documentId: "prompt",
    fieldKey: "isMultiFunctionCallingEnable",
    kind: "boolean",
  },
  {
    documentId: "memory",
    fieldKey: "limit",
    kind: "number",
    min: 1,
    max: 200,
  },
  {
    documentId: "limitation",
    fieldKey: "userLimitation",
    kind: "boolean",
  },
  {
    documentId: "answer",
    fieldKey: "notSupport",
    kind: "string",
    maxStringLen: 500,
  },
];

const allowlistByCompositeKey = new Map<string, BuilderAllowlistEntry>();
for (const e of BUILDER_TECHNICAL_PROPERTY_ALLOWLIST) {
  allowlistByCompositeKey.set(`${e.documentId}.${e.fieldKey}`, e);
}

export function getBuilderAllowlistEntry(
  documentId: string,
  fieldKey: string,
): BuilderAllowlistEntry | undefined {
  return allowlistByCompositeKey.get(`${documentId}.${fieldKey}`);
}

export function isBuilderTechnicalDocumentId(
  id: string,
): id is (typeof PROPERTY_DOC_IDS)[number] {
  return (PROPERTY_DOC_IDS as readonly string[]).includes(id);
}

export function normalizeAndValidateBuilderPropertyValue(
  entry: BuilderAllowlistEntry,
  raw: unknown,
): { ok: true; value: unknown } | { ok: false; error: string } {
  if (entry.kind === "boolean") {
    if (typeof raw === "boolean") return { ok: true, value: raw };
    if (raw === "true" || raw === "false") {
      return { ok: true, value: raw === "true" };
    }
    return { ok: false, error: `Se esperaba boolean en ${entry.documentId}.${entry.fieldKey}` };
  }
  if (entry.kind === "number") {
    const n =
      typeof raw === "number"
        ? raw
        : typeof raw === "string" && raw.trim() !== ""
          ? Number(raw)
          : NaN;
    if (!Number.isFinite(n)) {
      return { ok: false, error: `Se esperaba número en ${entry.documentId}.${entry.fieldKey}` };
    }
    const min = entry.min ?? -Infinity;
    const max = entry.max ?? Infinity;
    if (n < min || n > max) {
      return {
        ok: false,
        error: `${entry.documentId}.${entry.fieldKey} debe estar entre ${min} y ${max}`,
      };
    }
    return { ok: true, value: n };
  }
  const s = typeof raw === "string" ? raw.trim() : "";
  if (typeof raw !== "string" || s.length === 0) {
    return { ok: false, error: `Se esperaba string en ${entry.documentId}.${entry.fieldKey}` };
  }
  const maxLen = entry.maxStringLen ?? 2000;
  if (s.length > maxLen) {
    return { ok: false, error: `${entry.documentId}.${entry.fieldKey} es demasiado largo` };
  }
  return { ok: true, value: s };
}

export type DraftStateHintSlice = {
  industry: string;
  description: string;
  target_audience: string;
};

/**
 * Texto para el system prompt del builder: perfiles e ideas de qué sugerir.
 * No sustituye al LLM; orienta prioridades.
 */
export function buildBuilderPropertyHeuristicsText(draft: DraftStateHintSlice): string {
  const blob = [draft.industry, draft.description, draft.target_audience]
    .join(" ")
    .toLowerCase();
  const lines: string[] = [];

  if (
    /restaurant|restaurante|café|cafe|bar|mesero|comida|hosteler|hotel|comedor|catering/i.test(
      blob,
    )
  ) {
    lines.push(
      "- Perfil hostelería/restaurante: suele ayudar ofrecer agent.isMultiMessageEnable (varios mensajes de WhatsApp por una sola respuesta del modelo). Opcional: response.waitTime si hay mucho ruido de mensajes seguidos.",
    );
  }
  if (/soporte|support|ticket|b2b|empresa|corporativ|cliente saas|saas/i.test(blob)) {
    lines.push(
      "- Perfil soporte/B2B: valorar agent.isAuthEnable si habrá usuarios identificados; limitation.userLimitation si solo ciertos números deben recibir respuesta.",
    );
  }
  if (/ecommerce|venta online|pedido|envío|stock|catálogo|shop/i.test(blob)) {
    lines.push(
      "- Perfil retail/e-commerce: valorar prompt.isMultiFunctionCallingEnable y agent.maxFunctionCalls según uso de herramientas.",
    );
  }
  if (/alto volumen|muchas consultas|picos|rush|filas/i.test(blob)) {
    lines.push(
      "- Alto volumen: response.isMultiMessageResponseEnable + waitTime para agrupar mensajes entrantes puede reducir ruido.",
    );
  }

  if (lines.length === 0) {
    lines.push(
      "- Sin perfil fuerte detectado por palabras clave: ofrece 1–2 mejoras típicas (p. ej. isMultiMessageEnable o memoria isMemoryEnable) según lo que diga el usuario.",
    );
  }

  return [
    "Heurísticas de negocio (orientación, no reglas rígidas):",
    ...lines,
    "",
    "ALLOWLIST JSON field names for property_patch entries (documentId + fieldKey + value):",
    BUILDER_TECHNICAL_PROPERTY_ALLOWLIST.map(
      (e) => `  { "documentId": "${e.documentId}", "fieldKey": "${e.fieldKey}", "value": <${e.kind}> }`,
    ).join("\n"),
    "",
    "Defaults actuales en servidor (referencia):",
    JSON.stringify({
      agent: PROPERTY_DEFAULTS.agent,
      response: PROPERTY_DEFAULTS.response,
      prompt: { isMultiFunctionCallingEnable: PROPERTY_DEFAULTS.prompt.isMultiFunctionCallingEnable },
      memory: PROPERTY_DEFAULTS.memory,
    }),
  ].join("\n");
}
