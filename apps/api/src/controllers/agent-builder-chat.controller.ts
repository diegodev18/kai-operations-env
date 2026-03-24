import type { Context } from "hono";
import { GoogleGenAI } from "@google/genai";
import { existsSync } from "fs";
import { dirname, join } from "path";
import { z } from "zod";

import { getFirestore } from "@/lib/firestore";
import logger from "@/lib/logger";
import type { AgentsInfoAuthContext } from "@/types/agents";

const TOOLS_CATALOG = "toolsCatalog";
const TOOLS_DOCS_STORE_DISPLAY_NAME = "agents-tools-default-docs";
const MODEL = "gemini-2.5-pro";
const TOOLS_DOCS_STORE_NAME_ENV = process.env.GEMINI_TOOLS_DOCS_STORE_NAME?.trim() ?? "";

const {
  FIREBASE_SERVICE_ACCOUNT_JSON,
  FIREBASE_SERVICE_ACCOUNT_JSON_PRODUCTION,
  GOOGLE_APPLICATION_CREDENTIALS,
  VERTEX_AI_LOCATION,
  VERTEX_AI_PROJECT,
} = process.env;

const defaultCredsPath =
  typeof import.meta.dir !== "undefined"
    ? join(import.meta.dir, "..", "tokens", "firestore.json")
    : join(process.cwd(), "src", "tokens", "firestore.json");

const productionCredsPath = defaultCredsPath
  ? join(dirname(defaultCredsPath), "firebase.production.json")
  : null;

type DraftState = {
  agent_name: string;
  agent_personality: string;
  business_name: string;
  owner_name: string;
  industry: string;
  description: string;
  agent_description: string;
  target_audience: string;
  escalation_rules: string;
  country: string;
  selected_tools: string[];
  creation_step: "personality" | "business" | "tools" | "complete";
};

const messageSchema = z.object({
  role: z.enum(["assistant", "user"]),
  text: z.string().trim().min(1),
});

const draftStateSchema = z.object({
  agent_name: z.string(),
  agent_personality: z.string(),
  business_name: z.string(),
  owner_name: z.string(),
  industry: z.string(),
  description: z.string(),
  agent_description: z.string(),
  target_audience: z.string(),
  escalation_rules: z.string(),
  country: z.string(),
  selected_tools: z.array(z.string()),
  creation_step: z.enum(["personality", "business", "tools", "complete"]),
});

const bodySchema = z.object({
  messages: z.array(messageSchema).min(1),
  draftState: draftStateSchema,
  pendingTasksCount: z.number().int().min(0).optional().default(0),
});

/** Límites UX para bloques UI emitidos por el modelo (sanitización en servidor). */
const UI_MAX_OPTIONS = 8;
const UI_MAX_FORM_FIELDS = 12;
const UI_MAX_OPTION_LABEL = 120;
const UI_MAX_OPTION_VALUE = 500;
const UI_MAX_TITLE = 180;
const UI_MAX_FIELD_KEY = 64;
const UI_MAX_SELECT_OPTIONS = 24;

const uiOptionItemSchema = z.object({
  id: z.string().min(1).max(80),
  label: z.string().min(1).max(UI_MAX_OPTION_LABEL),
  value: z.string().min(1).max(UI_MAX_OPTION_VALUE),
});

const uiOptionsSchema = z.object({
  type: z.literal("options"),
  uiId: z.string().min(1).max(80),
  title: z.string().max(UI_MAX_TITLE).optional(),
  options: z.array(uiOptionItemSchema).min(1).max(UI_MAX_OPTIONS),
  /** Si true: la UI muestra checkboxes y un botón; el usuario envía UI_MULTI con varias opciones. */
  multiSelect: z.boolean().optional(),
  /** Etiqueta del botón de confirmación (solo relevante si multiSelect es true). */
  submitLabel: z.string().max(64).optional(),
});

const formFieldSelectOptionSchema = z.object({
  value: z.string().min(1).max(200),
  label: z.string().min(1).max(UI_MAX_OPTION_LABEL),
});

