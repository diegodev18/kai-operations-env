"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  ArrowDownToLineIcon,
  ArrowUpIcon,
  CheckIcon,
  FileTextIcon,
  ImageIcon,
  ListChecksIcon,
  Loader2Icon,
  RotateCcwIcon,
  RocketIcon,
  ShieldCheckIcon,
  SparklesIcon,
  TerminalIcon,
  XIcon,
} from "lucide-react";
import {
  fetchAgentById,
  postAgentSystemPromptRegenerate,
} from "@/services/agents-api";
import { toast } from "sonner";
import type { Agent } from "@/lib/agents/agent";
import {
  useAgentProperties,
  updateAgentPropertyDocument,
} from "@/hooks";
import {
  useTestingProperties,
  updateTestingPropertyDocument,
} from "@/hooks";
import { useAgentTools } from "@/hooks";
import {
  useProductionPrompt,
  fetchProductionPromptSnapshot,
  promotePromptToProduction as promotePromptApi,
} from "@/hooks";
import {
  usePromptChat,
  usePromptModels,
  isChatStatusMessage,
  type ChatMessage,
  type ChatMessageImage,
  type ChatMessagePdf,
  type PromptModelId,
  type PromptMode,
} from "@/hooks";
import {
  PromptChatPanel,
  PromptDiffView,
  PromptMarkdownEditor,
  PromptMarkdownViewToggle,
  type PromptChatPanelProps,
} from "@/components/prompt";
import {
  buildTextWithRevertedHunks,
  computeDiffLines,
} from "@/utils/prompt-diff";

const PROMPT_STORAGE_KEY = "operations-prompt-designer";

const OPTIMIZE =
  "Optimiza este prompt: hazlo más claro, consistente y efectivo, sin cambiar su intención. Devuelve el prompt completo optimizado.";
const FIX_CONTRADICTIONS =
  "Revisa este prompt y corrige contradicciones, ambiguedades y conflictos entre instrucciones. Devuelve una version consolidada y coherente, manteniendo la intencion original.";
const MAX_CHAT_IMAGES = 4;
const MAX_IMAGE_BYTES = 3 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];
const PDF_MIME_TYPE = "application/pdf";
const MAX_PDF_BYTES = 20 * 1024 * 1024;

function isSystemPromptGenerationInProgress(status: string | undefined): boolean {
  return status === "pending" || status === "generating";
}

function isAllowedImageType(type: string): boolean {
  return ALLOWED_IMAGE_TYPES.includes(type);
}

function normalizePrompt(value: string | undefined): string {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeConfirmInput(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function fileToImageData(file: File): Promise<ChatMessageImage | null> {
  if (!isAllowedImageType(file.type) || file.size > MAX_IMAGE_BYTES) {
    return Promise.resolve(null);
  }
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      if (typeof result !== "string" || !result.startsWith("data:")) {
        resolve(null);
        return;
      }
      const base64 = result.split(",")[1];
      if (!base64) {
        resolve(null);
        return;
      }
      resolve({ mimeType: file.type, data: base64 });
    };
    reader.onerror = () => resolve(null);
    reader.readAsDataURL(file);
  });
}

type PendingPdf = ChatMessagePdf & { name: string };

function fileToPdfData(file: File): Promise<PendingPdf | null> {
  if (file.type !== PDF_MIME_TYPE || file.size > MAX_PDF_BYTES) {
    return Promise.resolve(null);
  }
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      if (typeof result !== "string" || !result.startsWith("data:")) {
        resolve(null);
        return;
      }
      const base64 = result.split(",")[1];
      if (!base64) {
        resolve(null);
        return;
      }
      resolve({
        mimeType: PDF_MIME_TYPE,
        data: base64,
        name: file.name || "documento.pdf",
      });
    };
    reader.onerror = () => resolve(null);
    reader.readAsDataURL(file);
  });
}

const chatMarkdownComponents: import("react-markdown").Components = {
  p: ({ children }) => (
    <p className="mb-1 last:mb-0 text-xs break-words">{children}</p>
  ),
  code: ({ className, children, ...props }) => {
    const isBlock = className != null;
    if (isBlock) {
      return (
        <code
          className="block bg-muted rounded p-2 overflow-x-auto text-xs break-words font-mono"
          {...props}
        >
          {children}
        </code>
      );
    }
    return (
      <code
        className="bg-muted px-1 rounded font-mono text-xs break-words"
        {...props}
      >
        {children}
      </code>
    );
  },
};

