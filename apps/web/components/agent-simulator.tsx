"use client";

import { useCallback, useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
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
  BotIcon,
  CheckCircle2Icon,
  ChevronRightIcon,
  Loader2Icon,
  PlayIcon,
  RotateCcwIcon,
  User2Icon,
} from "lucide-react";
import { postAgentsTestingSimulate } from "@/lib/agents-api";
import type {
  SimulateBody,
  SimulatorMode,
  SSEEvent,
} from "@/types/integration-simulator";
import { parseSSEStream } from "@/utils/integration-sse";

const DEFAULT_TOKEN = "test-whatsapp-token";
const DEFAULT_PHONE_ID = "test-phone-number-id";
const MESSAGE_LIMIT_MAX = 25;

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
                    Ver respuesta de la tool
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
            Summary
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
          Evento de personalidad
        </p>
        <AnalysisCards summary={summary} notes={notes} />
        <details className="group mt-2">
          <summary className="flex cursor-pointer list-none items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground">
            <ChevronRightIcon className="h-3.5 w-3.5 transition-transform group-open:rotate-90" />
            Ver payload completo
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
            Ver llamadas a tools ({event.data.functionCalls?.length})
          </summary>
          <ToolCallsBlock functionCalls={event.data.functionCalls ?? []} />
        </details>
      )}
    </div>
  );
}

export function AgentSimulator({
  agentId,
}: {
  agentId: string;
}) {
  const [messageLimit, setMessageLimit] = useState<string>("1");
  const [prompt, setPrompt] = useState("");
  const [simulatorMode, setSimulatorMode] =
    useState<SimulatorMode>("questions_only");
  const [enableTools, setEnableTools] = useState(false);
  const [stream, setStream] = useState(true);
  const [testMode, setTestMode] = useState(false);

  const [isSending, setIsSending] = useState(false);
  const [streamEvents, setStreamEvents] = useState<SSEEvent[]>([]);
  const [error, setError] = useState<string | null>(null);

  const body = useMemo((): SimulateBody | null => {
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
      enableTools,
      stream,
      testingMode: testMode,
    };
  }, [
    agentId,
    messageLimit,
    prompt,
    simulatorMode,
    enableTools,
    stream,
    testMode,
  ]);

  const sendRequest = useCallback(async () => {
    if (!body) return;
    setError(null);
    setStreamEvents([]);
    setIsSending(true);
    try {
      const response = await postAgentsTestingSimulate(
        body as unknown as Record<string, unknown>,
      );
      if (!response.ok) {
        const errBody = await response.json().catch(() => ({}));
        const msg = (errBody as { error?: string }).error ?? response.statusText;
        setError(msg);
        toast.error(msg);
        return;
      }
      if (stream) {
        const contentType = response.headers.get("content-type") ?? "";
        if (contentType.includes("text/event-stream") && response.body) {
          await parseSSEStream(response.body, (ev) => {
            setStreamEvents((prev) => [...prev, ev]);
          });
          return;
        }
        const data = await response.json();
        setStreamEvents([{ type: "message", data: { content: JSON.stringify(data) } }]);
        return;
      }
      const data = await response.json();
      setStreamEvents([{ type: "message", data: { content: JSON.stringify(data) } }]);
    } catch (e) {
      const message = e instanceof Error ? e.message : "Error de red";
      setError(message);
      toast.error(message);
    } finally {
      setIsSending(false);
    }
  }, [body, stream]);

  const resetOutput = () => {
    setStreamEvents([]);
    setError(null);
  };

  return (
    <div className="h-full w-full">
      <div className="grid h-full w-full gap-4 md:grid-cols-2">
        <Card className="flex h-full min-h-0 flex-col overflow-hidden">
          <CardHeader>
            <CardTitle className="text-base">Parámetros</CardTitle>
            <CardDescription>
              Configura la simulación y, si quieres, agrega instrucciones
              temporales para esta corrida.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex-1 min-h-0 space-y-3 overflow-y-auto">
            <div className="space-y-1">
              <Label htmlFor="sim-limit">Límite de mensajes (1–{MESSAGE_LIMIT_MAX})</Label>
              <Input
                id="sim-limit"
                type="number"
                min={1}
                max={MESSAGE_LIMIT_MAX}
                value={messageLimit}
                onChange={(e) => setMessageLimit(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label>Modo simulador</Label>
              <Select
                value={simulatorMode}
                onValueChange={(v) => setSimulatorMode(v as SimulatorMode)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="questions_only">Solo preguntas</SelectItem>
                  <SelectItem value="full">Completo</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={enableTools}
                onChange={(e) => setEnableTools(e.target.checked)}
              />
              Habilitar tools
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={stream}
                onChange={(e) => setStream(e.target.checked)}
              />
              Stream (SSE)
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={testMode}
                onChange={(e) => setTestMode(e.target.checked)}
              />
              Modo testing
            </label>
            <div className="space-y-1">
              <Label htmlFor="sim-prompt">
                Prompt adicional de simulación (opcional)
              </Label>
              <Textarea
                id="sim-prompt"
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                rows={4}
                className="font-mono text-xs"
                placeholder="Instrucciones temporales para esta prueba. No reemplaza el prompt base del agente."
              />
            </div>
            <div className="flex flex-wrap gap-2 pt-2">
              <Button
                type="button"
                onClick={sendRequest}
                disabled={isSending}
                className="gap-2"
              >
                {isSending ? (
                  <Loader2Icon className="h-4 w-4 animate-spin" />
                ) : (
                  <PlayIcon className="h-4 w-4" />
                )}
                Ejecutar simulación
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={resetOutput}
                disabled={isSending}
                className="gap-2"
              >
                <RotateCcwIcon className="h-4 w-4" />
                Limpiar salida
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card className="flex h-full min-h-0 flex-col overflow-hidden">
          <CardHeader>
            <CardTitle className="text-base">Resultado</CardTitle>
            <CardDescription>
              Eventos stream o respuesta (sin vista de body JSON crudo).
            </CardDescription>
          </CardHeader>
          <CardContent className="flex min-h-0 flex-1 flex-col overflow-y-auto text-sm">
            {error && (
              <div className="mb-3 rounded-md bg-destructive/10 p-3 text-destructive">
                <p className="whitespace-pre-wrap">{error}</p>
              </div>
            )}
            {streamEvents.length === 0 && !error && !isSending ? (
              <p className="text-muted-foreground">Aún no hay resultados.</p>
            ) : (
              <ul className="space-y-3">
                {streamEvents.map((ev, i) => (
                  <li key={i}>
                    <ResultEventCard event={ev} />
                  </li>
                ))}
              </ul>
            )}
            {isSending && (
              <p className="flex items-center gap-2 text-muted-foreground mt-2">
                <Loader2Icon className="h-4 w-4 animate-spin" />
                Enviando…
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