const formFieldSchema = z
  .object({
    key: z.string().min(1).max(UI_MAX_FIELD_KEY),
    label: z.string().min(1).max(UI_MAX_OPTION_LABEL),
    kind: z.enum(["text", "textarea", "select"]),
    required: z.boolean().optional(),
    placeholder: z.string().max(200).optional(),
    options: z.array(formFieldSelectOptionSchema).max(UI_MAX_SELECT_OPTIONS).optional(),
  })
  .superRefine((data, ctx) => {
    if (data.kind === "select") {
      if (!data.options?.length) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "select fields require options",
        });
      }
    }
  });

const uiFormSchema = z.object({
  type: z.literal("form"),
  uiId: z.string().min(1).max(80),
  formId: z.string().min(1).max(80),
  title: z.string().max(UI_MAX_TITLE).optional(),
  fields: z.array(formFieldSchema).min(1).max(UI_MAX_FORM_FIELDS),
  submitLabel: z.string().max(64).optional(),
});

const uiSchema = z.discriminatedUnion("type", [uiOptionsSchema, uiFormSchema]);

type BuilderChatUi = z.infer<typeof uiSchema>;

function sanitizeUi(raw: BuilderChatUi): BuilderChatUi {
  if (raw.type === "options") {
    const options = raw.options.slice(0, UI_MAX_OPTIONS).map((o) => ({
      id: o.id.trim(),
      label: o.label.trim(),
      value: o.value.trim(),
    }));
    return {
      type: "options",
      uiId: raw.uiId.trim(),
      ...(raw.title?.trim() ? { title: raw.title.trim().slice(0, UI_MAX_TITLE) } : {}),
      options,
      ...(raw.multiSelect === true ? { multiSelect: true as const } : {}),
      ...(raw.submitLabel?.trim()
        ? { submitLabel: raw.submitLabel.trim().slice(0, 64) }
        : {}),
    };
  }
  const fields = raw.fields.slice(0, UI_MAX_FORM_FIELDS).map((f) => {
    const base = {
      key: f.key.trim(),
      label: f.label.trim(),
      kind: f.kind,
      ...(typeof f.required === "boolean" ? { required: f.required } : {}),
      ...(f.placeholder?.trim()
        ? { placeholder: f.placeholder.trim().slice(0, 200) }
        : {}),
    };
    if (f.kind === "select" && f.options?.length) {
      return {
        ...base,
        options: f.options.map((o) => ({
          value: o.value.trim(),
          label: o.label.trim(),
        })),
      };
    }
    return base;
  });
  return {
    type: "form",
    uiId: raw.uiId.trim(),
    formId: raw.formId.trim(),
    ...(raw.title?.trim() ? { title: raw.title.trim().slice(0, UI_MAX_TITLE) } : {}),
    fields,
    ...(raw.submitLabel?.trim()
      ? { submitLabel: raw.submitLabel.trim().slice(0, 64) }
      : {}),
  };
}

const responseBaseSchema = z.object({
  assistantMessage: z.string().min(1).max(12000),
  draftPatch: z
    .object({
      agent_name: z.string().optional(),
      agent_personality: z.string().optional(),
      business_name: z.string().optional(),
      owner_name: z.string().optional(),
      industry: z.string().optional(),
      description: z.string().optional(),
      agent_description: z.string().optional(),
      target_audience: z.string().optional(),
      escalation_rules: z.string().optional(),
      country: z.string().optional(),
      selected_tools: z.array(z.string()).optional(),
    })
    .optional(),
  ui: z.unknown().optional(),
});

let aiInstance: GoogleGenAI | null = null;
let cachedStoreName: null | string = null;

function getVertexCredsPath(): null | string {
  if (productionCredsPath && existsSync(productionCredsPath)) return productionCredsPath;
  return null;
}

