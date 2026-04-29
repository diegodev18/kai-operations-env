import {
  ANSWER_PREFIX_REGEX,
  PROMPT_SEPARATOR,
  SUMMARY_PREFIX_REGEX,
  VALID_TARGETS,
} from "@/constants/prompt-chat";
import logger, { formatError } from "@/lib/logger";

export function streamErrorMessage(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  if (msg.includes("402") || /insufficient\s*balance/i.test(msg)) {
    return "Saldo o cuota insuficiente en Google Cloud / Gemini. Revisa facturación o cuotas de Vertex AI.";
  }
  return "Stream failed";
}

export function parseMultiBlockPrompts(
  fullText: string,
): null | { auth?: string; base?: string; unauth?: string } {
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

  const result: { auth?: string; base?: string; unauth?: string } = {};
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

export function parseTargetFromResponse(fullText: string): string[] {
  const match = /TARGET:\s*([^\n]+)/i.exec(fullText);
  if (!match) return ["base"];
  const part = match[1].trim().toLowerCase();
  const tokens = part.split(/\s*,\s*/).map((s) => s.trim());
  const valid = tokens.filter((t): t is (typeof VALID_TARGETS)[number] =>
    VALID_TARGETS.includes(t as (typeof VALID_TARGETS)[number]),
  );
  return valid.length > 0 ? valid : ["base"];
}

export function extractFunctionCall(
  response: unknown,
): { args?: Record<string, unknown>; name?: string } | null {
  const r = response as {
    candidates?: Array<{
      content?: {
        parts?: Array<{
          functionCall?: { args?: Record<string, unknown>; name?: string };
        }>;
      };
    }>;
    functionCalls?: Array<{ args?: Record<string, unknown>; name?: string }>;
  };
  const fromTop = (r.functionCalls ?? [])[0];
  if (fromTop) return fromTop;
  const parts = r.candidates?.[0]?.content?.parts ?? [];
  return parts.map((p) => p.functionCall).find((x) => x != null) ?? null;
}

export async function processPromptStream(
  controller: ReadableStreamDefaultController,
  encoder: TextEncoder,
  chunks: AsyncIterable<unknown>,
  modelId: string,
): Promise<void> {
  try {
    let fullText = "";
    let chatSentUpTo = 0;

    for await (const chunk of chunks) {
      const text = (chunk as { text?: string }).text ?? "";
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
            else toSend = toSend.replace(SUMMARY_PREFIX_REGEX, "").trimStart();
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
            toSend = toSend.replace(SUMMARY_PREFIX_REGEX, "").trimStart();
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
              JSON.stringify({ prompt: promptSoFar, t: "prompt_chunk" }) + "\n",
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
        JSON.stringify({ err: streamErrorMessage(err), t: "error" }) + "\n",
      ),
    );
  }
}
