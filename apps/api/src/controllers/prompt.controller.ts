import type { Context } from "hono";

import { GoogleGenAI } from "@google/genai";
import { existsSync } from "fs";
import { dirname, join } from "path";

import { getAgentToolsContext } from "@/lib/agent-tools";
import { auth } from "@/lib/auth";
import logger, { formatError } from "@/lib/logger";
import {
  PROMPT_CHAT_PDF_MIME_TYPE,
  type PromptChatMessage as ChatMessage,
  type PromptChatMessageImage as ChatMessageImage,
  type PromptChatMessagePdf as ChatMessagePdf,
  type PromptChatProvider as Provider,
} from "@/types/prompt-chat";

const {
  FIREBASE_SERVICE_ACCOUNT_JSON,
  FIREBASE_SERVICE_ACCOUNT_JSON_PRODUCTION,
  GOOGLE_APPLICATION_CREDENTIALS,
  VERTEX_AI_LOCATION,
  VERTEX_AI_PROJECT,
} = process.env;

/** Ruta al JSON de la cuenta de servicio (Firebase). */
const defaultCredsPath =
  typeof import.meta.dir !== "undefined"
    ? join(import.meta.dir, "..", "tokens", "firestore.json")
    : join(process.cwd(), "src", "tokens", "firestore.json");

/** Ruta a firebase.production.json (mismo directorio que firestore.json). */
const productionCredsPath = defaultCredsPath
  ? join(dirname(defaultCredsPath), "firebase.production.json")
  : null;

/**
 * Devuelve la ruta de credenciales para Vertex AI.
 * Requisito del proyecto: usar firebase.production.json.
 */
function getVertexCredsPath(): null | string {
  if (productionCredsPath && existsSync(productionCredsPath)) {
    return productionCredsPath;
  }
  return null;
}

const genAI = (() => {
  if (VERTEX_AI_PROJECT && VERTEX_AI_LOCATION) {
    const credsPath = getVertexCredsPath();
    if (credsPath) {
      process.env.GOOGLE_APPLICATION_CREDENTIALS = credsPath;
      return new GoogleGenAI({
        location: VERTEX_AI_LOCATION,
        project: VERTEX_AI_PROJECT,
        vertexai: true,
      });
    }
    logger.error("Vertex AI credentials file not found", {
      expectedPath: productionCredsPath,
      fallbackPath: defaultCredsPath,
      GOOGLE_APPLICATION_CREDENTIALS,
      hasEnvJson:
        !!(FIREBASE_SERVICE_ACCOUNT_JSON_PRODUCTION ?? FIREBASE_SERVICE_ACCOUNT_JSON),
    });
  }
  return null;
})();

/** Operaciones: solo Gemini vía @google/genai (API key o Vertex AI). */
export const PROMPT_MODELS = {
  "gemini-3-flash": {
    apiModelId: "gemini-2.5-flash",
    name: "Gemini 2.5 Flash",
    provider: "gemini",
  },
  "gemini-3-flash-preview": {
    apiModelId: "gemini-2.5-flash",
    name: "Gemini 2.5 Flash",
    provider: "gemini",
  },
  "gemini-3.1-pro": {
    apiModelId: "gemini-2.5-pro",
    name: "Gemini 2.5 Pro",
    provider: "gemini",
  },
  "gemini-3.1-flash-lite-preview": {
    apiModelId: "gemini-2.5-flash",
    name: "Gemini 2.5 Flash Lite",
    provider: "gemini",
  },
} as const;

export type PromptModelId = keyof typeof PROMPT_MODELS;

const ALLOWED_IMAGE_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
] as const;
const MAX_IMAGES_PER_MESSAGE = 4;
const MAX_IMAGE_BYTES = 3 * 1024 * 1024; // 3 MB

const MAX_PDF_BYTES = 20 * 1024 * 1024; // 20 MB

export function getAvailableModels(): {
  available: boolean;
  id: string;
  name: string;
  provider: Provider;
}[] {
  return Object.entries(PROMPT_MODELS).map(([id, config]) => ({
    available: !!getProviderApiKey(config.provider),
    id,
    name: config.name,
    provider: config.provider,
  }));
}