function getAiInstance(): GoogleGenAI | null {
  if (aiInstance) return aiInstance;
  if (!VERTEX_AI_PROJECT || !VERTEX_AI_LOCATION) return null;
  try {
    const credsPath = getVertexCredsPath();
    if (!credsPath) {
      logger.error("Vertex AI credentials file not found for agent builder chat", {
        expectedPath: productionCredsPath,
        fallbackPath: defaultCredsPath,
        GOOGLE_APPLICATION_CREDENTIALS,
        hasEnvJson:
          !!(FIREBASE_SERVICE_ACCOUNT_JSON_PRODUCTION ?? FIREBASE_SERVICE_ACCOUNT_JSON),
      });
      return null;
    }
    process.env.GOOGLE_APPLICATION_CREDENTIALS = credsPath;
    aiInstance = new GoogleGenAI({
      location: VERTEX_AI_LOCATION,
      project: VERTEX_AI_PROJECT,
      vertexai: true,
    });
    return aiInstance;
  } catch {
    return null;
  }
}

async function getToolsDocsStoreName(ai: GoogleGenAI): Promise<null | string> {
  if (TOOLS_DOCS_STORE_NAME_ENV) return TOOLS_DOCS_STORE_NAME_ENV;
  if (cachedStoreName) return cachedStoreName;
  const maybeList = (ai as unknown as {
    fileSearchStores?: {
      list?: () => AsyncIterable<{ displayName?: string; name?: string }>;
    };
  }).fileSearchStores?.list;
  if (typeof maybeList !== "function") return null;
  try {
    const stores = await maybeList();
    for await (const store of stores) {
      if (store.displayName === TOOLS_DOCS_STORE_DISPLAY_NAME && store.name) {
        cachedStoreName = store.name;
        return store.name;
      }
    }
  } catch {
    return null;
  }
  return null;
}

type CatalogItem = {
  id: string;
  name: string;
  displayName: string;
  description: string;
};

async function loadToolsCatalog(): Promise<CatalogItem[]> {
  const db = getFirestore();
  const snap = await db.collection(TOOLS_CATALOG).get();
  return snap.docs
    .map((doc) => {
      const d = doc.data() as Record<string, unknown>;
      if (d.status !== "active") return null;
      return {
        id: doc.id,
        name: typeof d.name === "string" ? d.name : "",
        displayName: typeof d.displayName === "string" ? d.displayName : "",
        description: typeof d.description === "string" ? d.description : "",
      };
    })
    .filter((item): item is CatalogItem => item !== null && item.name.length > 0);
}

function trimPatchStrings(patch: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(patch)) {
    if (typeof value === "string") {
      const v = value.trim();
      if (v) out[key] = v;
      continue;
    }
    if (Array.isArray(value)) out[key] = value;
  }
  return out;
}

/**
 * Concatena solo las partes `text` del candidato. No usar `response.text` del SDK:
 * con `functionCall` en la misma respuesta puede lanzar o advertir (Vertex/Gemini).
 */
function extractTextFromModelResponse(response: unknown): string {
  const candidates = (response as { candidates?: Array<{ content?: { parts?: unknown[] } }> })
    ?.candidates;
  const parts = candidates?.[0]?.content?.parts;
  if (!Array.isArray(parts)) return "";
  const chunks: string[] = [];
  for (const part of parts) {
    if (
      part != null &&
      typeof part === "object" &&
      "text" in part &&
      typeof (part as { text?: unknown }).text === "string"
    ) {
      chunks.push((part as { text: string }).text);
    }
  }
  return chunks.join("").trim();
}

async function searchToolsDocsViaFileSearch(
  ai: GoogleGenAI,
  storeName: string,
  query: string,
): Promise<string> {
  try {
    const res = await ai.models.generateContent({
      model: MODEL,
      contents: [
        "Responde usando SOLO la documentación de tools disponible en File Search.",
        `Consulta del usuario: ${query}`,
      ].join("\n"),
      config: {
        tools: [{ fileSearch: { fileSearchStoreNames: [storeName] } }],
      } as never,
    });
    return extractTextFromModelResponse(res);
  } catch {
    return "";
  }
}

