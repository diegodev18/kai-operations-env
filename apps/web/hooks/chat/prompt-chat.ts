import { useState, useCallback, useRef } from "react";
import type {
  ChatMessage,
  ChatMessageImage,
  ChatMessagePdf,
  PromptTarget,
  SuggestedPrompts,
  UsePromptChatParams,
} from "@/types/prompt-chat";
import {
  CHAT_STATUS_LOADING_MESSAGES,
  isChatStatusMessage,
  parseSuggestedPrompts,
  parseSuggestedTarget,
  pickRandom,
} from "@/utils/prompt-chat-helpers";

export type {
  ChatMessage,
  ChatMessageImage,
  ChatMessagePdf,
  PromptModelId,
  PromptModelInfo,
  PromptMode,
  PromptTarget,
  SuggestedPrompts,
} from "@/types/prompt-chat";

export { isChatStatusMessage };

export const usePromptChat = ({
  agentName,
  getCurrentPrompt,
  model = "gemini-3-flash",
  mode = "agent",
  includeToolsContext = false,
  agentId,
  initialMessages,
  isAuthEnabled = false,
  getCurrentPromptUnauth,
  getCurrentPromptAuth,
}: UsePromptChatParams) => {
  const [messages, setMessages] = useState<ChatMessage[]>(
    () => initialMessages ?? [],
  );
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [suggestedPrompt, setSuggestedPrompt] = useState<string | null>(null);
  const [suggestedPrompts, setSuggestedPrompts] =
    useState<SuggestedPrompts | null>(null);
  const [suggestedTarget, setSuggestedTarget] = useState<PromptTarget[]>([
    "base",
  ]);
  const streamingPromptRef = useRef("");

  const sendMessage = async (
    content: string,
    images?: ChatMessageImage[],
    pdf?: ChatMessagePdf | null,
  ) => {
    if (!content.trim()) {
      return;
    }

    const userMessage: ChatMessage = {
      role: "user",
      content,
      ...(images?.length ? { images } : {}),
    };

    const nextMessages = [...messages, userMessage];
    const basePrompt = suggestedPrompt ?? getCurrentPrompt();

    setMessages([
      ...nextMessages,
      { role: "model", content: pickRandom(CHAT_STATUS_LOADING_MESSAGES) },
    ]);
    setError(null);
    setSuggestedPrompt(null);
    setSuggestedPrompts(null);
    setSuggestedTarget(["base"]);
    streamingPromptRef.current = "";
    setIsLoading(true);

    const body: Record<string, unknown> = {
      messages: nextMessages,
      currentPrompt: basePrompt,
      agentName,
      model,
      mode,
      includeToolsContext: includeToolsContext === true,
      agentId: agentId ?? null,
    };
    if (pdf?.mimeType === "application/pdf" && pdf.data) {
      body.lastMessagePdf = { mimeType: pdf.mimeType, data: pdf.data };
    }
    if (isAuthEnabled) {
      body.isAuthEnabled = true;
      body.currentPromptUnauth = getCurrentPromptUnauth?.() ?? "";
      body.currentPromptAuth = getCurrentPromptAuth?.() ?? "";
    }

    try {
      const response = await fetch("/api/prompt/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        let errorMessage =
          "No se pudo completar la solicitud. Intentalo de nuevo.";
        try {
          const data = (await response.json()) as { error?: string };
          if (data.error) {
            errorMessage = data.error;
          }
        } catch {
          // ignore
        }
        setError(errorMessage);
        setMessages((prev) => {
          const next = [...prev];
          next[next.length - 1] = {
            role: "model",
            content: `⚠️ ${errorMessage}`,
          };
          return next;
        });
        setIsLoading(false);
        return;
      }

      const reader = response.body?.getReader();
      if (!reader) {
        const connectionError =
          "Error al conectar con el servidor. Intentalo de nuevo.";
        setError(connectionError);
        setMessages((prev) => {
          const next = [...prev];
          next[next.length - 1] = {
            role: "model",
            content: `⚠️ ${connectionError}`,
          };
          return next;
        });
        setIsLoading(false);
        return;
      }

      const decoder = new TextDecoder();
      let buffer = "";
      let streamedContent = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const data = JSON.parse(line) as
              | { t: "chunk"; text: string }
              | { t: "prompt_chunk"; prompt: string }
              | {
                  t: "done";
                  prompt?: string;
                  target?: unknown;
                  prompts?: SuggestedPrompts;
                }
              | { t: "error"; err: string };
            if (data.t === "chunk") {
              streamedContent += data.text;
              const promptPart = streamingPromptRef.current
                ? `\n\n${streamingPromptRef.current}`
                : "";
              setMessages((prev) => {
                const next = [...prev];
                next[next.length - 1] = {
                  role: "model",
                  content: streamedContent + promptPart,
                };
                return next;
              });
            } else if (data.t === "prompt_chunk" && data.prompt !== undefined) {
              streamingPromptRef.current = data.prompt;
              const promptPart = `\n\n${data.prompt}`;
              setMessages((prev) => {
                const next = [...prev];
                next[next.length - 1] = {
                  role: "model",
                  content: streamedContent + promptPart,
                };
                return next;
              });
            } else if (data.t === "done") {
              const multi = parseSuggestedPrompts(data.prompts);
              if (multi && Object.keys(multi).length > 0) {
                setSuggestedPrompts(multi);
                setSuggestedTarget(
                  (["base", "unauth", "auth"] as const).filter((k) => k in multi),
                );
                setSuggestedPrompt(null);
              } else {
                const promptValue =
                  data.prompt !== undefined && String(data.prompt).trim() !== ""
                    ? data.prompt
                    : null;
                setSuggestedPrompt(promptValue);
                setSuggestedTarget(parseSuggestedTarget(data.target));
                setSuggestedPrompts(null);
              }
              streamingPromptRef.current = "";
              setMessages((prev) => {
                const next = [...prev];
                const summaryOnly = streamedContent.trim();
                next[next.length - 1] = {
                  role: "model",
                  content: summaryOnly,
                };
                return next;
              });
            } else if (data.t === "error") {
              const streamError =
                data.err ?? "Error inesperado durante la generacion.";
              setError(streamError);
              setMessages((prev) => {
                const next = [...prev];
                next[next.length - 1] = {
                  role: "model",
                  content: `⚠️ ${streamError}`,
                };
                return next;
              });
            }
          } catch {
            // ignore parse errors for partial lines
          }
        }
      }
    } finally {
      setIsLoading(false);
    }
  };

  const clearSuggestion = useCallback(() => {
    setSuggestedPrompt(null);
    setSuggestedPrompts(null);
    setSuggestedTarget(["base"]);
  }, []);

  const reset = useCallback(() => {
    setMessages([]);
    setError(null);
    setSuggestedPrompt(null);
    setSuggestedPrompts(null);
    setSuggestedTarget(["base"]);
  }, []);

  return {
    messages,
    isLoading,
    error,
    suggestedPrompt,
    suggestedPrompts,
    suggestedTarget,
    sendMessage,
    clearSuggestion,
    reset,
  };
};