function getProviderApiKey(provider: Provider): string | undefined {
  if (provider === "gemini") {
    return VERTEX_AI_PROJECT && VERTEX_AI_LOCATION && getVertexCredsPath()
      ? "vertex"
      : undefined;
  }
  return undefined;
}

function validateAttachedImages(
  images: unknown,
): { error?: string; valid: ChatMessageImage[] } {
  if (images == null || !Array.isArray(images)) {
    return { valid: [] };
  }
  if (images.length > MAX_IMAGES_PER_MESSAGE) {
    return {
      error: `Máximo ${MAX_IMAGES_PER_MESSAGE} imágenes por mensaje.`,
      valid: [],
    };
  }
  const valid: ChatMessageImage[] = [];
  for (let i = 0; i < images.length; i++) {
    const item = images[i];
    if (
      item == null ||
      typeof item !== "object" ||
      typeof (item as ChatMessageImage).mimeType !== "string" ||
      typeof (item as ChatMessageImage).data !== "string"
    ) {
      return { error: "Cada imagen debe tener mimeType y data (base64).", valid: [] };
    }
    const mimeType = (item as ChatMessageImage).mimeType;
    const data = (item as ChatMessageImage).data;
    if (!ALLOWED_IMAGE_MIME_TYPES.includes(mimeType as (typeof ALLOWED_IMAGE_MIME_TYPES)[number])) {
      return {
        error: `Tipo de imagen no permitido. Usa: ${ALLOWED_IMAGE_MIME_TYPES.join(", ")}.`,
        valid: [],
      };
    }
    let decodedLength: number;
    try {
      decodedLength = Buffer.byteLength(Buffer.from(data, "base64"));
    } catch {
      return { error: "Imagen con data base64 inválida.", valid: [] };
    }
    if (decodedLength > MAX_IMAGE_BYTES) {
      return {
        error: `Cada imagen debe pesar como máximo ${Math.round(MAX_IMAGE_BYTES / 1024 / 1024)} MB.`,
        valid: [],
      };
    }
    valid.push({ data, mimeType });
  }
  return { valid };
}

function validateAttachedPdf(
  raw: unknown,
): { error?: string; valid: ChatMessagePdf | null } {
  if (raw == null || typeof raw !== "object") {
    return { valid: null };
  }
  const item = raw as ChatMessagePdf;
  if (
    item.mimeType !== PROMPT_CHAT_PDF_MIME_TYPE ||
    typeof item.data !== "string" ||
    !item.data
  ) {
    return { error: "El PDF debe tener mimeType application/pdf y data en base64.", valid: null };
  }
  let decodedLength: number;
  try {
    decodedLength = Buffer.byteLength(Buffer.from(item.data, "base64"));
  } catch {
    return { error: "PDF con data base64 inválida.", valid: null };
  }
  if (decodedLength > MAX_PDF_BYTES) {
    return {
      error: `El PDF debe pesar como máximo ${Math.round(MAX_PDF_BYTES / 1024 / 1024)} MB.`,
      valid: null,
    };
  }
  return { valid: { data: item.data, mimeType: PROMPT_CHAT_PDF_MIME_TYPE } };
}

const PROMPT_SEPARATOR = "\n\nPROMPT:\n";
const ANSWER_PREFIX = "ANSWER:\n";
const ANSWER_PREFIX_REGEX = /^ANSWER:\s*/i;
/** Quita el prefijo SUMMARY: (con espacio o salto de línea) para no mostrarlo en el chat */
const SUMMARY_PREFIX_REGEX = /^SUMMARY:\s*/i;