export async function postAgentBuilderChat(
  c: Context,
  _authCtx: AgentsInfoAuthContext,
) {
  let raw: unknown;
  try {
    raw = await c.req.json();
  } catch {
    return c.json({ error: "JSON inválido" }, 400);
  }

  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) {
    return c.json({ error: "Payload inválido" }, 400);
  }

  const ai = getAiInstance();
  if (!ai) {
    return c.json(
      {
        error:
          "Vertex AI no configurado para builder chat. Define VERTEX_AI_PROJECT + VERTEX_AI_LOCATION y asegúrate de tener src/tokens/firebase.production.json.",
      },
      500,
    );
  }

  const { draftState, messages, pendingTasksCount } = parsed.data;

  try {
  const lastMessages = messages.slice(-10);
  const catalog = await loadToolsCatalog();

  const catalogContext = catalog
    .slice(0, 120)
    .map(
      (item) =>
        `- id:${item.id} | name:${item.name} | display:${item.displayName} | description:${item.description}`,
    )
    .join("\n");

  const systemInstruction = `You are an assistant that helps users build AI agents through natural conversation in Spanish.
You are the BUILDER/CONFIGURATOR, not the final deployed agent.
CRITICAL: Never roleplay as the agent being built. Never answer as if you are that agent.
CRITICAL: Never use first-person identity as the built agent (e.g. "Hola soy...", "yo te ayudo como mesero", etc.).
Always speak in builder mode: explain, ask for missing configuration data, propose improvements, and summarize changes.
You must not repeat fixed scripts. Be concise, warm, and dynamic.
If user asks about tools, capabilities, or tool recommendations, call function search_tools_docs first.

The UI may send structured user messages from buttons or forms:
- UI_VALUE:<uiId>:<value> — user picked a single option; value may be URI-encoded.
- UI_MULTI:<uiId>:<json> — user confirmed multiple options; <json> is {"selected":[{"id","value","label"},...]} (labels optional).
- UI_FORM:<formId>:<json> — user submitted a form; <json> is a JSON object of string keys to string values (field keys from form).
When you receive these, interpret them and map values into draftPatch fields (and selected_tools IDs when relevant).

Optional interactive UI: you may include at most ONE "ui" block per turn to help the user fill the draft without typing.
- type "options": { "type":"options", "uiId", "title"?: string, "options": [{ "id", "label", "value" }], "multiSelect"?: boolean, "submitLabel"?: string } — max ${String(UI_MAX_OPTIONS)} options. Use "multiSelect": true when the user should pick several items (e.g. remove multiple functions) before confirming; include "submitLabel" (e.g. "Aplicar cambios").
- type "form": { "type":"form", "uiId", "formId", "title"?: string, "fields": [{ "key", "label", "kind": "text"|"textarea"|"select", "required"?: boolean, "placeholder"?: string, "options"?: [{ "value", "label" }] }], "submitLabel"?: string } — max ${String(UI_MAX_FORM_FIELDS)} fields; "select" fields MUST include "options".

Always output STRICT JSON only with this shape:
{
  "assistantMessage": "string",
  "draftPatch": {
    "business_name"?: "string",
    "owner_name"?: "string",
    "industry"?: "string",
    "description"?: "string",
    "target_audience"?: "string",
    "agent_description"?: "string",
    "escalation_rules"?: "string",
    "agent_name"?: "string",
    "agent_personality"?: "string",
    "country"?: "string",
    "selected_tools"?: ["toolId1","toolId2"]
  },
  "ui"?: { ... } | omitted
}
Rules:
- Only include draftPatch keys if new reliable info appears in the latest user message or direct context.
- selected_tools must contain ONLY valid tool IDs from catalog.
- If user asks for tools recommendation, use File Search evidence and suggest tools by IDs in selected_tools.
- assistantMessage must include one next question when useful when appropriate.
- Omit "ui" if free-form chat is enough.`;

  const userContext = [
    "Current draft state:",
    JSON.stringify(draftState),
    "",
    `Pending tasks count: ${pendingTasksCount}`,
    "",
    "Recent conversation:",
    ...lastMessages.map((m) => `${m.role === "user" ? "User" : "Assistant"}: ${m.text}`),
    "",
    "Tools catalog (subset):",
    catalogContext,
  ].join("\n");

  const storeName = await getToolsDocsStoreName(ai);
  const firstResponse = await ai.models.generateContent({
    model: MODEL,
    contents: userContext,
    config: {
      systemInstruction,
      temperature: 0.35,
      tools: [
        {
          functionDeclarations: [
            {
              name: "search_tools_docs",
              description:
                "Search tools documentation to recommend which tools to use.",
              parameters: {
                type: "object",
                properties: {
                  query: {
                    type: "string",
                    description: "User question about tools or tool recommendations.",
                  },
                },
                required: ["query"],
              },
            },
          ],
        },
      ],
    } as never,
  });

  const functionCall =
    ((firstResponse as unknown as {
      functionCalls?: Array<{ args?: Record<string, unknown>; name?: string }>;
    }).functionCalls ?? [])[0] ??
    ((firstResponse as unknown as {
      candidates?: Array<{
        content?: { parts?: Array<{ functionCall?: { args?: Record<string, unknown>; name?: string } }> };
      }>;
    }).candidates?.[0]?.content?.parts ?? [])
      .map((part) => part.functionCall)
      .find((x) => x != null);

  let rawText = extractTextFromModelResponse(firstResponse);
  if (
    functionCall?.name === "search_tools_docs" &&
    typeof functionCall.args?.query === "string"
  ) {
    const query = functionCall.args.query.trim();
    const toolResult =
      storeName == null
        ? "No hay File Search store disponible en este entorno."
        : await searchToolsDocsViaFileSearch(ai, storeName, query);
    const secondResponse = await ai.models.generateContent({
      model: MODEL,
      contents: [
        userContext,
        "",
        "Function call output (search_tools_docs):",
        toolResult || "Sin resultados en docs.",
      ].join("\n"),
      config: { systemInstruction, temperature: 0.35 } as never,
    });
    rawText = extractTextFromModelResponse(secondResponse);
  }
  const parsedJson = (() => {
    try {
      return JSON.parse(rawText);
    } catch {
      const first = rawText.indexOf("{");
      const last = rawText.lastIndexOf("}");
      if (first >= 0 && last > first) {
        try {
          return JSON.parse(rawText.slice(first, last + 1));
        } catch {
          return null;
        }
      }
      return null;
    }
  })();

  if (!parsedJson) {
    return c.json({
      assistantMessage:
        "No pude interpretar la respuesta del modelo. Reintenta con más detalle.",
      draftPatch: {},
    });
  }

  const validated = responseBaseSchema.safeParse(parsedJson);
  if (!validated.success) {
    return c.json({
      assistantMessage:
        "No pude estructurar bien la respuesta del modelo. Probemos con otra pregunta.",
      draftPatch: {},
    });
  }

  let ui: BuilderChatUi | undefined;
  if (validated.data.ui !== undefined && validated.data.ui !== null) {
    const uiParsed = uiSchema.safeParse(validated.data.ui);
    if (uiParsed.success) {
      ui = sanitizeUi(uiParsed.data);
    }
  }

  const draftPatch = trimPatchStrings((validated.data.draftPatch ?? {}) as Record<string, unknown>);
  const selectedTools = Array.isArray(draftPatch.selected_tools)
    ? (draftPatch.selected_tools as unknown[])
        .filter((x): x is string => typeof x === "string" && x.trim().length > 0)
        .filter((id) => catalog.some((tool) => tool.id === id))
    : undefined;
  if (selectedTools) draftPatch.selected_tools = selectedTools;

  return c.json({
    assistantMessage: validated.data.assistantMessage,
    draftPatch,
    ...(ui ? { ui } : {}),
  });
  } catch (err) {
    logger.error("postAgentBuilderChat failed", {
      message: err instanceof Error ? err.message : String(err),
    });
    return c.json(
      {
        error:
          "Error al generar la respuesta del builder. Si persiste, revisa la configuración de Vertex AI.",
      },
      500,
    );
  }
}

