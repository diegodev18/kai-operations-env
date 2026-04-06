import type { Context } from "hono";
import { GoogleGenAI } from "@google/genai";
import { existsSync } from "fs";
import { dirname, join } from "path";
import { z } from "zod";

import { buildBuilderPropertyHeuristicsText } from "@/constants/builder-suggested-properties";
import { getFirestore } from "@/lib/firestore";
import logger from "@/lib/logger";
import type { AgentsInfoAuthContext } from "@/types/agents";

const TOOLS_CATALOG = "toolsCatalog";
const TOOLS_DOCS_STORE_DISPLAY_NAME = "agents-tools-default-docs";
const MODEL = "gemini-2.5-pro";
const TOOLS_DOCS_STORE_NAME_ENV =
  process.env.GEMINI_TOOLS_DOCS_STORE_NAME?.trim() ?? "";

export const MANDATORY_TOOL_NAMES = [
  "kai_knowledge_base_ask_for_knowledge_base",
  "kai_help_escalate_to_support",
] as const;

const MAX_RECOMMENDED_TOOLS = 20;
const DESC_TRUNCATE = 220;

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

const recommendBodySchema = z.object({
  business_name: z.string().optional().default(""),
  owner_name: z.string().optional().default(""),
  industry: z.string().optional().default(""),
  custom_industry: z.string().optional().default(""),
  description: z.string().optional().default(""),
  target_audience: z.string().optional().default(""),
  agent_description: z.string().optional().default(""),
  escalation_rules: z.string().optional().default(""),
  country: z.string().optional().default(""),
  business_timezone: z.string().optional().default(""),
  agent_name: z.string().optional().default(""),
  agent_personality: z.string().optional().default(""),
  response_language: z.string().optional().default("Spanish"),
  business_hours: z.string().optional().default(""),
  require_auth: z.boolean().optional().default(false),
  tools_context_data_actions: z.string().optional().default(""),
  tools_context_commerce_reservations: z.string().optional().default(""),
  tools_context_integrations: z.string().optional().default(""),
  /** Preguntas de flujo (paso Flujos): narrativa P+R para recomendar tools. */
  operational_context: z.string().optional().default(""),
});

type CatalogItem = {
  id: string;
  name: string;
  displayName: string;
  description: string;
  category: string;
};

let aiInstance: GoogleGenAI | null = null;
let cachedStoreName: null | string = null;

function getVertexCredsPath(): null | string {
  if (productionCredsPath && existsSync(productionCredsPath))
    return productionCredsPath;
  return null;
}

function getAiInstance(): GoogleGenAI | null {
  if (aiInstance) return aiInstance;
  if (!VERTEX_AI_PROJECT || !VERTEX_AI_LOCATION) return null;
  try {
    const credsPath = getVertexCredsPath();
    if (!credsPath) {
      logger.error(
        "Vertex AI credentials file not found for recommend-tools",
        {
          expectedPath: productionCredsPath,
          fallbackPath: defaultCredsPath,
          GOOGLE_APPLICATION_CREDENTIALS,
          hasEnvJson: !!(
            FIREBASE_SERVICE_ACCOUNT_JSON_PRODUCTION ??
            FIREBASE_SERVICE_ACCOUNT_JSON
          ),
        },
      );
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
        category: typeof d.category === "string" ? d.category : "",
      };
    })
    .filter(
      (item): item is CatalogItem => item !== null && item.name.length > 0,
    );
}

async function getToolsDocsStoreName(ai: GoogleGenAI): Promise<null | string> {
  if (TOOLS_DOCS_STORE_NAME_ENV) return TOOLS_DOCS_STORE_NAME_ENV;
  if (cachedStoreName) return cachedStoreName;
  const maybeList = (
    ai as unknown as {
      fileSearchStores?: {
        list?: () => AsyncIterable<{ displayName?: string; name?: string }>;
      };
    }
  ).fileSearchStores?.list;
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
    /* empty */
  }
  return null;
}

function extractTextFromModelResponse(response: unknown): string {
  const candidates = (
    response as { candidates?: Array<{ content?: { parts?: unknown[] } }> }
  )?.candidates;
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

function stripMarkdownFences(input: string): string {
  const trimmed = input.trim();
  if (!trimmed.startsWith("```")) return trimmed;
  return trimmed
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "")
    .trim();
}

function extractBalancedJsonObject(input: string): string | null {
  const text = input.trim();
  const start = text.indexOf("{");
  if (start < 0) return null;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (ch === "\\") {
      escaped = true;
      continue;
    }
    if (ch === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;
    if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) {
        return text.slice(start, i + 1);
      }
    }
  }
  return null;
}