const VALID_TARGETS = ["base", "auth", "unauth"] as const;
/** Parsea bloques PROMPT BASE:, PROMPT UNAUTH:, PROMPT AUTH: en fullText (case-insensitive). Si hay al menos uno, devuelve { base?, unauth?, auth? }. */
function parseMultiBlockPrompts(
  fullText: string,
): null | { auth?: string; base?: string; unauth?: string; } {
  const lower = fullText.toLowerCase();
  const markers = [
    { key: "base" as const, tag: "prompt base:" },
    { key: "unauth" as const, tag: "prompt unauth:" },
    { key: "auth" as const, tag: "prompt auth:" },
  ];
  const indices = markers
    .map((m) => ({ key: m.key, start: lower.indexOf(m.tag) }))
    .filter((x) => x.start >= 0);
  if (indices.length === 0) return null;
  indices.sort((a, b) => a.start - b.start);

  const result: { auth?: string; base?: string; unauth?: string; } = {};
  for (let i = 0; i < indices.length; i++) {
    const tagLen = markers.find((m) => m.key === indices[i].key)!.tag.length;
    const start = indices[i].start + tagLen;
    const end =
      i + 1 < indices.length ? indices[i + 1].start : fullText.length;
    const content = fullText.slice(start, end).trim();
    if (content) result[indices[i].key] = content;
  }
  return Object.keys(result).length > 0 ? result : null;
}

/** Parsea TARGET: base, auth, unauth de fullText. Devuelve ["base"] si no hay TARGET válido. */
function parseTargetFromResponse(fullText: string): string[] {
  const match = /TARGET:\s*([^\n]+)/i.exec(fullText);
  if (!match) return ["base"];
  const part = match[1].trim().toLowerCase();
  const tokens = part.split(/\s*,\s*/).map((s) => s.trim());
  const valid = tokens.filter((t): t is (typeof VALID_TARGETS)[number] =>
    VALID_TARGETS.includes(t as (typeof VALID_TARGETS)[number]),
  );
  return valid.length > 0 ? valid : ["base"];
}

function streamErrorMessage(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  if (msg.includes("402") || /insufficient\s*balance/i.test(msg)) {
    return "Saldo o cuota insuficiente en Google Cloud / Gemini. Revisa facturación o cuotas de Vertex AI.";
  }
  return "Stream failed";
}

const SYSTEM_QUESTION_ONLY = `You are an expert assistant that analyzes AI agent prompts. You describe what the prompt says — you NEVER speak as the agent.

CRITICAL: Never say "As [agent name]...", "I am...", "I use...", or speak in first person as the agent. Always describe in third person: "The prompt indicates...", "The agent's instructions say...", "According to the prompt...".

LANGUAGE: Detect the language of the user's message and respond in that same language (e.g. Spanish if they write in Spanish, English if in English). Do not default to English.

Answer questions about the prompt using it as context.

TOOLS: If the user message contains a section "--- AGENT TOOLS CONTEXT ---", that section lists the tools actually configured for this agent (name, description, parameters). When the user asks what tools the agent has, which tools it uses, "qué tools tiene", "según el contexto de tools", or similar, you MUST answer using that section: list the tools from AGENT TOOLS CONTEXT with their names and, if relevant, their parameters. Do not limit the answer to what is only written in the prompt text when the tools context is present.

**Format:** Output exactly: ${ANSWER_PREFIX}
Then your answer. Never output PROMPT or edit the prompt. Questions only.`;

