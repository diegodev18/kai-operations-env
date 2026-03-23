/** Tipos del asistente de diseño de prompt (streaming /api/prompt/chat). */

export type PromptModelId = "gemini-3-flash" | "gemini-3.1-pro";

export type PromptModelInfo = {
  id: string;
  name: string;
  provider: "gemini";
  available: boolean;
};

export type PromptMode = "questions" | "agent";

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

export type UsePromptChatParams = {
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
