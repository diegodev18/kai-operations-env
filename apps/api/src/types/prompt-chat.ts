export type PromptChatProvider = "gemini";

export interface PromptModelConfig {
  apiModelId: string;
  name: string;
  provider: PromptChatProvider;
}

export interface PromptChatMessage {
  content: string;
  images?: PromptChatMessageImage[];
  role: "model" | "user";
}

export interface PromptChatMessageImage {
  data: string;
  mimeType: string;
}

export const PROMPT_CHAT_PDF_MIME_TYPE = "application/pdf" as const;

export interface PromptChatMessagePdf {
  data: string;
  mimeType: typeof PROMPT_CHAT_PDF_MIME_TYPE;
}
