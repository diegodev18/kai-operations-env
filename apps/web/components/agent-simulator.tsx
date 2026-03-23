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
import { Loader2Icon, PlayIcon, RotateCcwIcon } from "lucide-react";
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
          <CardContent className="flex-1 min-h-0 overflow-y-auto text-sm">
            {error && (
              <p className="text-destructive whitespace-pre-wrap mb-2">{error}</p>
            )}
            {streamEvents.length === 0 && !error && !isSending ? (
              <p className="text-muted-foreground">Aún no hay resultados.</p>
            ) : (
              <ul className="space-y-3">
                {streamEvents.map((ev, i) => (
                  <li key={i} className="rounded-md border p-2 text-xs font-mono break-all">
                    <span className="text-muted-foreground">{ev.type}</span>
                    <pre className="mt-1 whitespace-pre-wrap text-[11px] leading-relaxed">
                      {JSON.stringify(ev, null, 0)}
                    </pre>
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
