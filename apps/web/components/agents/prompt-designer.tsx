"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  fetchAgentById,
  postAgentSystemPromptRegenerate,
} from "@/services/agents-api";
import { toast } from "sonner";
import type { Agent } from "@/lib/agents/agent";
import {
  useAgentProperties,
  useTestingProperties,
  usePromptDesignerPreferences,
  usePromptDesignerDialogs,
  usePromptDesignerChatAttachments,
  usePromptDesignerEditorState,
  usePromptDesignerSync,
} from "@/hooks";
import { useProductionPrompt } from "@/hooks";
import { usePromptChat, usePromptModels } from "@/hooks";
import { PromptDesignerAlerts } from "./prompt-designer/prompt-designer-alerts";
import { PromptDesignerTransferDialogs } from "./prompt-designer/prompt-designer-transfer-dialogs";
import { PromptDesignerEditors } from "./prompt-designer/prompt-designer-editors";
import { PromptDesignerToolbar } from "./prompt-designer/prompt-designer-toolbar";
import { PromptDesignerChatSidebar } from "./prompt-designer/prompt-designer-chat-sidebar";
import { normalizeConfirmInput } from "./prompt-designer/helpers";
import { PromptDesignerLoadingSkeleton } from "./prompt-designer/prompt-designer-loading-skeleton";

function isSystemPromptGenerationInProgress(
  status: string | undefined,
): boolean {
  return status === "pending" || status === "generating";
}