export function AgentPromptDesigner({
  agentId,
  agentName,
}: {
  agentId: string;
  agentName?: string;
}) {
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
  const { tools: agentTools, error: agentToolsError } = useAgentTools(agentId);
  const {
    data: productionPrompt,
    isLoading: loadingProductionPrompt,
    error: productionPromptError,
    refetch: refetchProductionPrompt,
  } = useProductionPrompt(agentId);

  const hasTestingData = testingPropertiesData != null;
  const effectiveProperties = hasTestingData ? testingPropertiesData : propertiesData;

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
    if (agentToolsError) toast.error(agentToolsError);
  }, [agentToolsError]);

  useEffect(() => {
    if (productionPromptError) toast.error(productionPromptError);
  }, [productionPromptError]);

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
  const [isSaving, setIsSaving] = useState(false);
  const [chatInput, setChatInput] = useState("");
  const [pendingImages, setPendingImages] = useState<ChatMessageImage[]>([]);
  const [pendingPdf, setPendingPdf] = useState<PendingPdf | null>(null);
  const [isDraggingOverChat, setIsDraggingOverChat] = useState(false);
  const chatFileInputRef = useRef<HTMLInputElement>(null);
  const [chatWidth, setChatWidth] = useState(340);
  const [diffViewRequested, setDiffViewRequested] = useState(false);
  const [rejectedSuggestionHunkIds, setRejectedSuggestionHunkIds] = useState<
    Set<number>
  >(new Set());
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
  const [includeToolsContext] = useState(false);
  const [regenerateSystemPromptLoading, setRegenerateSystemPromptLoading] =
    useState(false);
  const [promoting, setPromoting] = useState(false);
  const [pullingProductionBase, setPullingProductionBase] = useState(false);
  const [isPushDialogOpen, setIsPushDialogOpen] = useState(false);
  const [isPullDialogOpen, setIsPullDialogOpen] = useState(false);
  const [pushConfirmText, setPushConfirmText] = useState("");
  const [pullConfirmText, setPullConfirmText] = useState("");
  const bootstrapAttemptedRef = useRef(false);

  const { models: promptModels, isLoading: modelsLoading } = usePromptModels();
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
    includeToolsContext,
    agentId,
    isAuthEnabled,
    getCurrentPromptUnauth: isAuthEnabled
      ? () => editingUnauthPrompt
      : undefined,
    getCurrentPromptAuth: isAuthEnabled
      ? () => editingAuthPrompt
      : undefined,
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
  const systemPromptGenInProgress =
    isSystemPromptGenerationInProgress(systemPromptGenStatus);
  const systemPromptGenFailed = systemPromptGenStatus === "failed";
  
  const inProduction = agent?.inProduction ?? false;
  const inCommercial = agent?.inCommercial ?? false;
  const hasPromptInMcp = Boolean(agent?.prompt);
  const needsSync = inProduction && !inCommercial && !hasPromptInMcp;
  
  const promptAndChatLocked = propertiesLoading || systemPromptGenInProgress || needsSync;

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
      reset();
    });
  }, [
    agent,
    testingPropertiesData,
    propertiesData,
    propertiesLoading,
    testingPropertiesLoading,
    reset,
  ]);

  useEffect(() => {
    if (!agentId || !agent) return;
    if (propertiesLoading || testingPropertiesLoading || loadingProductionPrompt) return;
    if (bootstrapAttemptedRef.current) return;

    const mcpPrompt = normalizePrompt(agent.prompt);
    if (!mcpPrompt) return;

    const testingBase = normalizePrompt(testingPropertiesData?.prompt?.base);
    const productionBase = normalizePrompt(productionPrompt?.prompt);

    if (testingBase || productionBase) return;

    bootstrapAttemptedRef.current = true;
    void (async () => {
      const [savedProd, savedTesting] = await Promise.all([
        updateAgentPropertyDocument(agentId, "prompt", { base: mcpPrompt }),
        updateTestingPropertyDocument(agentId, "prompt", { base: mcpPrompt }),
      ]);
      if (!savedProd || !savedTesting) {
        bootstrapAttemptedRef.current = false;
        return;
      }
      setSavedPrompt(mcpPrompt);
      setEditingPrompt(mcpPrompt);
      setDiffViewRequested(false);
      void Promise.all([refetchTestingProperties(), refetchProductionPrompt()]);
      toast.success("Prompt base inicializado en producción y testing.");
    })();
  }, [
    agentId,
    agent,
    propertiesLoading,
    testingPropertiesLoading,
    loadingProductionPrompt,
    testingPropertiesData,
    productionPrompt,
    refetchTestingProperties,
    refetchProductionPrompt,
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

  useEffect(() => {
    try {
      localStorage.setItem(
        PROMPT_STORAGE_KEY,
        JSON.stringify({
          model: promptModel,
          mode: promptMode,
          includeToolsContext,
        }),
      );
    } catch {
      /* ignore */
    }
  }, [promptModel, promptMode, includeToolsContext]);

  const hasChanges =
    editingPrompt !== savedPrompt ||
    (isAuthEnabled &&
      (editingAuthPrompt !== savedAuthPrompt ||
        editingUnauthPrompt !== savedUnauthPrompt));

  const hasLocalChanges = hasChanges;

  const editorViewMode = hasChanges && diffViewRequested ? "diff" : "edit";

  const availableModels = promptModels.filter((m) => m.available);
  const firstAvailable = availableModels[0]?.id;

  useEffect(() => {
    if (modelsLoading || promptModels.length === 0) return;
    const current = promptModels.find((m) => m.id === promptModel);
    if (!current?.available && firstAvailable) {
      queueMicrotask(() =>
        setPromptModel(firstAvailable as PromptModelId),
      );
    }
  }, [modelsLoading, promptModels, promptModel, firstAvailable]);

  const handleSave = async () => {
    if (!hasChanges) return;
    setIsSaving(true);
    let ok = true;
    if (editingPrompt !== savedPrompt) {
      const saved = await updateTestingPropertyDocument(
        agentId,
        "prompt",
        { base: editingPrompt },
      );
      if (saved) setSavedPrompt(editingPrompt);
      else ok = false;
    }
    if (
      ok &&
      isAuthEnabled &&
      (editingAuthPrompt !== savedAuthPrompt ||
        editingUnauthPrompt !== savedUnauthPrompt) &&
      effectiveProperties?.prompt
    ) {
      const payload = {
        auth: {
          auth: editingAuthPrompt,
          unauth: editingUnauthPrompt,
        },
        isMultiFunctionCallingEnable:
          effectiveProperties.prompt.isMultiFunctionCallingEnable,
        model: effectiveProperties.prompt.model ?? "gemini-2.5-flash",
        temperature:
          effectiveProperties.prompt.temperature !== undefined &&
          effectiveProperties.prompt.temperature !== null
            ? Number(effectiveProperties.prompt.temperature)
            : 0.4,
      };
      const saved = await updateTestingPropertyDocument(
        agentId,
        "prompt",
        payload,
      );
      if (saved) {
        setSavedAuthPrompt(editingAuthPrompt);
        setSavedUnauthPrompt(editingUnauthPrompt);
      }
    }
    setIsSaving(false);
    if (ok) {
      setDiffViewRequested(false);
      void refetchTestingProperties();
    }
  };

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
  }, [savedPrompt, savedAuthPrompt, savedUnauthPrompt, productionPrompt, isAuthEnabled]);

  /** El base guardado en pruebas ya es el mismo que en producción (solo base, no auth). */
  const hasTestingProductionDiff = savedTestingDiffersFromProduction;
  const canSave = hasLocalChanges;
  const canTransfer = hasTestingProductionDiff;

  const [isPromoteDialogOpen, setIsPromoteDialogOpen] = useState(false);
  const [promoteIncludeAuth, setPromoteIncludeAuth] = useState(true);
  const [promoteIncludeUnauth, setPromoteIncludeUnauth] = useState(true);

  const executePullProductionBaseToTesting = async () => {
    if (pullingProductionBase || promptAndChatLocked || !canTransfer) return;
    setPullingProductionBase(true);
    try {
      const snap = await fetchProductionPromptSnapshot(agentId);
      if (!snap) {
        toast.error("No se pudo leer el prompt de producción.");
        return;
      }
      const base = typeof snap.prompt === "string" ? snap.prompt : "";
      if (base.trim().length === 0) {
        toast.error("En producción el prompt principal está vacío.");
        return;
      }
      if (normalizePrompt(savedPrompt) === normalizePrompt(base)) {
        toast.info("El prompt en pruebas ya es el mismo que en producción.");
        return;
      }
      const patchOk = await updateTestingPropertyDocument(agentId, "prompt", {
        base,
      });
      if (!patchOk) return;
      setEditingPrompt(base);
      setSavedPrompt(base);
      setDiffViewRequested(false);
      setBaseMarkdownRemount((n) => n + 1);
      void refetchTestingProperties();
      void refetchProductionPrompt();
      toast.success("Listo: el texto de producción quedó guardado en pruebas.");
      setIsPullDialogOpen(false);
      setPullConfirmText("");
    } finally {
      setPullingProductionBase(false);
    }
  };

  const handlePromoteToProduction = async () => {
    if (!canTransfer) return;

    let authDiffers = false;
    let unauthDiffers = false;
    if (isAuthEnabled && productionPrompt?.auth) {
      authDiffers =
        normalizePrompt(savedAuthPrompt) !== normalizePrompt(productionPrompt.auth.auth);
      unauthDiffers =
        normalizePrompt(savedUnauthPrompt) !== normalizePrompt(productionPrompt.auth.unauth);
    }

    if (authDiffers || unauthDiffers) {
      // Mostrar modal para seleccionar
      setPromoteIncludeAuth(authDiffers);
      setPromoteIncludeUnauth(unauthDiffers);
      setIsPromoteDialogOpen(true);
      return;
    }

    // Directo
    await executePromote({ includeAuth: false, includeUnauth: false });
  };

  const executePromote = async ({ includeAuth, includeUnauth }: { includeAuth: boolean; includeUnauth: boolean }) => {
    setPromoting(true);
    try {
      const payload: { prompt: string; auth?: { auth: string; unauth: string } } = {
        prompt: savedPrompt,
      };
      
      // Si decidimos incluir auth, lo enviamos todo al API (actualiza el documento auth entero)
      if (isAuthEnabled && (includeAuth || includeUnauth || !productionPrompt?.auth)) {
        payload.auth = {
          auth: includeAuth
            ? savedAuthPrompt
            : (productionPrompt?.auth?.auth ?? savedAuthPrompt),
          unauth: includeUnauth
            ? savedUnauthPrompt
            : (productionPrompt?.auth?.unauth ?? savedUnauthPrompt),
        };
      }

      const ok = await promotePromptApi(agentId, {
        ...payload,
        confirmation_agent_name: "CONFIRMAR",
        expected_testing_prompt: savedPrompt,
      });
      if (ok) {
        const syncBody: Record<string, unknown> = { base: payload.prompt };
        if (payload.auth != null) {
          syncBody.auth = payload.auth;
          const ep = effectiveProperties?.prompt;
          if (ep) {
            syncBody.isMultiFunctionCallingEnable =
              ep.isMultiFunctionCallingEnable;
            syncBody.model = ep.model ?? "gemini-2.5-flash";
            syncBody.temperature =
              ep.temperature !== undefined && ep.temperature !== null
                ? Number(ep.temperature)
                : 0.4;
          }
        }
        const synced = await updateTestingPropertyDocument(
          agentId,
          "prompt",
          syncBody,
        );
        if (!synced) {
          toast.error(
            "Producción actualizada, pero no se pudo sincronizar el borrador en testing. Guarda de nuevo el prompt.",
          );
        } else {
          setSavedPrompt(payload.prompt);
          if (isAuthEnabled) {
            setSavedAuthPrompt(payload.auth?.auth ?? savedAuthPrompt);
            setSavedUnauthPrompt(payload.auth?.unauth ?? savedUnauthPrompt);
          }
          void refetchTestingProperties();
          toast.success("Prompt subido a producción 🚀");
        }
        setIsPromoteDialogOpen(false);
        setIsPushDialogOpen(false);
        setPushConfirmText("");
        await refetchProductionPrompt();
      }
    } finally {
      setPromoting(false);
    }
  };

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
      ? suggestedPrompt ?? undefined
      : undefined);

  const suggestedForUnauth =
    suggestedPrompts?.unauth ??
    ((suggestedTarget ?? []).includes("unauth")
      ? suggestedPrompt ?? undefined
      : undefined);

  const suggestedForAuth =
    suggestedPrompts?.auth ??
    ((suggestedTarget ?? []).includes("auth")
      ? suggestedPrompt ?? undefined
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
    if (hasMulti && suggestedPrompts) {
      if (suggestedPrompts.base != null) setEditingPrompt(suggestedPrompts.base);
      if (suggestedPrompts.unauth != null) {
        setEditingUnauthPrompt(suggestedPrompts.unauth);
      }
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
  };

  const formatToolsBlock = useCallback(() => {
    if (!agentTools.length) return "Lista de tools: (ninguna).";
    const lines: string[] = ["Tools del agente:"];
    for (const t of agentTools) {
      lines.push(`- ${t.name}: ${t.description || ""}`);
    }
    return lines.join("\n");
  }, [agentTools]);

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

  const addFilesFromFileList = useCallback(
    async (files: FileList | null, currentImageCount?: number) => {
      if (!files?.length) return;
      const maxImages = MAX_CHAT_IMAGES - (currentImageCount ?? 0);
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        if (!file?.type) continue;
        if (file.type === PDF_MIME_TYPE) {
          const pdf = await fileToPdfData(file);
          if (pdf) setPendingPdf(pdf);
          continue;
        }
        if (maxImages > 0 && isAllowedImageType(file.type) && file.size <= MAX_IMAGE_BYTES) {
          const img = await fileToImageData(file);
          if (img) {
            setPendingImages((p) => {
              if (p.length >= MAX_CHAT_IMAGES) return p;
              return [...p, img];
            });
          }
        }
      }
    },
    [],
  );

  const handleChatDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
  }, []);

  const handleChatDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDraggingOverChat(false);
      const files = e.dataTransfer.files;
      if (files?.length) {
        void addFilesFromFileList(files, pendingImages.length);
      }
    },
    [addFilesFromFileList, pendingImages.length],
  );

  const handleChatDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    if (e.dataTransfer.types.includes("Files")) {
      setIsDraggingOverChat(true);
    }
  }, []);

  const handleChatDragLeave = useCallback((e: React.DragEvent) => {
    if (
      e.relatedTarget != null &&
      typeof (e.relatedTarget as Node).nodeType === "number" &&
      !(e.currentTarget as Node).contains(e.relatedTarget as Node)
    ) {
      setIsDraggingOverChat(false);
    }
  }, []);

  const effectiveRejected: Set<number> =
    showSuggestion && !hasMulti
      ? rejectedSuggestionHunkIds
      : new Set<number>();

  if (loadingAgent) {
    return (
      <div className="flex items-center gap-2 text-muted-foreground py-12">
        <Loader2Icon className="h-5 w-5 animate-spin" />
        Cargando agente…
      </div>
    );
  }

  return (
    <div className="flex min-h-0 w-full flex-1 flex-col overflow-hidden">
      {systemPromptGenInProgress && (
        <div
          className="mb-3 flex items-start gap-2 rounded-lg border border-primary/35 bg-primary/5 px-3 py-2.5 text-sm text-foreground"
          role="status"
        >
          <Loader2Icon className="mt-0.5 h-4 w-4 shrink-0 animate-spin text-primary" />
          <div>
            <p className="font-medium">Generando system prompt especializado…</p>
            <p className="mt-0.5 text-muted-foreground text-xs">
              Esto ocurre en segundo plano. El editor y el asistente están en solo
              lectura hasta que termine. Esta página se actualiza sola cada pocos
              segundos.
            </p>
          </div>
        </div>
      )}
      {systemPromptGenFailed && (
        <div className="mb-3 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2.5 text-sm">
          <p className="font-medium text-destructive">No se pudo generar el system prompt</p>
          <p className="mt-1 text-xs text-muted-foreground break-words">
            {agent?.systemPromptGenerationError?.trim() ||
              "Reintenta la generación o revisa la configuración del agente."}
          </p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="mt-2"
            disabled={regenerateSystemPromptLoading}
            onClick={() => void handleRegenerateSystemPrompt()}
          >
            {regenerateSystemPromptLoading ? (
              <Loader2Icon className="mr-1 h-3.5 w-3.5 animate-spin" />
            ) : null}
            Reintentar generación
          </Button>
        </div>
      )}
      <div className="flex min-h-0 flex-1 overflow-hidden rounded-lg border">
        <Dialog open={isPromoteDialogOpen} onOpenChange={setIsPromoteDialogOpen}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Opciones de promoción</DialogTitle>
              <DialogDescription>
                Hay cambios en los prompts de autenticación. ¿Qué deseas promover?
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="promote-auth"
                  checked={promoteIncludeAuth}
                  onCheckedChange={(c: boolean) => setPromoteIncludeAuth(c === true)}
                />
                <Label htmlFor="promote-auth">Prompt de usuarios autenticados</Label>
              </div>
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="promote-unauth"
                  checked={promoteIncludeUnauth}
                  onCheckedChange={(c: boolean) => setPromoteIncludeUnauth(c === true)}
                />
                <Label htmlFor="promote-unauth">Prompt de usuarios no autenticados</Label>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsPromoteDialogOpen(false)}>
                Cancelar
              </Button>
              <Button
                onClick={() => void executePromote({
                  includeAuth: promoteIncludeAuth,
                  includeUnauth: promoteIncludeUnauth,
                })}
                disabled={promoting}
              >
                {promoting && <Loader2Icon className="mr-2 h-4 w-4 animate-spin" />}
                Promover
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
        <Dialog
          open={isPushDialogOpen}
          onOpenChange={(open) => {
            setIsPushDialogOpen(open);
            if (!open) setPushConfirmText("");
          }}
        >
          <DialogContent className="max-w-3xl">
            <DialogHeader>
              <DialogTitle>Subir cambios a producción</DialogTitle>
              <DialogDescription>
                Revisa el diff de testing a producción y escribe CONFIRMAR para continuar.
              </DialogDescription>
            </DialogHeader>
            <div className="max-h-[45vh] overflow-auto rounded border">
              <PromptDiffView oldText={productionPrompt?.prompt ?? ""} newText={savedPrompt} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="push-confirm">Confirmación</Label>
              <Textarea
                id="push-confirm"
                value={pushConfirmText}
                onChange={(event) => setPushConfirmText(event.target.value)}
                placeholder="CONFIRMAR"
                rows={1}
              />
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsPushDialogOpen(false)}>
                Cancelar
              </Button>
              <Button
                onClick={() => void handlePromoteToProduction()}
                disabled={normalizeConfirmInput(pushConfirmText) !== "confirmar" || promoting}
              >
                {promoting ? <Loader2Icon className="mr-2 h-4 w-4 animate-spin" /> : null}
                Confirmar y subir
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
        <Dialog
          open={isPullDialogOpen}
          onOpenChange={(open) => {
            setIsPullDialogOpen(open);
            if (!open) setPullConfirmText("");
          }}
        >
          <DialogContent className="max-w-3xl">
            <DialogHeader>
              <DialogTitle>Bajar cambios desde producción</DialogTitle>
              <DialogDescription>
                Revisa el diff de producción a testing y escribe CONFIRMAR para continuar.
              </DialogDescription>
            </DialogHeader>
            <div className="max-h-[45vh] overflow-auto rounded border">
              <PromptDiffView oldText={savedPrompt} newText={productionPrompt?.prompt ?? ""} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="pull-confirm">Confirmación</Label>
              <Textarea
                id="pull-confirm"
                value={pullConfirmText}
                onChange={(event) => setPullConfirmText(event.target.value)}
                placeholder="CONFIRMAR"
                rows={1}
              />
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsPullDialogOpen(false)}>
                Cancelar
              </Button>
              <Button
                onClick={() => void executePullProductionBaseToTesting()}
                disabled={
                  normalizeConfirmInput(pullConfirmText) !== "confirmar" ||
                  pullingProductionBase
                }
              >
                {pullingProductionBase ? (
                  <Loader2Icon className="mr-2 h-4 w-4 animate-spin" />
                ) : null}
                Confirmar y bajar
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
        <div className="flex-1 min-w-0 flex flex-col min-h-0">
          <div className="flex-1 min-h-0 flex flex-col p-3 gap-4 overflow-hidden bg-background">
          <div className="flex-[3] min-h-0 flex flex-col gap-2 overflow-hidden">
            <div className="flex min-w-0 flex-wrap items-center justify-between gap-x-3 gap-y-1">
              <div className="flex min-w-0 items-center gap-2">
                <Label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                  Base Prompt
                </Label>
                {isAuthEnabled && (
                  <span className="text-[10px] bg-primary/10 text-primary px-1.5 py-0.5 rounded-full font-medium">
                    Modular
                  </span>
                )}
              </div>
              {showMarkdownEditorBase ? (
                <PromptMarkdownViewToggle
                  rawView={rawViewBasePrompt}
                  onRawViewChange={(raw) => {
                    setRawViewBasePrompt(raw);
                    if (!raw) setBaseMarkdownRemount((n) => n + 1);
                  }}
                  disabled={promptAndChatLocked}
                />
              ) : null}
            </div>
            <div className="flex-1 min-h-0">
              {showSuggestion &&
              suggestedForBase != null &&
              primaryTarget === "base" ? (
                <PromptDiffView
                  oldText={editingPrompt}
                  newText={suggestedForBase}
                  rejectedSuggestionHunkIds={effectiveRejected}
                  onRejectSuggestionHunk={(hunkId: number) =>
                    setRejectedSuggestionHunkIds((prev) => {
                      const next = new Set<number>(prev);
                      next.add(hunkId);
                      return next;
                    })
                  }
                  onAcceptSuggestionHunk={(hunkId: number) =>
                    setRejectedSuggestionHunkIds((prev) => {
                      const next = new Set<number>(prev);
                      next.delete(hunkId);
                      return next;
                    })
                  }
                />
              ) : hasChanges && editorViewMode === "diff" ? (
                <PromptDiffView
                  oldText={savedPrompt}
                  newText={editingPrompt}
                  onRevertHunk={(newText) => setEditingPrompt(newText)}
                />
              ) : (
                <PromptMarkdownEditor
                  value={editingPrompt}
                  onChange={setEditingPrompt}
                  disabled={promptAndChatLocked}
                  className="h-full w-full text-sm"
                  placeholder="Escribe el prompt del agente…"
                  rawView={rawViewBasePrompt}
                  markdownPaneRemountKey={baseMarkdownRemount}
                />
              )}
            </div>
          </div>
          {isAuthEnabled && (
            <div className="flex-[2] min-h-0 grid grid-cols-1 lg:grid-cols-2 gap-4 p-3 border-t bg-muted/5 overflow-hidden">
              <div className="flex flex-col gap-2 min-h-0">
                <div className="flex min-w-0 flex-wrap items-center justify-between gap-x-3 gap-y-1">
                  <Label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                    Unauth (Public)
                  </Label>
                  {showMarkdownEditorUnauth ? (
                    <PromptMarkdownViewToggle
                      rawView={rawViewUnauthPrompt}
                      onRawViewChange={(raw) => {
                        setRawViewUnauthPrompt(raw);
                        if (!raw) setUnauthMarkdownRemount((n) => n + 1);
                      }}
                      disabled={promptAndChatLocked}
                    />
                  ) : null}
                </div>
                <div className="flex-1 min-h-0">
                  {showSuggestion && suggestedForUnauth != null ? (
                    <PromptDiffView
                      oldText={editingUnauthPrompt}
                      newText={suggestedForUnauth}
                    />
                  ) : hasChanges && editorViewMode === "diff" ? (
                    <PromptDiffView
                      oldText={savedUnauthPrompt}
                      newText={editingUnauthPrompt}
                      onRevertHunk={(newText) => setEditingUnauthPrompt(newText)}
                    />
                  ) : (
                    <PromptMarkdownEditor
                      value={editingUnauthPrompt}
                      onChange={setEditingUnauthPrompt}
                      className="h-full text-xs [&_.ProseMirror]:text-xs"
                      disabled={promptAndChatLocked}
                      placeholder="Prompt para usuarios no autenticados…"
                      rawView={rawViewUnauthPrompt}
                      markdownPaneRemountKey={unauthMarkdownRemount}
                    />
                  )}
                </div>
              </div>
              <div className="flex flex-col gap-2 min-h-0">
                <div className="flex min-w-0 flex-wrap items-center justify-between gap-x-3 gap-y-1">
                  <Label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground text-primary/80">
                    Auth (Verified)
                  </Label>
                  {showMarkdownEditorAuth ? (
                    <PromptMarkdownViewToggle
                      rawView={rawViewAuthPrompt}
                      onRawViewChange={(raw) => {
                        setRawViewAuthPrompt(raw);
                        if (!raw) setAuthMarkdownRemount((n) => n + 1);
                      }}
                      disabled={promptAndChatLocked}
                    />
                  ) : null}
                </div>
                <div className="flex-1 min-h-0">
                  {showSuggestion && suggestedForAuth != null ? (
                    <PromptDiffView
                      oldText={editingAuthPrompt}
                      newText={suggestedForAuth}
                    />
                  ) : hasChanges && editorViewMode === "diff" ? (
                    <PromptDiffView
                      oldText={savedAuthPrompt}
                      newText={editingAuthPrompt}
                      onRevertHunk={(newText) => setEditingAuthPrompt(newText)}
                    />
                  ) : (
                    <PromptMarkdownEditor
                      value={editingAuthPrompt}
                      onChange={setEditingAuthPrompt}
                      className="h-full text-xs [&_.ProseMirror]:text-xs"
                      disabled={promptAndChatLocked}
                      placeholder="Prompt para usuarios autenticados…"
                      rawView={rawViewAuthPrompt}
                      markdownPaneRemountKey={authMarkdownRemount}
                    />
                  )}
                </div>
              </div>
            </div>
          )}
          </div>
          <div className="flex w-full flex-wrap items-center gap-2 p-3 border-t">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant={canTransfer ? "default" : "outline"}
                  onClick={() => setIsPullDialogOpen(true)}
                  disabled={
                    pullingProductionBase ||
                    promptAndChatLocked ||
                    loadingProductionPrompt ||
                    !canTransfer
                  }
                  className={
                    !canTransfer || loadingProductionPrompt
                      ? "opacity-50"
                      : ""
                  }
                >
                  {pullingProductionBase ? (
                    <Loader2Icon className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <ArrowDownToLineIcon className="mr-2 h-4 w-4" />
                  )}
                  Bajar cambios
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                {promptAndChatLocked
                  ? "No disponible mientras el editor esté bloqueado."
                  : loadingProductionPrompt
                    ? "Cargando el prompt de producción…"
                    : !canTransfer && canSave
                      ? "Guarda primero para crear diferencias entre testing y producción."
                      : !canTransfer
                        ? "No hay diferencias entre testing y producción."
                        : hasLocalChanges
                          ? "Tienes cambios locales sin guardar; al bajar cambios se usará el snapshot guardado en testing."
                          : "Copia el prompt principal de producción a pruebas (sustituye el guardado en testing)."}
              </TooltipContent>
            </Tooltip>
            <div className="ml-auto flex flex-wrap justify-end gap-2">
              {hasChanges && (
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => setDiffViewRequested((v) => !v)}
                  disabled={promptAndChatLocked}
                >
                  {editorViewMode === "diff" ? "Editar" : "Ver cambios"}
                </Button>
              )}
              {showSuggestion && (
                <>
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={clearSuggestion}
                    disabled={promptAndChatLocked}
                  >
                    <XIcon className="mr-1 h-3 w-3" />
                    Descartar sugerencia
                  </Button>
                  <Button
                    type="button"
                    onClick={handleApplySuggestion}
                    disabled={promptAndChatLocked}
                  >
                    <CheckIcon className="mr-1 h-3 w-3" />
                    Aplicar sugerencia
                  </Button>
                </>
              )}
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setEditingPrompt(savedPrompt);
                  setEditingAuthPrompt(savedAuthPrompt);
                  setEditingUnauthPrompt(savedUnauthPrompt);
                  clearSuggestion();
                  reset();
                }}
                disabled={(!hasChanges && !showSuggestion) || promptAndChatLocked}
              >
                Deshacer
              </Button>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    onClick={handleSave}
                    disabled={!canSave || isSaving || promptAndChatLocked}
                  >
                    {isSaving ? (
                      <Loader2Icon className="w-4 h-4 animate-spin mr-2" />
                    ) : null}
                    Guardar
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  Guarda los cambios en Testing para poder probarlos en &quot;Pruebas con kAI&quot;
                </TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    onClick={() => setIsPushDialogOpen(true)}
                    disabled={
                      !canTransfer ||
                      promoting ||
                      promptAndChatLocked ||
                      loadingProductionPrompt
                    }
                    className={
                      !canTransfer || loadingProductionPrompt
                        ? "opacity-50"
                        : ""
                    }
                    variant={
                      canTransfer && !loadingProductionPrompt
                        ? "default"
                        : "outline"
                    }
                  >
                    {promoting ? (
                      <Loader2Icon className="w-4 h-4 animate-spin mr-2" />
                    ) : (
                      <RocketIcon className="w-4 h-4 mr-2" />
                    )}
                    Subir a producción
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  {!canTransfer && canSave
                    ? "Guarda primero para crear diferencia entre testing y producción."
                    : !canTransfer
                      ? "No hay diferencias entre testing y producción para subir."
                      : hasLocalChanges
                        ? "Tienes cambios locales sin guardar; al subir se usará el snapshot guardado en testing."
                        : "Sube los cambios guardados en testing a producción. Esto los hará visibles para los usuarios."}
                </TooltipContent>
              </Tooltip>
            </div>
          </div>
        </div>

        <PromptChatPanel
          messages={messages}
          chatLoading={chatLoading}
          promptAndChatLocked={promptAndChatLocked}
          editingPrompt={editingPrompt}
          chatInput={chatInput}
          setChatInput={setChatInput}
          pendingImages={pendingImages}
          setPendingImages={setPendingImages}
          pendingPdf={pendingPdf as any}
          setPendingPdf={setPendingPdf as any}
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
          formatToolsBlock={formatToolsBlock}
        />
      </div>
    </div>
  );
}
