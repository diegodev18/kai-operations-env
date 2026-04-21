import type { Context } from "hono";
import { GoogleGenAI } from "@google/genai";
import { existsSync } from "fs";
import { dirname, join } from "path";
import { z } from "zod";

import { getFirestore } from "@/lib/firestore";
import logger from "@/lib/logger";
import type { AgentsInfoAuthContext } from "@/types/agents";

const TOOLS_CATALOG = "toolsCatalog";
const MODEL = "gemini-2.5-pro";

const {
  FIREBASE_SERVICE_ACCOUNT_JSON,
  FIREBASE_SERVICE_ACCOUNT_JSON_PRODUCTION,
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

const toolFlowsBodySchema = z.object({
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
  operational_context: z.string().optional().default(""),
  tools_context_data_actions: z.string().optional().default(""),
  tools_context_commerce_reservations: z.string().optional().default(""),
  tools_context_integrations: z.string().optional().default(""),
  /** Políticas, saludo, temas a evitar, y texto de la recomendación de herramientas (razones por id). */
  supplemental_context: z.string().max(100_000).optional().default(""),
  selectedToolIds: z.array(z.string().trim().min(1)).min(1),
  mode: z.enum(["generate", "update"]),
  existingMarkdownEs: z.string().max(100_000).optional(),
  /** Si es true, la respuesta es `text/event-stream` (SSE) con eventos JSON `delta` / `done` / `error`. */
  stream: z.boolean().optional().default(false),
});

type CatalogRow = {
  id: string;
  name: string;
  displayName: string;
  description: string;
  path: string;
  category: string;
};

let aiInstance: GoogleGenAI | null = null;

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
      logger.error("Vertex AI credentials not found for tool-flows-markdown", {
        expectedPath: productionCredsPath,
        hasEnvJson: !!(
          FIREBASE_SERVICE_ACCOUNT_JSON_PRODUCTION ??
          FIREBASE_SERVICE_ACCOUNT_JSON
        ),
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

/** Fragmento de texto en un chunk del stream (`chunk.text` o estructura candidates/parts). */
function extractStreamDelta(chunk: unknown): string {
  if (chunk != null && typeof chunk === "object" && "text" in chunk) {
    const t = (chunk as { text?: unknown }).text;
    if (typeof t === "string" && t.length > 0) return t;
  }
  return extractTextFromModelResponse(chunk);
}

type StreamableModels = {
  generateContentStream: (args: {
    model: string;
    contents: string;
    config: Record<string, unknown>;
  }) => Promise<AsyncIterable<unknown>>;
};

async function loadToolsCatalogRows(): Promise<CatalogRow[]> {
  const db = getFirestore();
  const snap = await db.collection(TOOLS_CATALOG).get();
  return snap.docs
    .map((doc) => {
      const d = doc.data() as Record<string, unknown>;
      if (d.status !== "active") return null;
      const path =
        typeof d.path === "string" && d.path.length > 0
          ? d.path
          : typeof d.name === "string"
            ? d.name.replace(/\//g, "_")
            : "";
      return {
        id: doc.id,
        name: typeof d.name === "string" ? d.name : "",
        displayName: typeof d.displayName === "string" ? d.displayName : "",
        description: typeof d.description === "string" ? d.description : "",
        path,
        category: typeof d.category === "string" ? d.category : "",
      };
    })
    .filter(
      (item): item is CatalogRow => item !== null && item.name.length > 0,
    );
}

function buildSelectedToolsBlock(rows: CatalogRow[], selectedIds: string[]): string {
  const byId = new Map(rows.map((r) => [r.id, r]));
  const lines: string[] = [];
  for (const id of selectedIds) {
    const t = byId.get(id);
    if (!t) {
      lines.push(`- id:${id} (no encontrada en catálogo activo)`);
      continue;
    }
    lines.push(
      [
        `### ${t.displayName || t.name}`,
        `- id: \`${t.id}\``,
        `- name: \`${t.name}\``,
        `- path: \`${t.path}\``,
        `- categoría: ${t.category || "—"}`,
        `- descripción: ${t.description || "—"}`,
      ].join("\n"),
    );
  }
  return lines.join("\n\n");
}

export async function postAgentToolFlowsMarkdown(
  c: Context,
  _authCtx: AgentsInfoAuthContext,
) {
  let raw: unknown;
  try {
    raw = await c.req.json();
  } catch {
    return c.json({ error: "JSON inválido" }, 400);
  }

  const parsed = toolFlowsBodySchema.safeParse(raw);
  if (!parsed.success) {
    return c.json(
      { error: parsed.error.issues.map((i) => i.message).join("; ") },
      400,
    );
  }

  const body = parsed.data;
  if (body.mode === "update" && !body.existingMarkdownEs?.trim()) {
    return c.json(
      { error: "En modo update, existingMarkdownEs es obligatorio." },
      400,
    );
  }

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
    const catalog = await loadToolsCatalogRows();
    const validIds = new Set(catalog.map((t) => t.id));
    const unknown = body.selectedToolIds.filter((id) => !validIds.has(id));
    if (unknown.length > 0) {
      return c.json(
        {
          error: "Hay herramientas no válidas o inactivas en el catálogo.",
          invalidIds: unknown,
        },
        400,
      );
    }

    const toolsBlock = buildSelectedToolsBlock(catalog, body.selectedToolIds);

    const toolsHintLines = [
      body.tools_context_data_actions.trim() &&
        `Datos / acciones: ${body.tools_context_data_actions.trim()}`,
      body.tools_context_commerce_reservations.trim() &&
        `Comercio / reservas: ${body.tools_context_commerce_reservations.trim()}`,
      body.tools_context_integrations.trim() &&
        `Integraciones: ${body.tools_context_integrations.trim()}`,
    ].filter(Boolean);

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
      operational_context: body.operational_context.trim() || null,
      extra_hints: toolsHintLines.length ? toolsHintLines.join("\n") : null,
    };

    const userParts = [
      "Perfil del negocio (JSON):",
      JSON.stringify(profile, null, 2),
      "",
      "Herramientas seleccionadas (solo estas; documenta cada una):",
      toolsBlock,
    ];

    if (body.supplemental_context.trim()) {
      userParts.push(
        "",
        "Contexto adicional del constructor (políticas, voz, y motivación de la recomendación de herramientas). Úsalo para inventar disparadores realistas y respuestas al usuario:",
        body.supplemental_context.trim(),
      );
    }

    if (body.mode === "update" && body.existingMarkdownEs?.trim()) {
      userParts.push(
        "",
        "Documento markdown actual del usuario (ajústalo; conserva lo que siga siendo válido):",
        body.existingMarkdownEs.trim(),
      );
    }

    const userMessage = userParts.join("\n");

    const systemInstruction =
      body.mode === "generate"
        ? `Eres un experto en diseño de agentes conversacionales con herramientas (MCP).
Debes producir UN ÚNICO documento en **markdown**, íntegramente en **español**.

Contenido requerido:
- Un título principal (#) para el manual.
- Por cada herramienta listada en el mensaje del usuario: sección (##) con nombre legible.
- Para cada herramienta incluye: cuándo usarla, prerequisitos o datos a pedir al usuario, pasos recomendados del flujo, qué comunicar al usuario en cada paso, manejo de errores o ambigüedad, y cuándo escalar según escalation_rules del perfil si aplica.
- **Ejemplos conversacionales obligatorios:** en cada herramienta relevante, incluye al menos un bloque claro del tipo: *Si el usuario dice o pregunta X (mensaje típico en lenguaje natural)* → *qué herramienta ejecutar y con qué intención* → *qué datos pedir antes si faltan* → *cómo presentar el resultado al usuario* (p. ej. conteos, resúmenes, “encontré N ítems…”). Los ejemplos deben basarse en el negocio, operational_context, descripciones del catálogo y cualquier “Contexto adicional del constructor”.

Reglas:
- No inventes nombres de APIs internas ni menciones repos o frameworks.
- Sé específico al negocio y al operational_context del perfil; evita frases genéricas vacías.
- No envuelvas el resultado en bloques de código markdown; el texto completo es el markdown del manual.
- No uses JSON; solo markdown.`
        : `Eres un experto en diseño de agentes conversacionales con herramientas (MCP).
El usuario cambió la lista de herramientas o quiere alinear el manual con el catálogo actual.

Tienes el markdown anterior en español y la lista actual de herramientas con sus descripciones.
Produce UN ÚNICO documento en **markdown**, íntegramente en **español**, que:
- Actualice o elimine secciones de herramientas que ya no apliquen.
- Añada secciones para herramientas nuevas.
- Preserve el tono y decisiones útiles del documento anterior cuando sigan siendo válidas.
- Donde falten **ejemplos conversacionales** (disparador del usuario → uso de herramienta → respuesta al usuario), añádelos siguiendo el perfil, operational_context y el “Contexto adicional del constructor” si existe.

Reglas:
- No inventes APIs internas ni menciones repos.
- No envuelvas el resultado en bloques de código; el texto completo es el markdown.
- No uses JSON; solo markdown.`;

    const genConfig = {
      systemInstruction,
      temperature: body.mode === "update" ? 0.2 : 0.25,
    };

    if (body.stream) {
      const encoder = new TextEncoder();
      const readable = new ReadableStream({
        async start(controller) {
          const send = (obj: Record<string, unknown>) => {
            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify(obj)}\n\n`),
            );
          };
          try {
            const streamIt = await (
              ai.models as unknown as StreamableModels
            ).generateContentStream({
              model: MODEL,
              contents: userMessage,
              config: genConfig,
            });
            let full = "";
            for await (const chunk of streamIt) {
              const delta = extractStreamDelta(chunk);
              if (delta) {
                full += delta;
                send({ delta });
              }
            }
            const trimmed = full.trim();
            if (!trimmed) {
              send({
                error: "El modelo no devolvió contenido. Reintenta.",
              });
            } else {
              send({ done: true });
            }
          } catch (e) {
            logger.error("postAgentToolFlowsMarkdown stream failed", {
              message: e instanceof Error ? e.message : String(e),
            });
            send({
              error:
                e instanceof Error
                  ? e.message
                  : "Error al generar el manual de herramientas.",
            });
          } finally {
            controller.close();
          }
        },
      });
      return new Response(readable, {
        status: 200,
        headers: {
          "Content-Type": "text/event-stream; charset=utf-8",
          "Cache-Control": "no-cache, no-transform",
          Connection: "keep-alive",
          "X-Accel-Buffering": "no",
        },
      });
    }

    const res = await ai.models.generateContent({
      model: MODEL,
      contents: userMessage,
      config: genConfig as never,
    });

    const markdown = extractTextFromModelResponse(res);
    if (!markdown.trim()) {
      return c.json(
        { error: "El modelo no devolvió contenido. Reintenta." },
        502,
      );
    }

    return c.json({ markdown: markdown.trim() });
  } catch (err) {
    logger.error("postAgentToolFlowsMarkdown failed", {
      message: err instanceof Error ? err.message : String(err),
    });
    return c.json(
      { error: "Error al generar el manual de herramientas." },
      500,
    );
  }
}
