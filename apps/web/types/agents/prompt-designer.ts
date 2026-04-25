import type { ChatMessagePdf, PromptMode, PromptModelId } from "@/hooks";

export type PromptDesignerPendingPdf = ChatMessagePdf & { name: string };

export type PromptDesignerDrafts = {
  base: string;
  auth: string;
  unauth: string;
};

export type PromptDesignerSavedDrafts = PromptDesignerDrafts;
export type PromptDesignerEditingDrafts = PromptDesignerDrafts;

export type PromptDesignerPreferences = {
  model: PromptModelId;
  mode: PromptMode;
};

export type PromptDesignerPromoteOptions = {
  includeAuth: boolean;
  includeUnauth: boolean;
};