function parseCandidateJson(raw: string): unknown | null {
  const candidates = [
    raw,
    stripMarkdownFences(raw),
    extractBalancedJsonObject(raw) ?? "",
  ]
    .map((x) => x.trim())
    .filter(Boolean);
  for (const candidate of candidates) {
    try {
      return JSON.parse(candidate);
    } catch {
      /* try next */
    }
  }
  return null;
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

const recommendResponseSchema = z.object({
  toolIds: z.array(z.string()).optional(),
  rationale: z.string().optional(),
  perTool: z
    .array(
      z.object({
        id: z.string(),
        reason: z.string().optional(),
      }),
    )
    .optional(),
});

function resolveMandatoryIds(catalog: CatalogItem[]): {
  ids: string[];
  missingNames: string[];
} {
  const byName = new Map<string, string>();
  for (const t of catalog) {
    byName.set(t.name, t.id);
  }
  const ids: string[] = [];
  const missingNames: string[] = [];
  for (const name of MANDATORY_TOOL_NAMES) {
    const id = byName.get(name);
    if (id) ids.push(id);
    else missingNames.push(name);
  }
  return { ids, missingNames };
}

function buildCatalogContext(catalog: CatalogItem[]): string {
  return catalog
    .map((item) => {
      const desc =
        item.description.length > DESC_TRUNCATE
          ? `${item.description.slice(0, DESC_TRUNCATE)}…`
          : item.description;
      return `- id:${item.id} | name:${item.name} | cat:${item.category} | display:${item.displayName} | ${desc}`;
    })
    .join("\n");
}

export function mergeMandatoryToolDocIds(
  catalogById: Map<string, Record<string, unknown>>,
  selectedIds: string[],
): string[] {
  const byName = new Map<string, string>();
  for (const [docId, data] of catalogById) {
    const name = typeof data.name === "string" ? data.name : "";
    if (name) byName.set(name, docId);
  }
  const mandatory: string[] = [];
  for (const toolName of MANDATORY_TOOL_NAMES) {
    const id = byName.get(toolName);
    if (id) mandatory.push(id);
  }
  return [...new Set([...mandatory, ...selectedIds])];
}

export async function postAgentRecommendTools(
  c: Context,
  _authCtx: AgentsInfoAuthContext,
) {
  let raw: unknown;
  try {
    raw = await c.req.json();
  } catch {
    return c.json({ error: "JSON inválido" }, 400);
  }

  const parsed = recommendBodySchema.safeParse(raw);
  if (!parsed.success) {
    return c.json({ error: "Payload inválido" }, 400);
  }

  const body = parsed.data;
  const ai = getAiInstance();
  if (!ai) {
    return c.json(
      {
        error:
          "Vertex AI no configurado. Define VERTEX_AI_PROJECT + VERTEX_AI_LOCATION y credenciales de producción.",
      },
      500,
    );
  }

  try {
    const catalog = await loadToolsCatalog();
    const validIds = new Set(catalog.map((t) => t.id));
    const { ids: mandatoryIds, missingNames } = resolveMandatoryIds(catalog);

    const heuristics = buildBuilderPropertyHeuristicsText({
      industry: body.industry,
      description: body.description,
      target_audience: body.target_audience,
    });

    const operationalFromFlows =
      body.operational_context.trim().length > 0
        ? body.operational_context.trim()
        : [
            body.tools_context_data_actions.trim() &&
              `Qué debe hacer con datos reales: ${body.tools_context_data_actions.trim()}`,
            body.tools_context_commerce_reservations.trim() &&
              `Venta / inventario / reservas: ${body.tools_context_commerce_reservations.trim()}`,
            body.tools_context_integrations.trim() &&
              `Herramientas que ya usan: ${body.tools_context_integrations.trim()}`,
          ]
            .filter(Boolean)
            .join("\n");

    const profile = {
      business_name: body.business_name,
      owner_name: body.owner_name,
      industry: body.industry,
      custom_industry: body.custom_industry,
      description: body.description,
      target_audience: body.target_audience,
      agent_description: body.agent_description,
      escalation_rules: body.escalation_rules,
      country: body.country,
      business_timezone: body.business_timezone,
      agent_name: body.agent_name,
      agent_personality: body.agent_personality,
      response_language: body.response_language,
      business_hours: body.business_hours,
      require_auth: body.require_auth,
      operational_context_from_owner: operationalFromFlows || null,
    };

    const userContext = [
      "Perfil del negocio y del agente (JSON):",
      JSON.stringify(profile),
      "",
      heuristics,
      "",
      "Catálogo de herramientas activas (usa SOLO ids de esta lista):",
      buildCatalogContext(catalog),
    ].join("\n");

    const systemInstruction = `You are configuring WhatsApp AI agents. Recommend tools from the catalog for this business profile.
Output STRICT JSON only with this exact shape (no markdown):
{
  "toolIds": ["docId1", "docId2"],
  "rationale": "short summary in Spanish why this set fits the business",
  "perTool": [{ "id": "docId", "reason": "one line in Spanish" }]
}
Rules:
- toolIds must be a subset of catalog ids listed in the user message (the token after "id:").
- Recommend between 4 and ${String(MAX_RECOMMENDED_TOOLS)} tools total including operational needs (CRM, orders, appointments, etc.) when relevant.
- Do NOT invent ids.
- The mandatory knowledge-base and escalate-to-support tools will be merged by the server; you may include or omit them.
- Use operational_context_from_owner (answers from the "Flujos" step) and escalation_rules to choose CRM, orders, appointments, payments info, escalation, knowledge, and support tools. If operational_context_from_owner is null or empty, infer only from the rest of the profile.
- If File Search results are provided in a follow-up, use them to justify tool choices.
- perTool should include an entry for every id in toolIds (same ids).`;

    const storeName = await getToolsDocsStoreName(ai);
    const firstResponse = await ai.models.generateContent({
      model: MODEL,
      contents: userContext,
      config: {
        systemInstruction,
        temperature: 0.25,
        tools: [
          {
            functionDeclarations: [
              {
                name: "search_tools_docs",
                description:
                  "Search tools documentation to pick accurate tool ids for this business.",
                parameters: {
                  type: "object",
                  properties: {
                    query: {
                      type: "string",
                      description: "What to look up in tools docs.",
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
      ((
        firstResponse as unknown as {
          functionCalls?: Array<{
            args?: Record<string, unknown>;
            name?: string;
          }>;
        }
      ).functionCalls ?? [])[0] ??
      (
        (
          firstResponse as unknown as {
            candidates?: Array<{
              content?: {
                parts?: Array<{
                  functionCall?: {
                    args?: Record<string, unknown>;
                    name?: string;
                  };
                }>;
              };
            }>;
          }
        ).candidates?.[0]?.content?.parts ?? []
      )
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
        config: { systemInstruction, temperature: 0.25 } as never,
      });
      rawText = extractTextFromModelResponse(secondResponse);
    }

    const parsedJson = parseCandidateJson(rawText);
    if (!parsedJson) {
      logger.warn("recommend-tools: failed to parse model JSON", {
        preview: rawText.slice(0, 400),
      });
      return c.json(
        {
          error: "No se pudo interpretar la recomendación del modelo.",
          toolIds: mandatoryIds,
          rationale: null,
          perTool: [],
          warnings: missingNames.length
            ? [
                `Herramientas obligatorias no encontradas en catálogo: ${missingNames.join(", ")}`,
              ]
            : [],
        },
        200,
      );
    }

    const validated = recommendResponseSchema.safeParse(parsedJson);
    const fromModel = validated.success
      ? (validated.data.toolIds ?? []).filter(
          (id): id is string =>
            typeof id === "string" && id.length > 0 && validIds.has(id),
        )
      : [];

    const withoutDuplicates = [...new Set(fromModel)];
    const capped = withoutDuplicates.slice(0, MAX_RECOMMENDED_TOOLS);
    const merged = [...new Set([...mandatoryIds, ...capped])];

    const perToolRaw =
      validated.success && validated.data.perTool
        ? validated.data.perTool.filter((p) => validIds.has(p.id))
        : [];

    const perToolMap = new Map(perToolRaw.map((p) => [p.id, p.reason ?? ""]));
    const perTool = merged.map((id) => ({
      id,
      reason:
        perToolMap.get(id) ??
        (mandatoryIds.includes(id)
          ? "Herramienta base recomendada para todos los agentes."
          : ""),
    }));

    const warnings: string[] = [];
    if (missingNames.length) {
      warnings.push(
        `Herramientas obligatorias no encontradas en catálogo: ${missingNames.join(", ")}`,
      );
    }
    if (!validated.success) {
      warnings.push("La respuesta del modelo no cumplió el esquema; se usaron solo ids válidos detectados.");
    }

    return c.json({
      toolIds: merged,
      rationale: validated.success ? validated.data.rationale ?? null : null,
      perTool,
      warnings,
    });
  } catch (err) {
    logger.error("postAgentRecommendTools failed", {
      message: err instanceof Error ? err.message : String(err),
    });
    return c.json(
      { error: "Error al generar la recomendación de herramientas." },
      500,
    );
  }
}
