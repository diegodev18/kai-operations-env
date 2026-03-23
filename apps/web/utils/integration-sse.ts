import type { SSEEvent, SSEMessage } from "@/types/integration-simulator";

/** Parsea un stream SSE (event:/data:) del servicio de simulación. */
export async function parseSSEStream(
  body: ReadableStream<Uint8Array>,
  onEvent: (ev: SSEEvent) => void,
): Promise<void> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let currentEvent = "";
  let currentData = "";

  const flush = () => {
    if (currentEvent && currentData) {
      try {
        const data = JSON.parse(currentData) as unknown;
        if (
          currentEvent === "start" &&
          typeof data === "object" &&
          data !== null &&
          "personalityCount" in data
        ) {
          onEvent({
            type: "start",
            message:
              "message" in data
                ? String((data as { message?: string }).message)
                : "Simulación iniciada",
            personalityCount: (() => {
              const n = Number(
                (data as { personalityCount?: number }).personalityCount,
              );
              return Number.isFinite(n) ? n : 0;
            })(),
          });
        } else if (
          currentEvent === "message" &&
          typeof data === "object" &&
          data !== null
        ) {
          onEvent({ type: "message", data: data as SSEMessage });
        } else if (
          currentEvent === "personality" &&
          typeof data === "object" &&
          data !== null
        ) {
          const d = data as {
            personality?: string;
            conversacion?: unknown[];
            analisis?: unknown;
          };
          onEvent({
            type: "personality",
            personality: d.personality ?? "",
            conversacion: d.conversacion ?? [],
            analisis: d.analisis,
          });
        } else if (
          currentEvent === "done" &&
          typeof data === "object" &&
          data !== null
        ) {
          const d = data as {
            chat?: unknown;
            results?: unknown;
            conversationAnalysis?: unknown;
          };
          onEvent({
            type: "done",
            chat: d.chat,
            results: d.results,
            conversationAnalysis: d.conversationAnalysis,
          });
        }
      } catch {
        /* ignore */
      }
      currentEvent = "";
      currentData = "";
    }
  };

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      if (line.startsWith("event:")) {
        flush();
        currentEvent = line.slice(6).trim();
      } else if (line.startsWith("data:")) {
        currentData = line.slice(5).trim();
      } else if (line === "") {
        flush();
      }
    }
  }
  flush();
}
