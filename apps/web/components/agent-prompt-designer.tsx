"use client";

import { useCallback, useEffect, useRef, useState } from "react";
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
  ArrowUpIcon,
  CheckIcon,
  FileTextIcon,
  ImageIcon,
  ListChecksIcon,
  Loader2Icon,
  RotateCcwIcon,
  ShieldCheckIcon,
  SparklesIcon,
  TerminalIcon,
  XIcon,
} from "lucide-react";
import {
  fetchAgentById,
  postAgentSystemPromptRegenerate,
} from "@/lib/agents-api";
import { toast } from "sonner";
import type { Agent } from "@/lib/agent";
import {
  useAgentProperties,
  updateAgentPropertyDocument,
} from "@/hooks/agent-properties";
import { useAgentTools } from "@/hooks/agent-tools";
import { updateAgentPrompt } from "@/hooks/agent-prompt";
import {
  usePromptChat,
  usePromptModels,
  isChatStatusMessage,
  type ChatMessage,
  type ChatMessageImage,
  type ChatMessagePdf,
  type PromptModelId,
  type PromptMode,
} from "@/hooks/prompt-chat";
import PromptDiffView from "@/components/prompt-diff-view";
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
  const { data: propertiesData, isLoading: propertiesLoading } =
    useAgentProperties(agentId);
  const { tools: agentTools } = useAgentTools(agentId);

  const [savedPrompt, setSavedPrompt] = useState("");
  const [editingPrompt, setEditingPrompt] = useState("");
  const [savedAuthPrompt, setSavedAuthPrompt] = useState("");
  const [savedUnauthPrompt, setSavedUnauthPrompt] = useState("");
  const [editingAuthPrompt, setEditingAuthPrompt] = useState("");
  const [editingUnauthPrompt, setEditingUnauthPrompt] = useState("");
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
  const promptAndChatLocked = propertiesLoading || systemPromptGenInProgress;

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
    queueMicrotask(() => {
      setSavedPrompt(agent.prompt ?? "");
      setEditingPrompt(agent.prompt ?? "");
      reset();
    });
  }, [agent, reset]);

  useEffect(() => {
    if (!isAuthEnabled || !propertiesData?.prompt) return;
    const auth = propertiesData.prompt.auth?.auth ?? "";
    const unauth = propertiesData.prompt.auth?.unauth ?? "";
    queueMicrotask(() => {
      setSavedAuthPrompt(auth);
      setSavedUnauthPrompt(unauth);
      setEditingAuthPrompt(auth);
      setEditingUnauthPrompt(unauth);
    });
  }, [isAuthEnabled, propertiesData?.prompt]);

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
      const updated = await updateAgentPrompt({
        agentId,
        prompt: editingPrompt,
      });
      if (updated != null) setSavedPrompt(updated);
      else ok = false;
    }
    if (
      ok &&
      isAuthEnabled &&
      (editingAuthPrompt !== savedAuthPrompt ||
        editingUnauthPrompt !== savedUnauthPrompt) &&
      propertiesData?.prompt
    ) {
      const payload = {
        auth: {
          auth: editingAuthPrompt,
          unauth: editingUnauthPrompt,
        },
        isMultiFunctionCallingEnable:
          propertiesData.prompt.isMultiFunctionCallingEnable,
        model: propertiesData.prompt.model ?? "gemini-2.5-flash",
        temperature:
          propertiesData.prompt.temperature !== undefined &&
          propertiesData.prompt.temperature !== null
            ? Number(propertiesData.prompt.temperature)
            : 0.4,
      };
      const saved = await updateAgentPropertyDocument(
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
    if (ok) setDiffViewRequested(false);
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
        <div className="flex-1 min-w-0 flex flex-col min-h-0 overflow-y-auto">
          <div className="flex flex-col gap-2 p-3 min-h-[400px]">
            <div className="flex items-center gap-2">
              <Label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                Base Prompt
              </Label>
              {isAuthEnabled && (
                <span className="text-[10px] bg-primary/10 text-primary px-1.5 py-0.5 rounded-full font-medium">
                  Modular
                </span>
              )}
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
                <Textarea
                  value={editingPrompt}
                  onChange={(e) => setEditingPrompt(e.target.value)}
                  disabled={promptAndChatLocked}
                  className="h-full min-h-[300px] resize-none font-mono text-sm"
                  placeholder="Escribe el prompt del agente…"
                />
              )}
            </div>
          </div>
          {isAuthEnabled && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 p-3 border-t bg-muted/5">
              <div className="flex flex-col gap-2 min-h-0">
                <Label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                  Unauth (Public)
                </Label>
                <div className="h-[300px] min-h-0">
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
                    <Textarea
                      value={editingUnauthPrompt}
                      onChange={(e) => setEditingUnauthPrompt(e.target.value)}
                      className="h-full resize-none font-mono text-xs"
                      disabled={promptAndChatLocked}
                      placeholder="Prompt para usuarios no autenticados…"
                    />
                  )}
                </div>
              </div>
              <div className="flex flex-col gap-2 min-h-0">
                <Label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground text-primary/80">
                  Auth (Verified)
                </Label>
                <div className="h-[300px] min-h-0">
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
                    <Textarea
                      value={editingAuthPrompt}
                      onChange={(e) => setEditingAuthPrompt(e.target.value)}
                      className="h-full resize-none font-mono text-xs"
                      disabled={promptAndChatLocked}
                      placeholder="Prompt para usuarios autenticados…"
                    />
                  )}
                </div>
              </div>
            </div>
          )}
          <div className="flex justify-end gap-2 p-3 border-t">
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
            <Button
              onClick={handleSave}
              disabled={!hasChanges || isSaving || promptAndChatLocked}
            >
              {isSaving ? (
                <Loader2Icon className="w-4 h-4 animate-spin mr-2" />
              ) : null}
              Guardar
            </Button>
          </div>
        </div>

        <div
          role="separator"
          className="w-2 shrink-0 cursor-col-resize border-l bg-border/60 hover:bg-primary/20"
          onMouseDown={(e) => {
            e.preventDefault();
            const startX = e.clientX;
            const startW = chatWidth;
            const onMove = (ev: MouseEvent) => {
              const d = startX - ev.clientX;
              setChatWidth(Math.min(520, Math.max(260, startW + d)));
            };
            const onUp = () => {
              document.removeEventListener("mousemove", onMove);
              document.removeEventListener("mouseup", onUp);
            };
            document.addEventListener("mousemove", onMove);
            document.addEventListener("mouseup", onUp);
          }}
        />

        <aside
          className={`relative shrink-0 flex min-h-0 flex-col border-l transition-colors ${
            isDraggingOverChat ? "bg-primary/10 ring-2 ring-inset ring-primary" : ""
          }`}
          style={{ width: chatWidth }}
          onDragOver={handleChatDragOver}
          onDrop={handleChatDrop}
          onDragEnter={handleChatDragEnter}
          onDragLeave={handleChatDragLeave}
        >
          {isDraggingOverChat && (
            <div
              className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 border-2 border-dashed border-primary bg-primary/5"
              aria-hidden
            >
              <ImageIcon className="h-10 w-10 text-primary" />
              <span className="text-sm font-medium text-primary">
                Suelta la imagen o PDF aqui para adjuntarlo
              </span>
            </div>
          )}
          <Card className="rounded-none border-0 shadow-none h-full flex flex-col min-h-0">
            <CardHeader className="pb-2">
              <div className="flex justify-between gap-2">
                <div>
                  <CardTitle className="text-sm">Asistente</CardTitle>
                  <CardDescription className="text-xs">
                    Mejoras y preguntas sobre el prompt
                  </CardDescription>
                </div>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => reset()}
                      disabled={
                        messages.length === 0 || chatLoading || promptAndChatLocked
                      }
                    >
                      <RotateCcwIcon className="w-4 h-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Reiniciar chat</TooltipContent>
                </Tooltip>
              </div>
            </CardHeader>
            <CardContent className="flex min-h-0 flex-1 flex-col overflow-hidden px-3 pb-1">
              <div className="flex-1 overflow-y-auto space-y-2 mb-2 pr-1">
                {messages.map((message: ChatMessage, index: number) => {
                  const isLast = index === messages.length - 1;
                  const thinking = isLast && message.role === "model" && chatLoading;
                  const isStatus =
                    message.role === "model" &&
                    !thinking &&
                    isChatStatusMessage(message.content);
                  const display = thinking
                    ? message.content.split("\n").slice(-6).join("\n")
                    : message.content;
                  return (
                    <div
                      key={`${message.role}-${index}`}
                      className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}
                    >
                      <div
                        className={`max-w-[90%] rounded-md px-2 py-1.5 text-xs break-words ${
                          message.role === "user"
                            ? "bg-primary text-primary-foreground"
                            : thinking || isStatus
                              ? "bg-muted/80 text-muted-foreground"
                              : "bg-muted"
                        }`}
                      >
                        <ReactMarkdown
                          remarkPlugins={[remarkGfm]}
                          components={chatMarkdownComponents}
                        >
                          {display}
                        </ReactMarkdown>
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="shrink-0 flex flex-col gap-2">
                <div className="mt-auto flex items-center gap-2 pt-1">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span className="inline-flex">
                        <Button
                          type="button"
                          variant="outline"
                          size="icon"
                          className="h-8 w-8 rounded-lg"
                          disabled={
                            !editingPrompt.trim() ||
                            chatLoading ||
                            promptAndChatLocked
                          }
                          onClick={() => void sendMessage(OPTIMIZE)}
                          aria-label="Optimizar prompt"
                        >
                          <SparklesIcon className="h-4 w-4" />
                        </Button>
                      </span>
                    </TooltipTrigger>
                    <TooltipContent>Optimizar prompt</TooltipContent>
                  </Tooltip>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span className="inline-flex">
                        <Button
                          type="button"
                          variant="outline"
                          size="icon"
                          className="h-8 w-8 rounded-lg"
                          disabled={
                            !editingPrompt.trim() ||
                            chatLoading ||
                            promptAndChatLocked
                          }
                          onClick={() => void sendMessage(FIX_CONTRADICTIONS)}
                          aria-label="Corregir contradicciones"
                        >
                          <ShieldCheckIcon className="h-4 w-4" />
                        </Button>
                      </span>
                    </TooltipTrigger>
                    <TooltipContent>Corregir contradicciones</TooltipContent>
                  </Tooltip>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span className="inline-flex">
                        <Button
                          type="button"
                          variant="outline"
                          size="icon"
                          className="h-8 w-8 rounded-lg"
                          disabled={
                            !editingPrompt.trim() ||
                            chatLoading ||
                            promptAndChatLocked
                          }
                          onClick={() => {
                            void sendMessage(
                              `Contexto de tools:\n${formatToolsBlock()}\n\nResume qué hace cada tool.`,
                            );
                          }}
                          aria-label="Resumir tools"
                        >
                          <ListChecksIcon className="h-4 w-4" />
                        </Button>
                      </span>
                    </TooltipTrigger>
                    <TooltipContent>Resumir tools</TooltipContent>
                  </Tooltip>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span className="inline-flex">
                        <Button
                          type="button"
                          variant="outline"
                          size="icon"
                          className="h-8 w-8 rounded-lg"
                          disabled={
                            !editingPrompt.trim() ||
                            chatLoading ||
                            promptAndChatLocked
                          }
                          aria-label="Extraer comandos"
                        >
                          <TerminalIcon className="h-4 w-4" />
                        </Button>
                      </span>
                    </TooltipTrigger>
                    <TooltipContent>Extraer comandos</TooltipContent>
                  </Tooltip>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span className="inline-flex">
                        <Button
                          type="button"
                          variant="outline"
                          size="icon"
                          className="h-8 w-8 rounded-lg"
                          disabled={chatLoading || promptAndChatLocked}
                          onClick={() => chatFileInputRef.current?.click()}
                          aria-label="Subir imagen"
                        >
                          <ImageIcon className="h-4 w-4" />
                        </Button>
                      </span>
                    </TooltipTrigger>
                    <TooltipContent>Subir imagen o PDF</TooltipContent>
                  </Tooltip>
                </div>
                <Label htmlFor="prompt-chat-input" className="text-xs font-semibold">
                  Pide ayuda al asistente
                </Label>
                <input
                  ref={chatFileInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/gif,application/pdf"
                  multiple
                  className="hidden"
                  aria-hidden
                  onChange={(e) => {
                    void addFilesFromFileList(e.target.files ?? null, pendingImages.length);
                    e.target.value = "";
                  }}
                />
                {(pendingImages.length > 0 || pendingPdf) &&
                  promptModel !== "gemini-3-flash" &&
                  promptModel !== "gemini-3.1-pro" && (
                    <p className="text-xs text-amber-600 dark:text-amber-500">
                      Las imágenes y el PDF solo se envían con modelos Gemini.
                    </p>
                  )}
                {pendingPdf != null && (
                  <div className="flex items-center gap-2 rounded-md border border-border bg-muted px-2 py-1.5 text-xs">
                    <FileTextIcon className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <span className="flex-1 truncate" title={pendingPdf.name}>
                      {pendingPdf.name}
                    </span>
                    <button
                      type="button"
                      className="rounded p-0.5 text-muted-foreground hover:bg-muted-foreground/20 hover:text-foreground"
                      onClick={() => setPendingPdf(null)}
                      aria-label="Quitar PDF"
                    >
                      <XIcon className="h-3 w-3" />
                    </button>
                  </div>
                )}
                {pendingImages.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {pendingImages.map((img, i) => (
                      <div
                        key={`${img.mimeType}-${i}`}
                        className="relative overflow-hidden rounded border border-border bg-muted"
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={`data:${img.mimeType};base64,${img.data}`}
                          alt=""
                          className="h-14 w-14 object-cover"
                        />
                        <button
                          type="button"
                          className="absolute right-0.5 top-0.5 rounded-full bg-black/60 p-0.5 text-white hover:bg-black/80"
                          onClick={() =>
                            setPendingImages((p) => p.filter((_, j) => j !== i))
                          }
                          aria-label="Quitar imagen"
                        >
                          <XIcon className="h-3 w-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                <Textarea
                  id="prompt-chat-input"
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  placeholder="Escribe un mensaje…"
                  rows={3}
                  className="min-h-[92px] resize-none rounded-xl text-sm"
                  disabled={promptAndChatLocked}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      void handleSendChat();
                    }
                  }}
                  onPaste={(e) => {
                    const files = e.clipboardData?.files;
                    if (files?.length && pendingImages.length < MAX_CHAT_IMAGES) {
                      let hasImage = false;
                      for (let i = 0; i < files.length; i++) {
                        if (files[i]?.type && isAllowedImageType(files[i].type)) {
                          hasImage = true;
                          break;
                        }
                      }
                      if (hasImage) {
                        e.preventDefault();
                        void addFilesFromFileList(files, pendingImages.length);
                      }
                    }
                  }}
                />
                <div className="flex items-center gap-2">
                  <Select
                    value={promptMode}
                    onValueChange={(v) => setPromptMode(v as PromptMode)}
                    disabled={promptAndChatLocked}
                  >
                    <SelectTrigger className="h-8 w-fit min-w-[108px] rounded-full border px-2.5 text-xs">
                      <span className="inline-flex items-center gap-2">
                        <SparklesIcon className="h-3.5 w-3.5" />
                        <SelectValue />
                      </span>
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="agent">Agente</SelectItem>
                      <SelectItem value="questions">Preguntas</SelectItem>
                    </SelectContent>
                  </Select>
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    className="ml-auto h-8 w-8 rounded-lg"
                    onClick={() => void handleSendChat()}
                    disabled={
                      chatLoading || !chatInput.trim() || promptAndChatLocked
                    }
                    aria-label="Enviar"
                  >
                    {chatLoading ? (
                      <Loader2Icon className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <ArrowUpIcon className="h-3.5 w-3.5" />
                    )}
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </aside>
      </div>
    </div>
  );
}