export function AgentPromptDesigner({
  agentId,
  agentName,
}: {
  agentId: string;
  agentName?: string;
}) {
  const [hasMounted, setHasMounted] = useState(false);
  const [agent, setAgent] = useState<Agent | null>(null);
  const [loadingAgent, setLoadingAgent] = useState(true);
  const {
    data: propertiesData,
    isLoading: propertiesLoading,
    error: propertiesError,
  } = useAgentProperties(agentId);
  const {
    data: testingPropertiesData,
    isLoading: testingPropertiesLoading,
    error: testingPropertiesError,
    didAutoSync: testingDidAutoSync,
    refetch: refetchTestingProperties,
  } = useTestingProperties(agentId);
  const {
    data: productionPrompt,
    isLoading: loadingProductionPrompt,
    error: productionPromptError,
    refetch: refetchProductionPrompt,
  } = useProductionPrompt(agentId);

  const hasTestingData = testingPropertiesData != null;
  const effectiveProperties = hasTestingData
    ? testingPropertiesData
    : propertiesData;

  useEffect(() => {
    setHasMounted(true);
  }, []);

  useEffect(() => {
    if (propertiesError) toast.error(propertiesError);
  }, [propertiesError]);

  useEffect(() => {
    if (testingPropertiesError) toast.error(testingPropertiesError);
  }, [testingPropertiesError]);

  useEffect(() => {
    if (testingDidAutoSync) {
      toast.success("Datos sincronizados desde producción");
    }
  }, [testingDidAutoSync]);

  useEffect(() => {
    if (productionPromptError) toast.error(productionPromptError);
  }, [productionPromptError]);

  const [chatInput, setChatInput] = useState("");
  const [chatWidth, setChatWidth] = useState(340);
  const [regenerateSystemPromptLoading, setRegenerateSystemPromptLoading] =
    useState(false);

  const { models: promptModels, isLoading: modelsLoading } = usePromptModels();
  const { promptModel, setPromptModel, promptMode, setPromptMode } =
    usePromptDesignerPreferences({
      promptModels,
      modelsLoading,
    });
  const {
    pendingImages,
    setPendingImages,
    pendingPdf,
    setPendingPdf,
    isDraggingOverChat,
    chatFileInputRef,
    addFilesFromFileList,
    handleChatDragOver,
    handleChatDrop,
    handleChatDragEnter,
    handleChatDragLeave,
  } = usePromptDesignerChatAttachments();
  const {
    isPushDialogOpen,
    setIsPushDialogOpen,
    isPullDialogOpen,
    setIsPullDialogOpen,
    pushConfirmText,
    setPushConfirmText,
    pullConfirmText,
    setPullConfirmText,
    isPromoteDialogOpen,
    setIsPromoteDialogOpen,
    promoteIncludeAuth,
    setPromoteIncludeAuth,
    promoteIncludeUnauth,
    setPromoteIncludeUnauth,
  } = usePromptDesignerDialogs();
  const isAuthEnabled = propertiesData?.agent?.isAuthEnable === true;

  const {
    messages,
    isLoading: chatLoading,
    suggestedPrompt,
    suggestedPrompts,
    suggestedTarget,
    sendMessage,
    clearSuggestion,
    reset,
  } = usePromptChat({
    agentName: agentName ?? agent?.name,
    getCurrentPrompt: () => editingPrompt,
    model: promptModel,
    mode: promptMode,
    agentId,
    isAuthEnabled,
    getCurrentPromptUnauth: isAuthEnabled
      ? () => editingUnauthPrompt
      : undefined,
    getCurrentPromptAuth: isAuthEnabled ? () => editingAuthPrompt : undefined,
  });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoadingAgent(true);
      const a = await fetchAgentById(agentId);
      if (!cancelled) {
        setAgent(a);
        setLoadingAgent(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [agentId]);

  const systemPromptGenStatus = agent?.systemPromptGenerationStatus;
  const systemPromptGenInProgress = isSystemPromptGenerationInProgress(
    systemPromptGenStatus,
  );
  const systemPromptGenFailed = systemPromptGenStatus === "failed";

  const inProduction = agent?.inProduction ?? false;
  const inCommercial = agent?.inCommercial ?? false;
  const hasPromptInMcp = Boolean(agent?.prompt);
  const needsSync = inProduction && !inCommercial && !hasPromptInMcp;

  const promptAndChatLocked =
    propertiesLoading || systemPromptGenInProgress || needsSync;

  useEffect(() => {
    if (!agentId || !systemPromptGenInProgress) return;
    const interval = window.setInterval(() => {
      void (async () => {
        const next = await fetchAgentById(agentId);
        if (next) setAgent(next);
      })();
    }, 4000);
    return () => clearInterval(interval);
  }, [agentId, systemPromptGenInProgress]);

  const handleRegenerateSystemPrompt = async () => {
    setRegenerateSystemPromptLoading(true);
    try {
      const r = await postAgentSystemPromptRegenerate(agentId);
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      toast.success("Generación del system prompt reiniciada.");
      const a = await fetchAgentById(agentId);
      if (a) setAgent(a);
    } finally {
      setRegenerateSystemPromptLoading(false);
    }
  };

  const {
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
    setDiffViewRequested,
    rejectedSuggestionHunkIds,
    setRejectedSuggestionHunkIds,
    hasChanges,
    hasLocalChanges,
    editorViewMode,
    canSave,
    canTransfer,
    applySuggestion,
    resetLocal,
  } = usePromptDesignerEditorState({
    agent,
    propertiesData,
    testingPropertiesData,
    effectiveProperties,
    isAuthEnabled,
    propertiesLoading,
    testingPropertiesLoading,
    resetChat: reset,
    loadingProductionPrompt,
    productionPrompt,
  });

  const {
    isSaving,
    promoting,
    pullingProductionBase,
    handleSave,
    executePullProductionBaseToTesting,
    executePromote,
  } = usePromptDesignerSync({
    agentId,
    agent,
    testingPropertiesData,
    productionPrompt,
    propertiesLoading,
    testingPropertiesLoading,
    loadingProductionPrompt,
    effectiveProperties,
    isAuthEnabled,
    refetchTestingProperties,
    refetchProductionPrompt,
    savedPrompt,
    savedAuthPrompt,
    savedUnauthPrompt,
    editingPrompt,
    editingAuthPrompt,
    editingUnauthPrompt,
    setSavedPrompt,
    setSavedAuthPrompt,
    setSavedUnauthPrompt,
    setEditingPrompt,
    setDiffViewRequested,
    setBaseMarkdownRemount,
  });

  const handlePromoteToProduction = useCallback(async () => {
    if (!canTransfer) return;

    let authDiffers = false;
    let unauthDiffers = false;
    if (isAuthEnabled && productionPrompt?.auth) {
      authDiffers =
        savedAuthPrompt.trim() !== (productionPrompt.auth.auth ?? "").trim();
      unauthDiffers =
        savedUnauthPrompt.trim() !==
        (productionPrompt.auth.unauth ?? "").trim();
    }

    if (authDiffers || unauthDiffers) {
      setPromoteIncludeAuth(authDiffers);
      setPromoteIncludeUnauth(unauthDiffers);
      setIsPromoteDialogOpen(true);
      return;
    }

    await executePromote({
      includeAuth: false,
      includeUnauth: false,
      onClose: () => {
        setIsPromoteDialogOpen(false);
        setIsPushDialogOpen(false);
        setPushConfirmText("");
      },
    });
  }, [
    canTransfer,
    isAuthEnabled,
    productionPrompt?.auth,
    savedAuthPrompt,
    savedUnauthPrompt,
    setPromoteIncludeAuth,
    setPromoteIncludeUnauth,
    setIsPromoteDialogOpen,
    executePromote,
    setIsPushDialogOpen,
    setPushConfirmText,
  ]);

  const primaryTarget = suggestedTarget?.[0] ?? "base";
  const hasMulti =
    suggestedPrompts != null &&
    (suggestedPrompts.base != null ||
      suggestedPrompts.unauth != null ||
      suggestedPrompts.auth != null);
  const showSuggestion =
    hasMulti ||
    (suggestedPrompt != null &&
      suggestedPrompt !==
        (primaryTarget === "auth"
          ? editingAuthPrompt
          : primaryTarget === "unauth"
            ? editingUnauthPrompt
            : editingPrompt));

  const suggestedForBase =
    suggestedPrompts?.base ??
    ((suggestedTarget ?? ["base"]).includes("base")
      ? (suggestedPrompt ?? undefined)
      : undefined);

  const suggestedForUnauth =
    suggestedPrompts?.unauth ??
    ((suggestedTarget ?? []).includes("unauth")
      ? (suggestedPrompt ?? undefined)
      : undefined);

  const suggestedForAuth =
    suggestedPrompts?.auth ??
    ((suggestedTarget ?? []).includes("auth")
      ? (suggestedPrompt ?? undefined)
      : undefined);

  const showMarkdownEditorBase = useMemo(
    () =>
      !(
        showSuggestion &&
        suggestedForBase != null &&
        primaryTarget === "base"
      ) && !(hasChanges && editorViewMode === "diff"),
    [
      showSuggestion,
      suggestedForBase,
      primaryTarget,
      hasChanges,
      editorViewMode,
    ],
  );

  const showMarkdownEditorUnauth = useMemo(
    () =>
      !(showSuggestion && suggestedForUnauth != null) &&
      !(hasChanges && editorViewMode === "diff"),
    [showSuggestion, suggestedForUnauth, hasChanges, editorViewMode],
  );

  const showMarkdownEditorAuth = useMemo(
    () =>
      !(showSuggestion && suggestedForAuth != null) &&
      !(hasChanges && editorViewMode === "diff"),
    [showSuggestion, suggestedForAuth, hasChanges, editorViewMode],
  );

  const handleApplySuggestion = () => {
    applySuggestion({
      hasMulti,
      suggestedPrompts,
      suggestedPrompt,
      suggestedTarget,
      primaryTarget,
      clearSuggestion,
    });
  };

  const handleSendChat = async () => {
    const content = chatInput.trim();
    if (!content) return;
    const imagesToSend = pendingImages.length > 0 ? pendingImages : undefined;
    const pdfToSend =
      pendingPdf != null
        ? { mimeType: pendingPdf.mimeType, data: pendingPdf.data }
        : undefined;
    setChatInput("");
    setPendingImages([]);
    setPendingPdf(null);
    await sendMessage(content, imagesToSend, pdfToSend ?? null);
  };

  const effectiveRejected: Set<number> =
    showSuggestion && !hasMulti ? rejectedSuggestionHunkIds : new Set<number>();

  const showInitialSkeleton =
    !hasMounted ||
    loadingAgent ||
    propertiesLoading ||
    testingPropertiesLoading ||
    loadingProductionPrompt;

  if (showInitialSkeleton) {
    return <PromptDesignerLoadingSkeleton />;
  }

  return (
    <div className="flex min-h-0 w-full flex-1 flex-col overflow-hidden">
      <PromptDesignerAlerts
        systemPromptGenInProgress={systemPromptGenInProgress}
        systemPromptGenFailed={systemPromptGenFailed}
        generationError={agent?.systemPromptGenerationError ?? undefined}
        regenerateSystemPromptLoading={regenerateSystemPromptLoading}
        onRegenerate={() => void handleRegenerateSystemPrompt()}
      />
      <div className="flex min-h-0 flex-1 overflow-hidden rounded-lg border">
        <PromptDesignerTransferDialogs
          isPromoteDialogOpen={isPromoteDialogOpen}
          setIsPromoteDialogOpen={setIsPromoteDialogOpen}
          promoteIncludeAuth={promoteIncludeAuth}
          setPromoteIncludeAuth={setPromoteIncludeAuth}
          promoteIncludeUnauth={promoteIncludeUnauth}
          setPromoteIncludeUnauth={setPromoteIncludeUnauth}
          promoting={promoting}
          executePromote={({ includeAuth, includeUnauth }) =>
            void executePromote({
              includeAuth,
              includeUnauth,
              onClose: () => {
                setIsPromoteDialogOpen(false);
                setIsPushDialogOpen(false);
                setPushConfirmText("");
              },
            })
          }
          isPushDialogOpen={isPushDialogOpen}
          setIsPushDialogOpen={setIsPushDialogOpen}
          pushConfirmText={pushConfirmText}
          setPushConfirmText={setPushConfirmText}
          onPromoteConfirm={() => void handlePromoteToProduction()}
          productionPromptText={productionPrompt?.prompt ?? ""}
          savedPrompt={savedPrompt}
          isPullDialogOpen={isPullDialogOpen}
          setIsPullDialogOpen={setIsPullDialogOpen}
          pullConfirmText={pullConfirmText}
          setPullConfirmText={setPullConfirmText}
          pullingProductionBase={pullingProductionBase}
          onPullConfirm={() =>
            void executePullProductionBaseToTesting(
              canTransfer,
              promptAndChatLocked,
              () => {
                setIsPullDialogOpen(false);
                setPullConfirmText("");
              },
            )
          }
          normalizeConfirmInput={normalizeConfirmInput}
        />
        <div className="flex-1 min-w-0 flex flex-col min-h-0">
          <PromptDesignerEditors
            isAuthEnabled={isAuthEnabled}
            promptAndChatLocked={promptAndChatLocked}
            showSuggestion={showSuggestion}
            suggestedForBase={suggestedForBase}
            primaryTarget={primaryTarget}
            editingPrompt={editingPrompt}
            effectiveRejected={effectiveRejected}
            onRejectSuggestionHunk={(hunkId) =>
              setRejectedSuggestionHunkIds((prev) => {
                const next = new Set<number>(prev);
                next.add(hunkId);
                return next;
              })
            }
            onAcceptSuggestionHunk={(hunkId) =>
              setRejectedSuggestionHunkIds((prev) => {
                const next = new Set<number>(prev);
                next.delete(hunkId);
                return next;
              })
            }
            hasChanges={hasChanges}
            editorViewMode={editorViewMode}
            savedPrompt={savedPrompt}
            setEditingPrompt={setEditingPrompt}
            rawViewBasePrompt={rawViewBasePrompt}
            setRawViewBasePrompt={setRawViewBasePrompt}
            baseMarkdownRemount={baseMarkdownRemount}
            setBaseMarkdownRemount={setBaseMarkdownRemount}
            showMarkdownEditorBase={showMarkdownEditorBase}
            suggestedForUnauth={suggestedForUnauth}
            editingUnauthPrompt={editingUnauthPrompt}
            savedUnauthPrompt={savedUnauthPrompt}
            setEditingUnauthPrompt={setEditingUnauthPrompt}
            rawViewUnauthPrompt={rawViewUnauthPrompt}
            setRawViewUnauthPrompt={setRawViewUnauthPrompt}
            unauthMarkdownRemount={unauthMarkdownRemount}
            setUnauthMarkdownRemount={setUnauthMarkdownRemount}
            showMarkdownEditorUnauth={showMarkdownEditorUnauth}
            suggestedForAuth={suggestedForAuth}
            editingAuthPrompt={editingAuthPrompt}
            savedAuthPrompt={savedAuthPrompt}
            setEditingAuthPrompt={setEditingAuthPrompt}
            rawViewAuthPrompt={rawViewAuthPrompt}
            setRawViewAuthPrompt={setRawViewAuthPrompt}
            authMarkdownRemount={authMarkdownRemount}
            setAuthMarkdownRemount={setAuthMarkdownRemount}
            showMarkdownEditorAuth={showMarkdownEditorAuth}
          />
          <PromptDesignerToolbar
            canTransfer={canTransfer}
            canSave={canSave}
            hasChanges={hasChanges}
            hasLocalChanges={hasLocalChanges}
            showSuggestion={showSuggestion}
            editorViewMode={editorViewMode}
            loadingProductionPrompt={loadingProductionPrompt}
            promptAndChatLocked={promptAndChatLocked}
            pullingProductionBase={pullingProductionBase}
            promoting={promoting}
            isSaving={isSaving}
            onOpenPullDialog={() => setIsPullDialogOpen(true)}
            onToggleDiff={() => setDiffViewRequested((v) => !v)}
            onDiscardSuggestion={clearSuggestion}
            onApplySuggestion={handleApplySuggestion}
            onUndo={() => resetLocal({ clearSuggestion })}
            onSave={() => void handleSave()}
            onOpenPushDialog={() => setIsPushDialogOpen(true)}
          />
        </div>
        <PromptDesignerChatSidebar
          messages={messages}
          chatLoading={chatLoading}
          promptAndChatLocked={promptAndChatLocked}
          editingPrompt={editingPrompt}
          chatInput={chatInput}
          setChatInput={setChatInput}
          pendingImages={pendingImages}
          setPendingImages={setPendingImages}
          pendingPdf={pendingPdf}
          setPendingPdf={setPendingPdf}
          isDraggingOverChat={isDraggingOverChat}
          handleChatDragOver={handleChatDragOver}
          handleChatDrop={handleChatDrop}
          handleChatDragEnter={handleChatDragEnter}
          handleChatDragLeave={handleChatDragLeave}
          chatWidth={chatWidth}
          setChatWidth={setChatWidth}
          promptModel={promptModel}
          setPromptModel={setPromptModel}
          promptMode={promptMode}
          setPromptMode={setPromptMode}
          reset={reset}
          sendMessage={sendMessage}
          handleSendChat={handleSendChat}
          addFilesFromFileList={addFilesFromFileList}
          chatFileInputRef={chatFileInputRef}
        />
      </div>
    </div>
  );
}
