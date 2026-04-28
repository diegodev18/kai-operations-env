import { useCallback, useEffect, useMemo, useState } from "react";
import {
  buildTextWithRevertedHunks,
  computeDiffLines,
} from "@/utils/prompt-diff";

function normalizePrompt(value: string | undefined): string {
  return typeof value === "string" ? value.trim() : "";
}

export function usePromptDesignerEditorState({
  agentId,
  agent,
  propertiesData,
  testingPropertiesData,
  effectiveProperties,
  isAuthEnabled,
  propertiesLoading,
  testingPropertiesLoading,
  resetChat,
  loadingProductionPrompt,
  productionPrompt,
}: {
  agentId: string;
  agent: { prompt?: string; inCommercial?: boolean } | null;
  propertiesData: any;
  testingPropertiesData: any;
  effectiveProperties: any;
  isAuthEnabled: boolean;
  propertiesLoading: boolean;
  testingPropertiesLoading: boolean;
  resetChat: () => void;
  loadingProductionPrompt: boolean;
  productionPrompt: any;
}) {
  const [savedPrompt, setSavedPrompt] = useState("");
  const [editingPrompt, setEditingPrompt] = useState("");
  const [savedAuthPrompt, setSavedAuthPrompt] = useState("");
  const [savedUnauthPrompt, setSavedUnauthPrompt] = useState("");
  const [editingAuthPrompt, setEditingAuthPrompt] = useState("");
  const [editingUnauthPrompt, setEditingUnauthPrompt] = useState("");
  const [rawViewBasePrompt, setRawViewBasePrompt] = useState(false);
  const [rawViewUnauthPrompt, setRawViewUnauthPrompt] = useState(false);
  const [rawViewAuthPrompt, setRawViewAuthPrompt] = useState(false);
  const [baseMarkdownRemount, setBaseMarkdownRemount] = useState(0);
  const [unauthMarkdownRemount, setUnauthMarkdownRemount] = useState(0);
  const [authMarkdownRemount, setAuthMarkdownRemount] = useState(0);
  const [diffViewRequested, setDiffViewRequested] = useState(false);
  const [rejectedSuggestionHunkIds, setRejectedSuggestionHunkIds] = useState<Set<number>>(
    new Set(),
  );

  useEffect(() => {
    if (!agent) return;
    if (propertiesLoading) return;
    if (agent.inCommercial && testingPropertiesLoading) return;

    let promptValue: string;
    if (testingPropertiesData != null) {
      const b = testingPropertiesData.prompt?.base;
      promptValue = typeof b === "string" ? b : "";
    } else if (propertiesData != null) {
      const b = propertiesData.prompt?.base;
      promptValue = typeof b === "string" ? b : "";
    } else {
      promptValue = typeof agent.prompt === "string" ? agent.prompt : "";
    }

    queueMicrotask(() => {
      setSavedPrompt(promptValue);
      setEditingPrompt(promptValue);
      resetChat();
    });
  }, [
    agent,
    testingPropertiesData,
    propertiesData,
    propertiesLoading,
    testingPropertiesLoading,
    resetChat,
  ]);

  useEffect(() => {
    if (!isAuthEnabled || !effectiveProperties?.prompt) return;
    const auth = effectiveProperties.prompt.auth?.auth ?? "";
    const unauth = effectiveProperties.prompt.auth?.unauth ?? "";
    queueMicrotask(() => {
      setSavedAuthPrompt(auth);
      setSavedUnauthPrompt(unauth);
      setEditingAuthPrompt(auth);
      setEditingUnauthPrompt(unauth);
    });
  }, [isAuthEnabled, effectiveProperties?.prompt]);

  const hasChanges =
    editingPrompt !== savedPrompt ||
    (isAuthEnabled &&
      (editingAuthPrompt !== savedAuthPrompt ||
        editingUnauthPrompt !== savedUnauthPrompt));
  const hasLocalChanges = hasChanges;
  const editorViewMode: "diff" | "edit" = hasChanges && diffViewRequested ? "diff" : "edit";

  const savedTestingDiffersFromProduction = useMemo(() => {
    if (!productionPrompt) return false;
    const baseDiffers =
      normalizePrompt(savedPrompt) !== normalizePrompt(productionPrompt.prompt);
    if (isAuthEnabled) {
      const authDiffers =
        normalizePrompt(savedAuthPrompt) !==
        normalizePrompt(productionPrompt.auth?.auth ?? "");
      const unauthDiffers =
        normalizePrompt(savedUnauthPrompt) !==
        normalizePrompt(productionPrompt.auth?.unauth ?? "");
      return baseDiffers || authDiffers || unauthDiffers;
    }
    return baseDiffers;
  }, [
    savedPrompt,
    savedAuthPrompt,
    savedUnauthPrompt,
    productionPrompt,
    isAuthEnabled,
  ]);

  const hasTestingProductionDiff = savedTestingDiffersFromProduction;
  const canSave = hasLocalChanges;
  const canTransfer = hasTestingProductionDiff;

  const applySuggestion = useCallback(
    ({
      hasMulti,
      suggestedPrompts,
      suggestedPrompt,
      suggestedTarget,
      primaryTarget,
      clearSuggestion,
    }: {
      hasMulti: boolean;
      suggestedPrompts: any;
      suggestedPrompt: string | null | undefined;
      suggestedTarget: Array<"base" | "auth" | "unauth"> | undefined;
      primaryTarget: "base" | "auth" | "unauth";
      clearSuggestion: () => void;
    }) => {
      if (hasMulti && suggestedPrompts) {
        if (suggestedPrompts.base != null) setEditingPrompt(suggestedPrompts.base);
        if (suggestedPrompts.unauth != null) setEditingUnauthPrompt(suggestedPrompts.unauth);
        if (suggestedPrompts.auth != null) setEditingAuthPrompt(suggestedPrompts.auth);
        clearSuggestion();
        setRejectedSuggestionHunkIds(new Set());
        return;
      }
      if (suggestedPrompt == null) return;
      const referenceText =
        primaryTarget === "auth"
          ? editingAuthPrompt
          : primaryTarget === "unauth"
            ? editingUnauthPrompt
            : editingPrompt;
      const suggestionDiffLines = computeDiffLines(referenceText, suggestedPrompt);
      const textToApply =
        suggestionDiffLines.length > 0
          ? buildTextWithRevertedHunks(suggestionDiffLines, rejectedSuggestionHunkIds)
          : suggestedPrompt;
      const targets = suggestedTarget?.length ? suggestedTarget : ["base"];
      for (const t of targets) {
        if (t === "base") setEditingPrompt(textToApply);
        else if (t === "auth") setEditingAuthPrompt(textToApply);
        else if (t === "unauth") setEditingUnauthPrompt(textToApply);
      }
      clearSuggestion();
      setRejectedSuggestionHunkIds(new Set());
    },
    [editingAuthPrompt, editingPrompt, editingUnauthPrompt, rejectedSuggestionHunkIds],
  );

  const resetLocal = useCallback(
    ({ clearSuggestion }: { clearSuggestion: () => void }) => {
      setEditingPrompt(savedPrompt);
      setEditingAuthPrompt(savedAuthPrompt);
      setEditingUnauthPrompt(savedUnauthPrompt);
      clearSuggestion();
      resetChat();
    },
    [savedPrompt, savedAuthPrompt, savedUnauthPrompt, resetChat],
  );

  return {
    savedPrompt,
    setSavedPrompt,
    editingPrompt,
    setEditingPrompt,
    savedAuthPrompt,
    setSavedAuthPrompt,
    savedUnauthPrompt,
    setSavedUnauthPrompt,
    editingAuthPrompt,
    setEditingAuthPrompt,
    editingUnauthPrompt,
    setEditingUnauthPrompt,
    rawViewBasePrompt,
    setRawViewBasePrompt,
    rawViewUnauthPrompt,
    setRawViewUnauthPrompt,
    rawViewAuthPrompt,
    setRawViewAuthPrompt,
    baseMarkdownRemount,
    setBaseMarkdownRemount,
    unauthMarkdownRemount,
    setUnauthMarkdownRemount,
    authMarkdownRemount,
    setAuthMarkdownRemount,
    diffViewRequested,
    setDiffViewRequested,
    rejectedSuggestionHunkIds,
    setRejectedSuggestionHunkIds,
    hasChanges,
    hasLocalChanges,
    editorViewMode,
    hasTestingProductionDiff,
    canSave,
    canTransfer,
    applySuggestion,
    resetLocal,
  };
}
