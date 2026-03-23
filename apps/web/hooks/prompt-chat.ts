import { useState, useCallback, useEffect, useRef } from "react";

export type PromptModelId = "gemini-3-flash" | "gemini-3.1-pro";

export type PromptModelInfo = {
  id: string;
  name: string;
  provider: "gemini";
  available: boolean;
};

export function usePromptModels() {
  const [models, setModels] = useState<PromptModelInfo[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchModels = async () => {
      try {
        const res = await fetch("/api/prompt/models", {
          credentials: "include",
        });
        if (res.ok) {
          const data = (await res.json()) as { models: PromptModelInfo[] };
          setModels(data.models ?? []);
        }
      } finally {
        setIsLoading(false);
      }
    };
    fetchModels();
  }, []);

  return { models, isLoading };
}

export type PromptMode = "questions" | "agent";

const CHAT_STATUS_LOADING_MESSAGES = [
  "✨ Perfeccionando tu prompt...",
  "🔧 Puliendo las instrucciones...",
  "📝 Analizando el prompt...",
  "✨ Ajustando el texto...",
  "🛠️ Mejorando la redacción...",
];

function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

export function isChatStatusMessage(content: string): boolean {
  return CHAT_STATUS_LOADING_MESSAGES.includes(content);
}

export type ChatMessageImage = {
  mimeType: string;
  data: string;
};

export type ChatMessagePdf = {
  mimeType: "application/pdf";
  data: string;
};

export type ChatMessage = {
  role: "user" | "model";
  content: string;
  images?: ChatMessageImage[];
};

export type PromptTarget = "base" | "auth" | "unauth";

export type SuggestedPrompts = {
  base?: string;
  unauth?: string;
  auth?: string;
};

const VALID_TARGETS: PromptTarget[] = ["base", "auth", "unauth"];

function parseSuggestedTarget(raw: unknown): PromptTarget[] {
  if (!Array.isArray(raw) || raw.length === 0) return ["base"];
  const filtered = raw.filter(
    (t): t is PromptTarget =>
      typeof t === "string" && VALID_TARGETS.includes(t as PromptTarget),
  );
  return filtered.length > 0 ? filtered : ["base"];
}

function parseSuggestedPrompts(raw: unknown): SuggestedPrompts | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;
  const result: SuggestedPrompts = {};
  if (typeof o.base === "string" && o.base.trim()) result.base = o.base.trim();
  if (typeof o.unauth === "string" && o.unauth.trim())
    result.unauth = o.unauth.trim();
  if (typeof o.auth === "string" && o.auth.trim()) result.auth = o.auth.trim();
  return Object.keys(result).length > 0 ? result : null;
}

type UsePromptChatParams = {
  agentName?: string;
  getCurrentPrompt: () => string;
  model?: PromptModelId;
  mode?: PromptMode;
  includeToolsContext?: boolean;
  agentId?: string;
  initialMessages?: ChatMessage[];
  isAuthEnabled?: boolean;
  getCurrentPromptUnauth?: () => string;
  getCurrentPromptAuth?: () => string;
};

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
          "No se pudo completar la solicitud. Inténtalo de nuevo.";
        try {
          const data = (await response.json()) as { error?: string };
          if (data.error) {
            errorMessage = data.error;
          }
        } catch {
          /* ignore */
        }
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
        setMessages((prev) => {
          const next = [...prev];
          next[next.length - 1] = {
            role: "model",
            content:
              "⚠️ Error al conectar con el servidor. Inténtalo de nuevo.",
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
              setMessages((prev) => {
                const next = [...prev];
                next[next.length - 1] = {
                  role: "model",
                  content: `⚠️ ${data.err ?? "Error inesperado durante la generación."}`,
                };
                return next;
              });
            }
          } catch {
            /* ignore parse errors for partial lines */
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
    setSuggestedPrompt(null);
    setSuggestedPrompts(null);
    setSuggestedTarget(["base"]);
  }, []);

  return {
    messages,
    isLoading,
    suggestedPrompt,
    suggestedPrompts,
    suggestedTarget,
    sendMessage,
    clearSuggestion,
    reset,
  };
};
