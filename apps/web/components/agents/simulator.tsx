"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  BotIcon,
  CheckCircle2Icon,
  ChevronRightIcon,
  HistoryIcon,
  PlayIcon,
  PlusIcon,
  RotateCcwIcon,
  Settings2Icon,
  SquareIcon,
  Trash2Icon,
  User2Icon,
  XIcon,
} from "lucide-react";
import {
  deleteSimulatorState,
  fetchSimulatorState,
  patchSimulatorState,
  postAgentsTestingSimulate,
} from "@/services/agents-api";
import type {
  SimulateBody,
  SimulatorStoredConversation,
  SimulatorMode,
  SSEEvent,
} from "@/types";
import { Shimmer } from "@/components/ai-elements/shimmer";
import { parseSSEStream } from "@/utils/integration-sse";

const DEFAULT_TOKEN = "test-whatsapp-token";
const DEFAULT_PHONE_ID = "test-phone-number-id";
const MESSAGE_LIMIT_MAX = 25;
const STORAGE_KEY = "simulator-params";

const DEFAULT_PARAMS = {
  messageLimit: "1",
  simulatorMode: "full" as SimulatorMode,
  stream: true,
  testMode: false,
};

function loadParams() {
  if (typeof window === "undefined") return DEFAULT_PARAMS;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_PARAMS;
    const parsed = JSON.parse(raw) as Partial<typeof DEFAULT_PARAMS>;
    return { ...DEFAULT_PARAMS, ...parsed };
  } catch {
    return DEFAULT_PARAMS;
  }
}

function saveParams(params: typeof DEFAULT_PARAMS) {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(params));
}

function getMessageContent(data: unknown): string {
  if (typeof data === "string") return data;
  if (Array.isArray(data)) return data.map((item) => String(item)).join("\n");
  if (typeof data === "object" && data !== null && "content" in data) {
    const content = (data as { content?: unknown }).content;
    if (typeof content === "string") return content;
    if (Array.isArray(content)) return content.map((item) => String(item)).join("\n");
  }
  return JSON.stringify(data, null, 2);
}

function formatValue(value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return JSON.stringify(value, null, 2);
}