const SYSTEM_AGENT_EDIT = `You are an expert assistant for editing AI agent prompts. You are NOT the agent itself. You NEVER roleplay or speak as the agent. You only edit or describe the prompt document.

LANGUAGE: Detect the language of the user's message and respond in that same language (e.g. Spanish if they write in Spanish, English if in English). Do not default to English.

CRITICAL: Never say "As [agent name]...", "I am...", "I use...", or speak in first person as the agent. Always describe in third person: "The prompt indicates...", "The agent's instructions say...".

You support TWO types of requests:

## 1. QUESTIONS about the prompt

When the user asks about the prompt (e.g. "¿Usa emojis?", "What's the communication style?") — describe what the prompt says. Use third person. Detect the user's language and respond in that same language (e.g. Spanish → Spanish, English → English).

If the user asks what tools the agent has, "qué tools tiene", "según el contexto de tools", or similar, and the message includes a section "--- AGENT TOOLS CONTEXT ---", answer using that section: list the tools from AGENT TOOLS CONTEXT (name, description, parameters). Do not limit the answer to what is only written in the prompt text when the tools context is present.

**Format:** Output exactly: ${ANSWER_PREFIX}
Then your answer. No PROMPT section.

## 2. MODIFICATION requests

When the user asks to CHANGE the prompt (e.g. "add emojis", "quita las oraciones prohibidas", "make it more concise") — you MUST edit the actual prompt text and output the full modified prompt.

**When the user attaches image(s) or a PDF:** Use them as essential context. For example, if they send a screenshot of a conversation (e.g. WhatsApp chat) and feedback like "no debe repetir el mismo mensaje", "haz el flujo más natural", or "que no sea tan repetitivo", you MUST:
- Look at the image to identify which part of the prompt is involved (e.g. which workflow, Core Objective, or data-capture flow — such as "event registration", "captura de datos para evento", formularios paso a paso).
- Apply the requested change ONLY to that specific section or flow (e.g. add instructions for varying wording, avoiding repeated phrases like "Para continuar con tu registro... ¿podrías proporcionarme...?" for each field, or making each step sound more natural and distinct).
- Do NOT suggest generic edits to the whole prompt. The edit must target the flow or section visible or implied in the image and the user's message.

**Critical rules:**
- You are editing a document. The prompt is the agent's instructions. You modify that document directly.
- NEVER respond as the agent (e.g. "As Ventanito I cannot edit..."). You are the editor, not the agent.
- Apply the requested change to the prompt text. Output the COMPLETE updated prompt after PROMPT:.
- Change ONLY what was requested. Copy unchanged parts character-for-character.
- Detect the user's language and write the summary in that language.

**Format:** Output SUMMARY: on its own line, then 2–4 bullet points of what you changed. Then output exactly: ${PROMPT_SEPARATOR}
Then the FULL updated prompt (the complete prompt with your edits applied).

## Examples

Question "¿Usa emojis?" → ANSWER: El prompt indica que el agente mantiene un estilo formal y no utiliza emojis. (Describe in third person, never "As X, I don't use emojis".)
Question "¿Qué herramientas usa?" → ANSWER: then your answer. No PROMPT section.
Edit "Quita las oraciones prohibidas" → SUMMARY: Eliminé las reglas 18-19 sobre frases prohibidas. Then PROMPT: then the ENTIRE prompt with those rules removed.

No JSON, no markdown. Always output the real edited prompt for modification requests.`;

