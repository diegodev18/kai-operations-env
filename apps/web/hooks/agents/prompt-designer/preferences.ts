import { useEffect, useMemo, useState } from "react";
import type { PromptModelId, PromptMode } from "@/hooks";

const PROMPT_STORAGE_KEY = "operations-prompt-designer";

export function usePromptDesignerPreferences({
  promptModels,
  modelsLoading,
}: {
  promptModels: Array<{ id: string; available: boolean }>;
  modelsLoading: boolean;
}) {
  const [promptModel, setPromptModel] = useState<PromptModelId>(() => {
    try {
      const raw = localStorage.getItem(PROMPT_STORAGE_KEY);
      if (!raw) return "gemini-3-flash";
      const p = JSON.parse(raw) as { model?: string };
      return p.model === "gemini-3.1-pro" ? "gemini-3.1-pro" : "gemini-3-flash";
    } catch {
      return "gemini-3-flash";
    }
  });
  const [promptMode, setPromptMode] = useState<PromptMode>(() => {
    try {
      const raw = localStorage.getItem(PROMPT_STORAGE_KEY);
      if (!raw) return "agent";
      const p = JSON.parse(raw) as { mode?: string };
      return p.mode === "questions" ? "questions" : "agent";
    } catch {
      return "agent";
    }
  });

  const availableModels = useMemo(() => promptModels.filter((m) => m.available), [promptModels]);
  const firstAvailable = availableModels[0]?.id;

  useEffect(() => {
    try {
      localStorage.setItem(
        PROMPT_STORAGE_KEY,
        JSON.stringify({
          model: promptModel,
          mode: promptMode,
        }),
      );
    } catch {
      // Ignore persistence failures.
    }
  }, [promptModel, promptMode]);

  useEffect(() => {
    if (modelsLoading || promptModels.length === 0) return;
    const current = promptModels.find((m) => m.id === promptModel);
    if (!current?.available && firstAvailable) {
      queueMicrotask(() => setPromptModel(firstAvailable as PromptModelId));
    }
  }, [modelsLoading, promptModels, promptModel, firstAvailable]);

  return {
    promptModel,
    setPromptModel,
    promptMode,
    setPromptMode,
  };
}
