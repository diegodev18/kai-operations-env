import type { Context } from "hono";
import { GoogleGenAI } from "@google/genai";
import { existsSync } from "fs";
import { dirname, join } from "path";
import { z } from "zod";

import logger from "@/lib/logger";
import type { AgentsInfoAuthContext } from "@/types/agents";

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

const flowBodySchema = z.object({
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
});

const flowQuestionSchema = z.object({
  field: z
    .string()
    .min(2)
    .max(64)
    .regex(/^[a-z][a-z0-9_]*$/, "field must be snake_case"),
  label: z.string().min(8).max(220),
  type: z.enum(["text", "textarea", "select"]),
  placeholder: z.string().max(280).optional(),
  options: z.array(z.string().min(1).max(120)).max(16).optional(),
  /** Para text/textarea: respuestas ejemplo (chips en la UI). */
  suggestions: z.array(z.string().min(1).max(140)).max(10).optional(),
  /** Con suggestions: una o varias opciones a la vez. */
  suggestion_mode: z.enum(["single", "multi"]).optional(),
  required: z.boolean().optional().default(true),
});

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
      logger.error("Vertex AI credentials not found for flow-questions", {
        expectedPath: productionCredsPath,
        GOOGLE_APPLICATION_CREDENTIALS: process.env.GOOGLE_APPLICATION_CREDENTIALS,
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

function extractBalancedJsonArray(input: string): string | null {
  const text = input.trim();
  const start = text.indexOf("[");
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
    if (ch === "[") depth++;
    else if (ch === "]") {
      depth--;
      if (depth === 0) {
        return text.slice(start, i + 1);
      }
    }
  }
  return null;
}

function parseModelJsonArray(raw: string): unknown | null {
  const trimmed = raw.trim();
  const candidates = [
    trimmed,
    trimmed.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, ""),
    extractBalancedJsonArray(trimmed) ?? "",
  ]
    .map((x) => x.trim())
    .filter(Boolean);
  for (const candidate of candidates) {
    try {
      const v = JSON.parse(candidate);
      if (Array.isArray(v)) return v;
    } catch {
      /* next */
    }
  }
  return null;
}

export async function postAgentFlowQuestions(
  c: Context,
  _authCtx: AgentsInfoAuthContext,
) {
  let raw: unknown;
  try {
    raw = await c.req.json();
  } catch {
    return c.json({ error: "JSON inválido" }, 400);
  }

  const parsed = flowBodySchema.safeParse(raw);
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

  const profile = {
    business_name: body.business_name,
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
  };

  const systemInstruction = `You generate follow-up questions for a small-business owner in Latin American Spanish who is configuring a WhatsApp assistant (not a technical user).

Output STRICT JSON only: a single JSON array (no markdown, no prose). Each element must be an object with:
- "field": unique snake_case id, only lowercase letters, digits and underscores, starting with a letter (e.g. "toma_pedidos", "citas_whatsapp")
- "label": the question shown to the user, in clear everyday Spanish. Warm, short, concrete. NO technical jargon: avoid words like "integración", "API", "tool", "stack", "MCP", "endpoint" unless the user profile already uses them.
- "type": "text" | "textarea" | "select"
- "placeholder": optional short hint (plain language)
- "options": required only if type is "select" — array of short Spanish choices (2–8 options)
- "suggestions": optional — for type "text" or "textarea" only: 2–6 short example answers in Spanish the user can tap instead of typing (e.g. "Sí, por WhatsApp", "Solo en tienda")
- "suggestion_mode": optional — only with "suggestions": "single" (pick one example) or "multi" (combine several). Default if omitted: use "multi" for textarea and "single" for text.
- "required": optional boolean, default true

Rules:
1. Generate between 6 and 9 questions total.
2. Questions must be tailored to THIS business profile (industry, what they sell, audience, agent role, escalation rules, hours). Example: if they are a retail store, ask whether the assistant should help take orders on WhatsApp or only inform and redirect. If they are a clinic, ask about appointments and reminders. If restaurant, reservations and menu.
3. Cover these areas with natural wording (not as section titles): what the assistant should actually do in the chat (orders, quotes, appointments, payments info, handoff to human), how they sell or serve (in person, delivery, online, stock), and how they run day-to-day (calendar, spreadsheet, another app they already mention or typical for their sector).
4. One question per topic when possible; avoid repeating the same idea.
5. Prefer "select" when there are clear mutually exclusive options; use "textarea" when you need a sentence or two.
6. For at least 3 questions with type text or textarea, include "suggestions" and "suggestion_mode" so users can tap realistic answers.
7. Labels must sound like a human consultant, not a form from IT.

Return only the JSON array.`;

  const userContent = [
    "Perfil del negocio y del asistente (JSON). Genera las preguntas en español:",
    JSON.stringify(profile, null, 0),
  ].join("\n");

  try {
    const response = await ai.models.generateContent({
      model: MODEL,
      contents: userContent,
      config: {
        systemInstruction,
        temperature: 0.45,
      } as never,
    });

    const rawText = extractTextFromModelResponse(response);
    const arr = parseModelJsonArray(rawText);
    if (!Array.isArray(arr)) {
      logger.warn("flow-questions: could not parse JSON array", {
        preview: rawText.slice(0, 400),
      });
      return c.json(
        { error: "No se pudo interpretar las preguntas del modelo.", questions: [] },
        200,
      );
    }

    const questions: z.infer<typeof flowQuestionSchema>[] = [];
    const seen = new Set<string>();
    for (const item of arr) {
      const one = flowQuestionSchema.safeParse(item);
      if (!one.success) continue;
      if (seen.has(one.data.field)) continue;
      seen.add(one.data.field);
      if (one.data.type === "select" && !one.data.options?.length) continue;
      let row = one.data;
      if (row.type === "select") {
        row = { ...row, suggestions: undefined, suggestion_mode: undefined };
      }
      questions.push(row);
    }

    if (questions.length < 5) {
      return c.json(
        {
          error: "El modelo devolvió pocas preguntas válidas. Reintenta.",
          questions: [],
        },
        200,
      );
    }

    return c.json({ questions: questions.slice(0, 10) });
  } catch (err) {
    logger.error("postAgentFlowQuestions failed", {
      message: err instanceof Error ? err.message : String(err),
    });
    return c.json(
      { error: "Error al generar las preguntas de flujo.", questions: [] },
      500,
    );
  }
}