function ToolCallsBlock({ functionCalls }: { functionCalls: unknown[] }) {
  return (
    <div className="mt-2 space-y-2">
      {functionCalls.map((call, index) => {
        const item = call as {
          name?: string;
          args?: Record<string, unknown>;
          response?: unknown;
        };
        const name = typeof item?.name === "string" ? item.name : `Tool ${index + 1}`;
        const args =
          item?.args && typeof item.args === "object" && !Array.isArray(item.args)
            ? item.args
            : {};
        const argEntries = Object.entries(args);
        const hasResponse = item?.response !== undefined && item?.response !== null;

        return (
          <div key={index} className="rounded-lg border border-border/70 bg-card/70">
            <div className="border-b border-border/60 px-3 py-2 text-xs font-medium text-foreground/90">
              {name.replace(/_/g, " ")}
            </div>
            <div className="space-y-2 px-3 py-2">
              {argEntries.length > 0 ? (
                <div className="rounded-md border border-border/60 bg-muted/25">
                  {argEntries.map(([key, value]) => (
                    <div
                      key={key}
                      className="grid grid-cols-[120px_1fr] gap-2 border-b border-border/50 px-2.5 py-2 text-xs last:border-b-0"
                    >
                      <div className="text-muted-foreground">{key.replace(/_/g, " ")}</div>
                      <div className="whitespace-pre-wrap break-words text-foreground/90">
                        {formatValue(value)}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">Sin argumentos</p>
              )}
              {hasResponse && (
                <details className="group">
                  <summary className="flex cursor-pointer list-none items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground">
                    <ChevronRightIcon className="h-3.5 w-3.5 transition-transform group-open:rotate-90" />
                    Ver resultado de esta función
                  </summary>
                  <pre className="mt-2 max-h-36 overflow-auto whitespace-pre-wrap break-all rounded-md bg-muted/40 p-2 text-[11px]">
                    {JSON.stringify(item.response, null, 2)}
                  </pre>
                </details>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function AnalysisCards({
  summary,
  notes,
}: {
  summary?: string;
  notes?: string;
}) {
  if (!summary && !notes) return null;

  return (
    <div className="mt-2 grid gap-2">
      {summary && (
        <div className="rounded-lg border border-border/70 bg-card/70 p-3">
          <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Resumen
          </p>
          <p className="whitespace-pre-wrap break-words text-sm leading-relaxed">
            {summary}
          </p>
        </div>
      )}
      {notes && (
        <div className="rounded-lg border border-border/70 bg-card/70 p-3">
          <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Análisis
          </p>
          <p className="whitespace-pre-wrap break-words text-sm leading-relaxed">
            {notes}
          </p>
        </div>
      )}
    </div>
  );
}

function ResultEventCard({ event }: { event: SSEEvent }) {
  if (event.type === "start") {
    return (
      <div className="inline-flex w-fit items-center rounded-md border border-muted-foreground/30 bg-muted/30 px-2.5 py-1 text-xs font-medium text-muted-foreground">
        Simulación iniciada
      </div>
    );
  }

  if (event.type === "done") {
    const conversationAnalysis =
      typeof event.conversationAnalysis === "object" && event.conversationAnalysis !== null
        ? (event.conversationAnalysis as { summary?: unknown; notes?: unknown })
        : null;
    const summary =
      conversationAnalysis && typeof conversationAnalysis.summary === "string"
        ? conversationAnalysis.summary
        : undefined;
    const notes =
      conversationAnalysis && typeof conversationAnalysis.notes === "string"
        ? conversationAnalysis.notes
        : undefined;

    return (
      <div>
        <div className="inline-flex w-fit items-center gap-1.5 rounded-md border border-green-500/40 bg-green-500/10 px-2.5 py-1 text-xs font-medium text-green-700 dark:text-green-400">
          <CheckCircle2Icon className="h-3.5 w-3.5" />
          Fin de la conversación
        </div>
        <AnalysisCards summary={summary} notes={notes} />
      </div>
    );
  }

  if (event.type === "personality") {
    const analysis =
      typeof event.analisis === "object" && event.analisis !== null
        ? (event.analisis as { summary?: unknown; notes?: unknown })
        : null;
    const summary =
      analysis && typeof analysis.summary === "string" ? analysis.summary : undefined;
    const notes = analysis && typeof analysis.notes === "string" ? analysis.notes : undefined;

    return (
      <div className="rounded-lg border border-border/70 bg-muted/20 px-3 py-2.5">
        <p className="text-xs font-medium text-muted-foreground">
          Análisis de la conversación
        </p>
        <AnalysisCards summary={summary} notes={notes} />
        <details className="group mt-2">
          <summary className="flex cursor-pointer list-none items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground">
            <ChevronRightIcon className="h-3.5 w-3.5 transition-transform group-open:rotate-90" />
            Ver detalle completo
          </summary>
          <pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap break-all rounded bg-muted/40 p-2 text-[11px]">
            {JSON.stringify(event, null, 2)}
          </pre>
        </details>
      </div>
    );
  }

  const role = event.data.role === "user" ? "user" : "assistant";
  const content = getMessageContent(event.data);
  const hasFunctionCalls =
    Array.isArray(event.data.functionCalls) && event.data.functionCalls.length > 0;

  return (
    <div className="rounded-lg border border-border/70 bg-muted/15 px-3 py-2.5">
      <div className="mb-2 flex items-center gap-1.5 text-xs">
        <span
          className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 ${
            role === "user"
              ? "border-blue-500/40 bg-blue-500/10 text-blue-700 dark:text-blue-300"
              : "border-violet-500/40 bg-violet-500/10 text-violet-700 dark:text-violet-300"
          }`}
        >
          {role === "user" ? (
            <User2Icon className="h-3 w-3" />
          ) : (
            <BotIcon className="h-3 w-3" />
          )}
          {role === "user" ? "Usuario" : "Asistente"}
        </span>
      </div>

      <div className="whitespace-pre-wrap break-words rounded-md border border-border/50 bg-card/70 px-3 py-2 text-sm leading-relaxed">
        {content}
      </div>

      {hasFunctionCalls && (
        <details className="group mt-2">
          <summary className="flex cursor-pointer list-none items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground">
            <ChevronRightIcon className="h-3.5 w-3.5 transition-transform group-open:rotate-90" />
            Ver funciones usadas ({event.data.functionCalls?.length})
          </summary>
          <ToolCallsBlock functionCalls={event.data.functionCalls ?? []} />
        </details>
      )}
    </div>
  );
}

interface ConversationState {
  id: string;
  prompt: string;
  streamEvents: SSEEvent[];
  error: string | null;
  isSending: boolean;
  currentTurn: "user" | "agent" | null;
  closedAt: string | null;
}

function createEmptyConversation(): ConversationState {
  return {
    id: generateId(),
    prompt: "",
    streamEvents: [],
    error: null,
    isSending: false,
    currentTurn: null,
    closedAt: null,
  };
}

function normalizeConversationForStorage(
  conversation: ConversationState,
): SimulatorStoredConversation {
  return {
    id: conversation.id,
    prompt: conversation.prompt,
    streamEvents: conversation.streamEvents,
    error: conversation.error,
    closedAt: conversation.closedAt,
  };
}

function inflateConversationFromStorage(
  conversation: SimulatorStoredConversation,
): ConversationState {
  return {
    id: conversation.id,
    prompt: conversation.prompt,
    streamEvents: conversation.streamEvents as SSEEvent[],
    error: conversation.error,
    isSending: false,
    currentTurn: null,
    closedAt: typeof conversation.closedAt === "string" ? conversation.closedAt : null,
  };
}

function ensureAtLeastOneConversation(
  conversations: ConversationState[],
): ConversationState[] {
  return conversations.length > 0 ? conversations : [createEmptyConversation()];
}

function ensureAtLeastOneOpenConversation(
  conversations: ConversationState[],
): ConversationState[] {
  const withAtLeastOne = ensureAtLeastOneConversation(conversations);
  const hasOpenConversation = withAtLeastOne.some(
    (conversation) => conversation.closedAt === null,
  );
  return hasOpenConversation
    ? withAtLeastOne
    : [...withAtLeastOne, createEmptyConversation()];
}

function isConversationMeaningful(conversation: ConversationState): boolean {
  return (
    conversation.prompt.trim().length > 0 ||
    conversation.streamEvents.length > 0 ||
    Boolean(conversation.error)
  );
}

function generateId() {
  return `conv-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function ConversationCard({
  index,
  conversation,
  onSend,
  onStop,
  onClose,
  onReset,
  onRemove,
  canRemove,
  canClose,
  onUpdatePrompt,
}: {
  index: number;
  conversation: ConversationState;
  onSend: () => void;
  onStop: () => void;
  onClose: () => void;
  onReset: () => void;
  onRemove: () => void;
  canRemove: boolean;
  canClose: boolean;
  onUpdatePrompt: (prompt: string) => void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [conversation.streamEvents, conversation.isSending]);

  return (
    <Card className="flex h-full flex-col overflow-hidden gap-0">
      <CardHeader className="pb-1 pt-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium">
            Conversación {index + 1}
          </CardTitle>
          <div className="flex items-center gap-1">
            {canClose && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    onClick={onClose}
                    className="rounded-md p-1 text-muted-foreground hover:bg-muted/50 hover:text-foreground"
                    aria-label="Cerrar conversación"
                  >
                    <XIcon className="h-4 w-4" />
                  </button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Cerrar conversación</p>
                </TooltipContent>
              </Tooltip>
            )}
            {canRemove && (
              <AlertDialog>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <AlertDialogTrigger asChild>
                      <button
                        type="button"
                        className="rounded-md p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                        aria-label="Eliminar conversación"
                      >
                        <Trash2Icon className="h-4 w-4" />
                      </button>
                    </AlertDialogTrigger>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>Eliminar conversación</p>
                  </TooltipContent>
                </Tooltip>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>¿Eliminar esta conversación?</AlertDialogTitle>
                    <AlertDialogDescription>
                      Esta acción eliminará la conversación de forma permanente.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancelar</AlertDialogCancel>
                    <AlertDialogAction onClick={onRemove}>Eliminar</AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="flex flex-1 min-h-0 flex-col gap-2 overflow-hidden pt-0">
        <div className="flex flex-col gap-2">
          <Textarea
            placeholder="Instrucción para esta prueba (opcional)"
            value={conversation.prompt}
            onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => {
              onUpdatePrompt(e.target.value);
            }}
            onKeyDown={(e: React.KeyboardEvent<HTMLTextAreaElement>) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && !conversation.isSending) {
                e.preventDefault();
                onSend();
              }
            }}
            rows={3}
            className="resize-none text-sm"
          />
          <div className="flex gap-2">
            {conversation.isSending ? (
              <Button
                type="button"
                onClick={onStop}
                variant="destructive"
                size="sm"
                className="gap-1.5"
              >
                <SquareIcon className="h-3.5 w-3.5" />
                Detener
              </Button>
            ) : (
              <Button
                type="button"
                onClick={onSend}
                size="sm"
                className="gap-1.5"
              >
                <PlayIcon className="h-3.5 w-3.5" />
                Ejecutar
              </Button>
            )}
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  onClick={onReset}
                  disabled={conversation.isSending}
                  size="sm"
                >
                  <RotateCcwIcon className="h-3.5 w-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>Limpiar resultados</p>
              </TooltipContent>
            </Tooltip>
          </div>
        </div>

        <div
          ref={scrollRef}
          className="min-h-0 flex-1 overflow-y-auto rounded-md border border-border/50 bg-muted/10 p-3"
        >
          {conversation.error && (
            <div className="mb-3 rounded-md bg-destructive/10 p-3 text-destructive">
              <p className="whitespace-pre-wrap text-sm">{conversation.error}</p>
            </div>
          )}
          {conversation.streamEvents.length === 0 && !conversation.error && !conversation.isSending ? (
            <p className="text-sm text-muted-foreground">Aún no hay resultados.</p>
          ) : (
            <ul className="space-y-3">
              {conversation.streamEvents.map((ev, i) => (
                <li key={i}>
                  <ResultEventCard event={ev} />
                </li>
              ))}
            </ul>
          )}
          {conversation.isSending && (
            <p className="flex items-center gap-2 text-sm mt-2">
              {conversation.currentTurn === "agent" ? (
                <Shimmer as="small">Esperando respuesta del agente...</Shimmer>
              ) : conversation.currentTurn === "user" ? (
                <Shimmer as="small">Enviando mensaje al agente...</Shimmer>
              ) : (
                <Shimmer as="small">Procesando...</Shimmer>
              )}
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export function AgentSimulator({
  agentId,
}: {
  agentId: string;
}) {
  const savedParams = useMemo(() => loadParams(), []);
  const [messageLimit, setMessageLimit] = useState<string>(savedParams.messageLimit);
  const [simulatorMode, setSimulatorMode] =
    useState<SimulatorMode>(savedParams.simulatorMode);
  const [stream, setStream] = useState(savedParams.stream);
  const [testMode, setTestMode] = useState(savedParams.testMode);
  const [isHistoryLoading, setIsHistoryLoading] = useState(true);
  const [isHistoryDialogOpen, setIsHistoryDialogOpen] = useState(false);

  useEffect(() => {
    saveParams({ messageLimit, simulatorMode, stream, testMode });
  }, [messageLimit, simulatorMode, stream, testMode]);

  const [conversations, setConversations] = useState<ConversationState[]>([
    createEmptyConversation(),
  ]);
  const historyConversations = useMemo(
    () => conversations.filter((conversation) => isConversationMeaningful(conversation)),
    [conversations],
  );
  const visibleConversations = useMemo(
    () => conversations.filter((conversation) => conversation.closedAt === null),
    [conversations],
  );
  const skipNextPersistRef = useRef(true);
  const saveDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const buildBody = useCallback(
    (prompt: string): SimulateBody | null => {
      const agent: SimulateBody["agent"] = {};
      if (messageLimit !== "" && Number.isFinite(Number(messageLimit))) {
        const raw = Number(messageLimit);
        agent.message = {
          limit: Math.min(MESSAGE_LIMIT_MAX, Math.max(1, raw)),
        };
      }
      agent.personality = { limit: 1 };
      if (prompt.trim()) agent.prompt = prompt.trim();
      agent.simulatorMode = simulatorMode;
      return {
        config: {
          AGENT_DOC_ID: agentId,
          AGENT_LONG_LIVED_TOKEN: DEFAULT_TOKEN,
          AGENT_PHONE_NUMBER_ID: DEFAULT_PHONE_ID,
        },
        agent,
        enableTools: true,
        stream,
        testingMode: testMode,
      };
    },
    [agentId, messageLimit, simulatorMode, stream, testMode]
  );

  const abortRef = useRef<Record<string, AbortController>>({});

  useEffect(() => {
    let cancelled = false;
    skipNextPersistRef.current = true;
    setIsHistoryLoading(true);

    (async () => {
      const data = await fetchSimulatorState(agentId);
      if (cancelled) return;
      if (Array.isArray(data?.conversations) && data.conversations.length > 0) {
        setConversations(
          ensureAtLeastOneOpenConversation(
            data.conversations.map((conversation) =>
              inflateConversationFromStorage(conversation),
            ),
          ),
        );
      } else {
        setConversations([createEmptyConversation()]);
      }
      setIsHistoryLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [agentId]);

  useEffect(() => {
    if (isHistoryLoading) return;
    if (skipNextPersistRef.current) {
      skipNextPersistRef.current = false;
      return;
    }
    if (saveDebounceRef.current) {
      clearTimeout(saveDebounceRef.current);
    }

    saveDebounceRef.current = setTimeout(async () => {
      const payload = conversations
        .filter((conversation) => isConversationMeaningful(conversation))
        .map((conversation) => normalizeConversationForStorage(conversation));
      const result = await patchSimulatorState(agentId, payload);
      if (!result.ok) {
        toast.error(result.error);
      }
    }, 450);

    return () => {
      if (saveDebounceRef.current) {
        clearTimeout(saveDebounceRef.current);
        saveDebounceRef.current = null;
      }
    };
  }, [agentId, conversations, isHistoryLoading]);

  useEffect(() => {
    return () => {
      Object.values(abortRef.current).forEach((controller) => controller.abort());
      abortRef.current = {};
    };
  }, []);

  const sendRequest = useCallback(
    async (convId: string) => {
      const conv = conversations.find((c) => c.id === convId);
      if (!conv) return;

      const body = buildBody(conv.prompt);
      if (!body) return;

      const controller = new AbortController();
      abortRef.current[convId] = controller;

      setConversations((prev) =>
        prev.map((c) =>
          c.id === convId ? { ...c, error: null, streamEvents: [], isSending: true, currentTurn: "user" } : c
        )
      );

      try {
        const response = await postAgentsTestingSimulate(
          body as unknown as Record<string, unknown>,
          controller.signal,
        );
        if (!response.ok) {
          const errBody = await response.json().catch(() => ({}));
          const msg = (errBody as { error?: string }).error ?? response.statusText;
          setConversations((prev) =>
            prev.map((c) =>
              c.id === convId ? { ...c, error: msg, isSending: false } : c
            )
          );
          toast.error(msg);
          return;
        }
        if (stream) {
          const contentType = response.headers.get("content-type") ?? "";
          if (contentType.includes("text/event-stream") && response.body) {
            await parseSSEStream(response.body, (ev: SSEEvent) => {
              let newTurn: "user" | "agent" | null = null;
              if (ev.type === "message" && ev.data?.role) {
                newTurn = ev.data.role === "user" ? "agent" : "user";
              }
              setConversations((prev) =>
                prev.map((c) =>
                  c.id === convId
                    ? { ...c, streamEvents: [...c.streamEvents, ev], currentTurn: newTurn ?? c.currentTurn }
                    : c
                )
              );
            });
            setConversations((prev) =>
              prev.map((c) => (c.id === convId ? { ...c, isSending: false } : c))
            );
            return;
          }
          const data = await response.json();
          setConversations((prev) =>
            prev.map((c) =>
              c.id === convId
                ? {
                    ...c,
                    streamEvents: [
                      { type: "message", data: { content: JSON.stringify(data) } },
                    ],
                    isSending: false,
                  }
                : c
            )
          );
          return;
        }
        const data = await response.json();
        setConversations((prev) =>
          prev.map((c) =>
            c.id === convId
              ? {
                  ...c,
                  streamEvents: [
                    { type: "message", data: { content: JSON.stringify(data) } },
                  ],
                  isSending: false,
                }
              : c
          )
        );
      } catch (e) {
        if (e instanceof DOMException && e.name === "AbortError") {
          setConversations((prev) =>
            prev.map((c) =>
              c.id === convId ? { ...c, isSending: false } : c
            )
          );
          return;
        }
        const message = e instanceof Error ? e.message : "Error de red";
        setConversations((prev) =>
          prev.map((c) =>
            c.id === convId ? { ...c, error: message, isSending: false } : c
          )
        );
        toast.error(message);
      }
    },
    [conversations, buildBody, stream]
  );

  const stopRequest = useCallback((convId: string) => {
    const controller = abortRef.current[convId];
    if (controller) {
      controller.abort();
      delete abortRef.current[convId];
    }
  }, []);

  const resetConversation = useCallback((convId: string) => {
    setConversations((prev) =>
      prev.map((c) =>
        c.id === convId
          ? { ...c, streamEvents: [], error: null }
          : c
      )
    );
  }, []);

  const removeConversation = useCallback((convId: string) => {
    setConversations((prev) =>
      ensureAtLeastOneOpenConversation(prev.filter((c) => c.id !== convId)),
    );
  }, []);

  const closeConversation = useCallback((convId: string) => {
    const controller = abortRef.current[convId];
    if (controller) {
      controller.abort();
      delete abortRef.current[convId];
    }
    setConversations((prev) =>
      ensureAtLeastOneOpenConversation(
        prev.map((c) =>
          c.id === convId
            ? {
                ...c,
                isSending: false,
                currentTurn: null,
                closedAt: c.closedAt ?? new Date().toISOString(),
              }
            : c,
        ),
      ),
    );
  }, []);

  const reopenConversation = useCallback((convId: string) => {
    setConversations((prev) =>
      prev.map((c) =>
        c.id === convId
          ? {
              ...c,
              closedAt: null,
            }
          : c,
      ),
    );
  }, []);

  const addConversation = () => {
    setConversations((prev) => [
      ...prev,
      createEmptyConversation(),
    ]);
  };

  const clearAllHistory = useCallback(async () => {
    Object.values(abortRef.current).forEach((controller) => controller.abort());
    abortRef.current = {};
    const result = await deleteSimulatorState(agentId);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    skipNextPersistRef.current = true;
    setConversations([createEmptyConversation()]);
    toast.success("Historial eliminado");
  }, [agentId]);

  return (
    <div className="flex h-full w-full flex-col">
      <div className="flex items-center justify-between py-2">
        <h2 className="text-lg font-semibold">Simulador de Agente</h2>
        <div className="flex items-center gap-2">
          <Dialog open={isHistoryDialogOpen} onOpenChange={setIsHistoryDialogOpen}>
            <Tooltip>
              <TooltipTrigger asChild>
                <DialogTrigger asChild>
                  <Button variant="outline" size="icon">
                    <HistoryIcon className="h-4 w-4" />
                  </Button>
                </DialogTrigger>
              </TooltipTrigger>
              <TooltipContent>
                <p>Historial</p>
              </TooltipContent>
            </Tooltip>
            <DialogContent className="sm:max-w-xl">
              <DialogHeader>
                <DialogTitle>Historial del simulador</DialogTitle>
                <DialogDescription>
                  Administra las conversaciones guardadas para este agente.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-3">
                <div className="max-h-[380px] space-y-2 overflow-y-auto rounded-md border border-border/60 p-2">
                  {isHistoryLoading ? (
                    <p className="text-sm text-muted-foreground">Cargando historial...</p>
                  ) : historyConversations.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No hay conversaciones guardadas.</p>
                  ) : (
                    historyConversations.map((conversation, index) => (
                      <div
                        key={conversation.id}
                        className="flex items-start justify-between gap-3 rounded-md border border-border/60 bg-muted/20 px-3 py-2"
                      >
                        <div className="min-w-0">
                          <p className="text-sm font-medium">
                            Conversación {index + 1}
                          </p>
                          <p className="line-clamp-2 text-xs text-muted-foreground">
                            {conversation.prompt.trim() || "Sin instrucción"}
                          </p>
                          <p className="mt-1 text-[11px] text-muted-foreground">
                            Eventos: {conversation.streamEvents.length}
                          </p>
                          <p className="text-[11px] text-muted-foreground">
                            Estado: {conversation.closedAt ? "Cerrada" : "Activa"}
                          </p>
                        </div>
                        <div className="flex items-center gap-1">
                          {conversation.closedAt && (
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => reopenConversation(conversation.id)}
                              disabled={isHistoryLoading}
                            >
                              Abrir
                            </Button>
                          )}
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="text-muted-foreground hover:text-destructive"
                                disabled={isHistoryLoading}
                                aria-label="Eliminar conversación del historial"
                              >
                                <Trash2Icon className="h-4 w-4" />
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>¿Eliminar esta conversación?</AlertDialogTitle>
                                <AlertDialogDescription>
                                  Esta acción eliminará la conversación del historial.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                <AlertDialogAction
                                  onClick={() => removeConversation(conversation.id)}
                                >
                                  Eliminar
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </div>
                      </div>
                    ))
                  )}
                </div>
                <div className="flex items-center justify-end">
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button
                        type="button"
                        variant="destructive"
                        size="sm"
                        disabled={isHistoryLoading || historyConversations.length === 0}
                      >
                        Eliminar todo el historial
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>¿Eliminar todo el historial?</AlertDialogTitle>
                        <AlertDialogDescription>
                          Esta acción borrará todas las conversaciones guardadas de este simulador para tu usuario.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancelar</AlertDialogCancel>
                        <AlertDialogAction
                          onClick={() => {
                            void clearAllHistory();
                            setIsHistoryDialogOpen(false);
                          }}
                        >
                          Eliminar
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              </div>
            </DialogContent>
          </Dialog>

          <Dialog>
            <Tooltip>
              <TooltipTrigger asChild>
                <DialogTrigger asChild>
                  <Button variant="outline" size="icon">
                    <Settings2Icon className="h-4 w-4" />
                  </Button>
                </DialogTrigger>
              </TooltipTrigger>
              <TooltipContent>
                <p>Editar parámetros</p>
              </TooltipContent>
            </Tooltip>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle>Parámetros de simulación</DialogTitle>
                <DialogDescription>
                  Configura cómo quieres hacer la prueba. Estos parámetros se aplican a todas las conversaciones.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-2">
                <div className="space-y-1">
                  <Label htmlFor="sim-limit">
                    Cantidad máxima de mensajes: {messageLimit}
                  </Label>
                  <Slider
                    id="sim-limit"
                    min={1}
                    max={MESSAGE_LIMIT_MAX}
                    step={1}
                    value={[Number(messageLimit)]}
                    onValueChange={(v: number[]) => setMessageLimit(String(v[0]))}
                  />
                  <p className="text-xs text-muted-foreground">
                    Desliza para ajustar la duración de la conversación. Recomendado: 10–20 para conversaciones completas.
                  </p>
                </div>
                <div className="space-y-1">
                  <Label>Tipo de simulación</Label>
                  <Select
                    value={simulatorMode}
                    onValueChange={(v: string) => setSimulatorMode(v as SimulatorMode)}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="questions_only">Solo preguntas</SelectItem>
                      <SelectItem value="full">Conversación completa</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    "Solo preguntas" hace una prueba breve. "Conversación completa"
                    intenta una prueba más amplia.
                  </p>
                </div>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={stream}
                    onChange={(e) => setStream(e.target.checked)}
                  />
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span className="cursor-help">
                        Ver respuestas en tiempo real (se muestran a medida que van llegando)
                      </span>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>Stream (SSE)</p>
                    </TooltipContent>
                  </Tooltip>
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={testMode}
                    onChange={(e) => setTestMode(e.target.checked)}
                  />
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span className="cursor-help">
                        Modo de prueba segura (evita acciones reales y usa entorno de prueba)
                      </span>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>Modo testing</p>
                    </TooltipContent>
                  </Tooltip>
                </label>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 items-stretch gap-4 overflow-x-auto pb-4">
        {visibleConversations.map((conv, index) => (
          <div key={conv.id} className="flex w-[540px] flex-shrink-0 flex-col">
            <ConversationCard
              index={index}
              conversation={conv}
              onSend={() => sendRequest(conv.id)}
              onStop={() => stopRequest(conv.id)}
              onClose={() => closeConversation(conv.id)}
              onReset={() => resetConversation(conv.id)}
              onRemove={() => removeConversation(conv.id)}
              canRemove={visibleConversations.length > 1}
              canClose={true}
              onUpdatePrompt={(prompt) =>
                setConversations((prev) =>
                  prev.map((c) => (c.id === conv.id ? { ...c, prompt } : c))
                )
              }
            />
          </div>
        ))}

        <Button
          type="button"
          variant="outline"
          onClick={addConversation}
          className="h-auto min-h-full min-w-[160px] shrink-0 flex-col gap-2 border-dashed py-8"
        >
          <PlusIcon className="h-6 w-6" />
          <span>Agregar conversación</span>
        </Button>
      </div>
    </div>
  );
}
