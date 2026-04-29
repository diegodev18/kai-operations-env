import type { Context } from "hono";

import { GoogleGenAI } from "@google/genai";
import { existsSync } from "fs";
import { dirname, join } from "path";

import {
  GET_AGENT_TOOLS_DECLARATION,
  SYSTEM_AGENT_EDIT,
  SYSTEM_QUESTION_ONLY,
} from "@/constants/prompt-chat";
import { fetchAgentToolsForPromptChat } from "@/lib/agent-tools";
import { auth } from "@/lib/auth";
import logger, { formatError } from "@/lib/logger";
import {
  PROMPT_CHAT_PDF_MIME_TYPE,
  type PromptChatMessage as ChatMessage,
  type PromptChatMessageImage as ChatMessageImage,
  type PromptChatMessagePdf as ChatMessagePdf,
  type PromptChatProvider as Provider,
} from "@/types/prompt-chat";
import {
  extractFunctionCall,
  processPromptStream,
  streamErrorMessage,
} from "@/utils/prompt-stream";

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
    if (
      !ALLOWED_IMAGE_MIME_TYPES.includes(
        mimeType as (typeof ALLOWED_IMAGE_MIME_TYPES)[number],
      )
    ) {
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
    return {
      error: "El PDF debe tener mimeType application/pdf y data en base64.",
      valid: null,
    };
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
    typeof (body as { currentPromptUnauth?: unknown }).currentPromptUnauth ===
      "string"
      ? (body as { currentPromptUnauth: string }).currentPromptUnauth
      : "";

  const currentPromptAuth =
    body != null &&
    typeof (body as { currentPromptAuth?: unknown }).currentPromptAuth ===
      "string"
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

    const parts: (
      | { inlineData: { data: string; mimeType: string } }
      | { text: string }
    )[] = [];
    for (const img of attachedImages) {
      parts.push({ inlineData: { data: img.data, mimeType: img.mimeType } });
    }
    if (attachedPdf) {
      parts.push({
        inlineData: { data: attachedPdf.data, mimeType: attachedPdf.mimeType },
      });
    }
    parts.push({ text: userContent });

    const contents = [{ parts, role: "user" as const }];

    const enableToolCalling = mode === "agent" && !!agentId;

    const readable = new ReadableStream({
      async start(controller) {
        try {
          if (enableToolCalling) {
            // Phase 1: stream with tool declarations to detect function calls fast.
            // Function calls appear in the first chunk; if we see text instead, break
            // and restart as a clean direct stream for proper streaming UX.
            let detectedFunctionCall: {
              args?: Record<string, unknown>;
              name?: string;
            } | null = null;

            try {
              const phase1Stream = await genAI.models.generateContentStream({
                config: {
                  systemInstruction,
                  temperature: 0.2,
                  tools: [GET_AGENT_TOOLS_DECLARATION],
                } as never,
                contents,
                model: modelConfig.apiModelId,
              });

              for await (const chunk of phase1Stream) {
                const fc = extractFunctionCall(chunk);
                if (fc?.name === "get_agent_tools") {
                  detectedFunctionCall = fc;
                  break;
                }
                // Text arrived before any function call — no tool needed, stop here.
                // We'll restart as a direct stream below for proper streaming UX.
                if ((chunk as { text?: string }).text) break;
              }
            } catch (phase1Err) {
              logger.warn(
                "Phase 1 tool detection failed, falling back to direct stream",
                { error: formatError(phase1Err) },
              );
            }

            if (detectedFunctionCall?.name === "get_agent_tools") {
              controller.enqueue(
                encoder.encode(
                  JSON.stringify({ name: "get_agent_tools", t: "tool_call" }) +
                    "\n",
                ),
              );
              const tools = await fetchAgentToolsForPromptChat(agentId);
              controller.enqueue(
                encoder.encode(
                  JSON.stringify({
                    name: "get_agent_tools",
                    t: "tool_result",
                    tools: tools ?? [],
                  }) + "\n",
                ),
              );
              const phase2Stream = await genAI.models.generateContentStream({
                config: { systemInstruction, temperature: 0.2 },
                contents: [
                  ...contents,
                  {
                    parts: [
                      { functionCall: { args: {}, name: "get_agent_tools" } },
                    ],
                    role: "model" as const,
                  },
                  {
                    parts: [
                      {
                        functionResponse: {
                          name: "get_agent_tools",
                          response: { tools: tools ?? [] },
                        },
                      },
                    ],
                    role: "user" as const,
                  },
                ],
                model: modelConfig.apiModelId,
              });
              await processPromptStream(
                controller,
                encoder,
                phase2Stream,
                modelConfig.apiModelId,
              );
            } else {
              // No tool call — restart as a clean direct stream for real streaming UX.
              const directStream = await genAI.models.generateContentStream({
                config: { systemInstruction, temperature: 0.2 },
                contents,
                model: modelConfig.apiModelId,
              });
              await processPromptStream(
                controller,
                encoder,
                directStream,
                modelConfig.apiModelId,
              );
            }
          } else {
            const stream = await genAI.models.generateContentStream({
              config: { systemInstruction, temperature: 0.2 },
              contents,
              model: modelConfig.apiModelId,
            });
            await processPromptStream(
              controller,
              encoder,
              stream,
              modelConfig.apiModelId,
            );
          }
        } catch (err) {
          logger.error("Prompt chat ReadableStream error", {
            error: formatError(err),
          });
          try {
            controller.enqueue(
              encoder.encode(
                JSON.stringify({ err: streamErrorMessage(err), t: "error" }) +
                  "\n",
              ),
            );
          } catch {
            // controller may already be closed
          }
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
