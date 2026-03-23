"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
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
  CheckIcon,
  Loader2Icon,
  RotateCcwIcon,
  XIcon,
} from "lucide-react";
import { fetchAgentById } from "@/lib/agents-api";
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
  const [includeToolsContext, setIncludeToolsContext] = useState(false);

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

  const suggestionDiffLines = useMemo(() => {
    if (!showSuggestion || hasMulti || suggestedPrompt == null) return [];
    const ref =
      primaryTarget === "auth"
        ? editingAuthPrompt
        : primaryTarget === "unauth"
          ? editingUnauthPrompt
          : editingPrompt;
    return computeDiffLines(ref, suggestedPrompt);
  }, [
    showSuggestion,
    hasMulti,
    suggestedPrompt,
    primaryTarget,
    editingPrompt,
    editingAuthPrompt,
    editingUnauthPrompt,
  ]);

  const handleApplySuggestion = () => {
    if (hasMulti && suggestedPrompts) {
      if (suggestedPrompts.base != null) setEditingPrompt(suggestedPrompts.base);
      if (suggestedPrompts.unauth != null)
        setEditingUnauthPrompt(suggestedPrompts.unauth);
      if (suggestedPrompts.auth != null)
        setEditingAuthPrompt(suggestedPrompts.auth);
      clearSuggestion();
      setRejectedSuggestionHunkIds(new Set());
      return;
    }
    if (suggestedPrompt == null) return;
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
    setChatInput("");
    await sendMessage(content);
  };

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
    <div className="flex flex-col gap-4 min-h-0">
      <div className="flex flex-wrap gap-2 items-center">
        <Label className="text-xs">Modelo</Label>
        <Select
          value={promptModel}
          onValueChange={(v) => setPromptModel(v as PromptModelId)}
        >
          <SelectTrigger className="w-[200px] h-8 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {promptModels.map((m) => (
              <SelectItem key={m.id} value={m.id} disabled={!m.available}>
                {m.name}
                {!m.available ? " (no disponible)" : ""}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Label className="text-xs">Modo</Label>
        <Select
          value={promptMode}
          onValueChange={(v) => setPromptMode(v as PromptMode)}
        >
          <SelectTrigger className="w-[160px] h-8 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="agent">Editar prompt</SelectItem>
            <SelectItem value="questions">Solo preguntas</SelectItem>
          </SelectContent>
        </Select>
        <label className="flex items-center gap-1.5 text-xs">
          <input
            type="checkbox"
            checked={includeToolsContext}
            onChange={(e) => setIncludeToolsContext(e.target.checked)}
          />
          Incluir tools en contexto
        </label>
      </div>

      <div className="flex min-h-[min(80vh,720px)] border rounded-lg overflow-hidden">
        <div className="flex-1 min-w-0 flex flex-col min-h-0">
          <div className="flex items-center justify-between gap-2 px-3 py-2 border-b bg-muted/30">
            <span className="text-sm font-medium">Prompt principal</span>
            <div className="flex flex-wrap gap-1">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-7 text-xs"
                onClick={() => sendMessage(OPTIMIZE)}
                disabled={chatLoading}
              >
                Optimizar
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-7 text-xs"
                onClick={() => {
                  void sendMessage(
                    `Contexto de tools:\n${formatToolsBlock()}\n\nResume qué hace cada tool.`,
                  );
                }}
                disabled={chatLoading}
              >
                Resumir tools
              </Button>
              {hasChanges && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 text-xs"
                  onClick={() => setDiffViewRequested((v) => !v)}
                >
                  {editorViewMode === "diff" ? "Editar" : "Ver cambios"}
                </Button>
              )}
              {showSuggestion && (
                <>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={clearSuggestion}
                  >
                    <XIcon className="w-3 h-3 mr-1" />
                    Descartar
                  </Button>
                  <Button type="button" size="sm" onClick={handleApplySuggestion}>
                    <CheckIcon className="w-3 h-3 mr-1" />
                    Aplicar
                  </Button>
                </>
              )}
            </div>
          </div>
          <div className="flex-1 min-h-0 p-3">
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
                disabled={propertiesLoading}
                className="h-full min-h-[200px] resize-none font-mono text-sm"
                placeholder="Escribe el prompt del agente…"
              />
            )}
          </div>
          {isAuthEnabled && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 p-3 border-t">
              <div className="space-y-1 min-h-0">
                <Label className="text-xs">Unauth</Label>
                <Textarea
                  value={editingUnauthPrompt}
                  onChange={(e) => setEditingUnauthPrompt(e.target.value)}
                  className="min-h-[100px] font-mono text-xs"
                  disabled={propertiesLoading}
                />
              </div>
              <div className="space-y-1 min-h-0">
                <Label className="text-xs">Auth</Label>
                <Textarea
                  value={editingAuthPrompt}
                  onChange={(e) => setEditingAuthPrompt(e.target.value)}
                  className="min-h-[100px] font-mono text-xs"
                  disabled={propertiesLoading}
                />
              </div>
            </div>
          )}
          <div className="flex justify-end gap-2 p-3 border-t">
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
              disabled={!hasChanges && !showSuggestion}
            >
              Deshacer
            </Button>
            <Button onClick={handleSave} disabled={!hasChanges || isSaving}>
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

        <aside className="shrink-0 flex flex-col min-h-0 border-l" style={{ width: chatWidth }}>
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
                      disabled={messages.length === 0 || chatLoading}
                    >
                      <RotateCcwIcon className="w-4 h-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Reiniciar chat</TooltipContent>
                </Tooltip>
              </div>
            </CardHeader>
            <CardContent className="flex-1 flex flex-col min-h-0 overflow-hidden px-3 pb-3">
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
              <div className="flex gap-2 shrink-0">
                <Textarea
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  placeholder="Escribe un mensaje…"
                  rows={2}
                  className="text-xs min-h-0"
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      void handleSendChat();
                    }
                  }}
                />
                <Button
                  type="button"
                  size="sm"
                  className="shrink-0"
                  onClick={() => void handleSendChat()}
                  disabled={chatLoading || !chatInput.trim()}
                >
                  Enviar
                </Button>
              </div>
            </CardContent>
          </Card>
        </aside>
      </div>
    </div>
  );
}