export const promptChat = async (c: Context) => {
  const session = await auth.api.getSession({
    headers: c.req.raw.headers,
  });

  if (!session?.user) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  let body: unknown;

  try {
    body = await c.req.json();
  } catch (error) {
    logger.warn("Invalid JSON body in prompt chat", { error: formatError(error) });
    return c.json({ error: "Invalid JSON body" }, 400);
  }

  const messages =
    body != null &&
    Array.isArray((body as { messages?: unknown }).messages) &&
    (body as { messages?: unknown }).messages
      ? (body as { messages: ChatMessage[] }).messages
      : [];

  const currentPrompt =
    body != null &&
    typeof (body as { currentPrompt?: unknown }).currentPrompt === "string"
      ? (body as { currentPrompt: string }).currentPrompt
      : "";

  const isAuthEnabled =
    body != null &&
    typeof (body as { isAuthEnabled?: unknown }).isAuthEnabled === "boolean"
      ? (body as { isAuthEnabled: boolean }).isAuthEnabled
      : false;

  const currentPromptUnauth =
    body != null &&
    typeof (body as { currentPromptUnauth?: unknown }).currentPromptUnauth === "string"
      ? (body as { currentPromptUnauth: string }).currentPromptUnauth
      : "";

  const currentPromptAuth =
    body != null &&
    typeof (body as { currentPromptAuth?: unknown }).currentPromptAuth === "string"
      ? (body as { currentPromptAuth: string }).currentPromptAuth
      : "";

  const agentName =
    body != null &&
    typeof (body as { agentName?: unknown }).agentName === "string"
      ? (body as { agentName: string }).agentName
      : "";

  const modelId =
    body != null &&
    typeof (body as { model?: unknown }).model === "string" &&
    (body as { model: string }).model in PROMPT_MODELS
      ? (body as { model: keyof typeof PROMPT_MODELS }).model
      : "gemini-3-flash";

  const mode =
    body != null &&
    typeof (body as { mode?: unknown }).mode === "string" &&
    ((body as { mode: string }).mode === "questions" ||
      (body as { mode: string }).mode === "agent")
      ? (body as { mode: "agent" | "questions" }).mode
      : "agent";

  const includeToolsContext =
    body != null &&
    typeof (body as { includeToolsContext?: unknown }).includeToolsContext ===
      "boolean"
      ? (body as { includeToolsContext: boolean }).includeToolsContext
      : false;

  const agentId =
    body != null &&
    typeof (body as { agentId?: unknown }).agentId === "string" &&
    (body as { agentId: string }).agentId.trim() !== ""
      ? (body as { agentId: string }).agentId.trim()
      : null;

  const lastUserMessage =
    messages.length > 0
      ? messages[messages.length - 1]
      : { content: "", role: "user" };

  if (lastUserMessage.role !== "user" || !lastUserMessage.content) {
    return c.json({ error: "At least one user message is required" }, 400);
  }

  const imagesValidation = validateAttachedImages(
    (lastUserMessage as ChatMessage).images,
  );
  if (imagesValidation.error) {
    return c.json({ error: imagesValidation.error }, 400);
  }
  const attachedImages = imagesValidation.valid;

  const pdfRaw =
    body != null &&
    typeof body === "object" &&
    (body as { lastMessagePdf?: unknown }).lastMessagePdf != null
      ? (body as { lastMessagePdf: unknown }).lastMessagePdf
      : null;
  const pdfValidation = validateAttachedPdf(pdfRaw);
  if (pdfValidation.error) {
    return c.json({ error: pdfValidation.error }, 400);
  }
  const attachedPdf = pdfValidation.valid;

  const modelConfig = PROMPT_MODELS[modelId];
  const apiKey = getProviderApiKey(modelConfig.provider);

  if (!apiKey) {
    logger.warn("Gemini/Vertex not configured", { modelId });
    return c.json(
      {
        error: `El modelo ${modelConfig.name} no está disponible. Configura GEMINI_API_KEY o VERTEX_AI_PROJECT + VERTEX_AI_LOCATION (y credenciales) en el servidor.`,
      },
      500,
    );
  }

  const historyExcludingLast = messages.slice(0, -1);
  const historyBlock =
    historyExcludingLast.length > 0
      ? [
          "",
          "--- CONVERSATION SO FAR ---",
          ...historyExcludingLast.flatMap((m) => [
            `${m.role === "user" ? "User" : "Assistant"}: ${m.content}`,
          ]),
          "--- END CONVERSATION ---",
          "",
        ].join("\n")
      : "";

  let toolsContextBlock = "";
  if (includeToolsContext && agentId) {
    const ctx = await getAgentToolsContext(agentId);
    if (ctx) {
      toolsContextBlock = [
        "",
        "--- AGENT TOOLS CONTEXT ---",
        ctx,
        "--- END AGENT TOOLS CONTEXT ---",
        "",
        "When adding or editing tool usage or examples in the prompt, use ONLY the parameter names listed above for each tool. Do not invent parameter names (e.g. do not use product_name or user_contact_info unless they appear in that tool's Parameters list).",
        "",
      ].join("\n");
    }
  }

  const systemInstruction =
    mode === "questions" ? SYSTEM_QUESTION_ONLY : SYSTEM_AGENT_EDIT;

  const promptBlocks: string[] = [];
  if (isAuthEnabled) {
    promptBlocks.push(
      "--- CURRENT PROMPT (base) START ---",
      currentPrompt || "(empty)",
      "--- CURRENT PROMPT (base) END ---",
      "",
      "--- UNAUTH START ---",
      currentPromptUnauth || "(empty)",
      "--- UNAUTH END ---",
      "",
      "--- AUTH START ---",
      currentPromptAuth || "(empty)",
      "--- AUTH END ---",
    );
  } else {
    promptBlocks.push(
      "--- CURRENT PROMPT START ---",
      currentPrompt || "(empty)",
      "--- CURRENT PROMPT END ---",
    );
  }

  const targetInstruction =
    isAuthEnabled && mode === "agent"
      ? [
          "",
          "For MODIFICATION requests you MUST output on its own line: TARGET: followed by one or more of: base, auth, unauth (comma-separated). Use 'base' for the main prompt, 'unauth' for unauthenticated users, 'auth' for authenticated users. Put TARGET: before SUMMARY or before the prompt block(s).",
          "",
          "When you are modifying MORE THAN ONE of base, auth, and unauth, you MUST output separate blocks with the full content for each target. Use exactly: PROMPT BASE: (then newline and the full base prompt), PROMPT UNAUTH: (then newline and the full unauth prompt), PROMPT AUTH: (then newline and the full auth prompt). Include only the blocks for the targets you are modifying. Each block must contain the COMPLETE prompt for that editor. Do NOT use a single PROMPT: for all targets when editing multiple — each target gets its own block and its own content. When modifying only one target, you may use TARGET: X and a single PROMPT: as before.",
        ].join("\n")
      : "";

  const languageInstruction =
    mode === "agent"
      ? [
          "",
          "Write the content inside PROMPT: in the SAME LANGUAGE as the current prompt you are editing. If the current prompt (base, auth, or unauth) is in English, output the new prompt text in English; if it is in Spanish, output it in Spanish. Match the language of the existing prompt, not the user's message. SUMMARY and other commentary may follow the user's language.",
        ].join("\n")
      : "";

  const pdfNote =
    attachedPdf != null
      ? [
          "",
          "The user has attached a PDF document (inlined above or below); use it as context for their request.",
          "",
        ].join("\n")
      : "";

  const userContent = [
    `Agent name: ${agentName || "(unnamed)"}.`,
    "",
    ...promptBlocks,
    "",
    toolsContextBlock,
    historyBlock,
    pdfNote,
    `User request: ${lastUserMessage.content}`,
    "",
    mode === "questions"
      ? "Respond in the same language as the user's message. Use ANSWER: only. Describe the prompt in third person — never speak as the agent."
      : "Respond in the same language as the user's message. If it is a question, use ANSWER: (describe in third person, never as the agent). If it is an edit request, use SUMMARY: and PROMPT:.",
    targetInstruction,
    languageInstruction,
  ].join("\n");

  const encoder = new TextEncoder();

  try {
    if (!genAI) {
      logger.error("Vertex AI not configured", {
        hint: "Set VERTEX_AI_PROJECT + VERTEX_AI_LOCATION and ensure src/tokens/firebase.production.json exists",
      });
      return c.json({ error: "LLM is not configured on the server" }, 500);
    }

    const parts: ({ inlineData: { data: string; mimeType: string; } } | { text: string })[] = [];
      for (const img of attachedImages) {
        parts.push({ inlineData: { data: img.data, mimeType: img.mimeType } });
      }
      if (attachedPdf) {
        parts.push({
          inlineData: { data: attachedPdf.data, mimeType: attachedPdf.mimeType },
        });
      }
      parts.push({ text: userContent });

      const contents = [
        {
          parts,
          role: "user" as const,
        },
      ];

      const stream = await genAI.models.generateContentStream({
        config: { systemInstruction, temperature: 0.2 },
        contents,
        model: modelConfig.apiModelId,
      });

      const readable = new ReadableStream({
        async start(controller) {
          try {
            let fullText = "";
            let chatSentUpTo = 0;

            for await (const chunk of stream) {
              const text = chunk.text ?? "";
              fullText += text;

              if (chatSentUpTo < fullText.length) {
                const answerMatch = ANSWER_PREFIX_REGEX.exec(fullText);
                const answerStart = answerMatch ? answerMatch[0].length : 0;
                const isAnswer =
                  answerStart > 0 && !fullText.includes(PROMPT_SEPARATOR);
                const sepIdx = fullText.indexOf(PROMPT_SEPARATOR);

                if (isAnswer) {
                  const startFrom = Math.max(chatSentUpTo, answerStart);
                  const toSend = fullText.slice(startFrom);
                  if (toSend.length > 0) {
                    controller.enqueue(
                      encoder.encode(
                        JSON.stringify({ t: "chunk", text: toSend }) + "\n",
                      ),
                    );
                  }
                  chatSentUpTo = fullText.length;
                } else if (sepIdx === -1) {
                  let toSend = fullText.slice(chatSentUpTo);
                  if (chatSentUpTo === 0) {
                    const am = ANSWER_PREFIX_REGEX.exec(toSend);
                    if (am) toSend = toSend.slice(am[0].length);
                    else
                      toSend = toSend
                        .replace(SUMMARY_PREFIX_REGEX, "")
                        .trimStart();
                  }
                  if (toSend.length > 0) {
                    controller.enqueue(
                      encoder.encode(
                        JSON.stringify({ t: "chunk", text: toSend }) + "\n",
                      ),
                    );
                    chatSentUpTo = fullText.length;
                  }
                } else {
                  let toSend = fullText.slice(chatSentUpTo, sepIdx);
                  if (chatSentUpTo === 0) {
                    toSend = toSend
                      .replace(SUMMARY_PREFIX_REGEX, "")
                      .trimStart();
                  }
                  if (toSend.length > 0) {
                    controller.enqueue(
                      encoder.encode(
                        JSON.stringify({ t: "chunk", text: toSend }) + "\n",
                      ),
                    );
                  }
                  chatSentUpTo = fullText.length;
                }
              }

              const sepIdxForChunk = fullText.indexOf(PROMPT_SEPARATOR);
              if (sepIdxForChunk >= 0) {
                const promptSoFar = fullText.slice(
                  sepIdxForChunk + PROMPT_SEPARATOR.length,
                );
                if (promptSoFar.length > 0) {
                  controller.enqueue(
                    encoder.encode(
                      JSON.stringify({
                        prompt: promptSoFar,
                        t: "prompt_chunk",
                      }) + "\n",
                    ),
                  );
                }
              }
            }

            const multiPrompts = parseMultiBlockPrompts(fullText);
            if (multiPrompts && Object.keys(multiPrompts).length > 0) {
              controller.enqueue(
                encoder.encode(
                  JSON.stringify({ prompts: multiPrompts, t: "done" }) + "\n",
                ),
              );
            } else {
              const sepIdx = fullText.indexOf(PROMPT_SEPARATOR);
              const prompt =
                sepIdx >= 0
                  ? fullText.slice(sepIdx + PROMPT_SEPARATOR.length).trim()
                  : "";
              const target = parseTargetFromResponse(fullText);
              controller.enqueue(
                encoder.encode(
                  JSON.stringify({ prompt, t: "done", target }) + "\n",
                ),
              );
            }
          } catch (err) {
            logger.error("Prompt stream error (Gemini)", {
              error: formatError(err),
              modelId,
            });
            controller.enqueue(
              encoder.encode(
                JSON.stringify({ err: streamErrorMessage(err), t: "error" }) +
                  "\n",
              ),
            );
          } finally {
            controller.close();
          }
        },
      });

    return new Response(readable, {
      headers: {
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
        "Content-Type": "application/x-ndjson",
      },
    });
  } catch (error) {
    const err = error as Error & { status?: number; statusCode?: number };
    logger.error("Prompt chat failed", {
      error: formatError(err),
      message: err.message,
      status: err.status ?? err.statusCode,
    });

    const message = err.message || "";
    const is429 =
      err.status === 429 ||
      err.statusCode === 429 ||
      message.includes("429") ||
      message.includes("RESOURCE_EXHAUSTED") ||
      message.includes("quota");

    if (is429) {
      return c.json(
        {
          error:
            "Se ha superado el límite de solicitudes del servicio. Por favor, espera unos minutos e inténtalo de nuevo.",
        },
        429,
      );
    }

    return c.json(
      { error: "No se pudo generar la sugerencia. Inténtalo de nuevo." },
      500,
    );
  }
};
