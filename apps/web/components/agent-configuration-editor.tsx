"use client";

import type {
  AgentPropertiesResponse,
  PropertyDocumentId,
} from "@/types/agent-properties";
import {
  useAgentProperties,
  updateAgentPropertyDocument,
} from "@/hooks/agent-properties";
import type { ReactNode } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  Loader2Icon,
  ChevronDownIcon,
  ChevronRightIcon,
  FileEditIcon,
  PowerIcon,
  PowerOffIcon,
} from "lucide-react";
import { PROPERTY_DESCRIPTIONS, PROPERTY_TITLES } from "@/lib/property-descriptions";
import { cn } from "@/lib/utils";

const DOCUMENT_IDS: PropertyDocumentId[] = [
  "agent",
  "ai",
  "answer",
  "response",
  "time",
  "prompt",
  "memory",
  "mcp",
];

const DEFAULT_LLM_MODEL = "gemini-2.5-flash";

const AGENT_LLM_MODELS = [
  "gemini-2.5-flash",
  "gemini-2.5-pro",
  "gemini-3-flash-preview",
  "gemini-3.1-flash-lite-preview",
] as const;

/** Default temperature by model family when not set in properties. gemini-3* → 0.25, gemini-2.5* → 0.05. */
function getDefaultTemperatureForModel(model: string): number {
  if (/gemini-3/i.test(model)) return 0.25;
  if (/gemini-2\.5/i.test(model)) return 0.05;
  return 0.05;
}

const DOCUMENT_LABELS: Record<PropertyDocumentId, string> = {
  agent: "Comportamiento general",
  ai: "AI (thinking)",
  answer: "Mensajes predefinidos",
  response: "Tiempo de espera",
  time: "Zona horaria",
  prompt: "Prompts y LLM",
  memory: "Memoria",
  mcp: "Validador (MCP)",
};

function FieldLabel({
  id,
  docId,
  fieldKey,
  children,
}: {
  id: string;
  docId: string;
  fieldKey: string;
  children?: ReactNode;
}) {
  const title =
    PROPERTY_TITLES[docId]?.[fieldKey] ??
    PROPERTY_TITLES[docId]?.[fieldKey.replace(".", "_")] ??
    children;
  const desc =
    PROPERTY_DESCRIPTIONS[docId]?.[fieldKey] ??
    PROPERTY_DESCRIPTIONS[docId]?.[fieldKey.replace(".", "_")];
  return (
    <div className="space-y-1">
      <Label htmlFor={id}>{title}</Label>
      {desc && (
        <p className="text-xs text-muted-foreground font-normal">{desc}</p>
      )}
    </div>
  );
}

function payloadsEqual(a: Record<string, unknown>, b: Record<string, unknown>): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

function valueEquals(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

function getPendingDocumentIds(
  formState: AgentPropertiesResponse,
  originalData: AgentPropertiesResponse | null
): PropertyDocumentId[] {
  if (!originalData) return [];
  return DOCUMENT_IDS.filter((docId) => {
    const payloadForm = buildPayloadForDocument(docId, formState);
    const payloadOriginal = buildPayloadForDocument(docId, originalData);
    return !payloadsEqual(payloadForm, payloadOriginal);
  });
}
function PendingChangesPanel({
  formState,
  originalData,
  className,
}: {
  formState: AgentPropertiesResponse;
  originalData: AgentPropertiesResponse;
  className?: string;
}) {
  const [expanded, setExpanded] = useState(true);
  const pendingIds = useMemo(
    () => getPendingDocumentIds(formState, originalData),
    [formState, originalData]
  );

  if (pendingIds.length === 0) return null;

  return (
    <div className={cn("space-y-2", className)}>
      <button
        type="button"
        onClick={() => setExpanded((e) => !e)}
        className="flex items-center gap-2 w-full text-left text-sm text-muted-foreground hover:text-foreground transition-colors"
        aria-expanded={expanded}
      >
        {expanded ? (
          <ChevronDownIcon className="w-4 h-4 shrink-0" />
        ) : (
          <ChevronRightIcon className="w-4 h-4 shrink-0" />
        )}
        <span className="font-medium">
          {pendingIds.length} {pendingIds.length === 1 ? "documento" : "documentos"} con cambios
        </span>
      </button>
      {expanded && (
        <div className="rounded-md border bg-muted/30 py-2 px-3 space-y-1.5 max-h-32 overflow-y-auto">
          {pendingIds.map((docId) => (
            <div
              key={docId}
              className="flex items-center gap-2 text-sm text-foreground"
            >
              <FileEditIcon className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
              <span>{DOCUMENT_LABELS[docId]}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function AgentConfigurationEditor({
  agentId,
  agentName,
  onAgentUpdated,
}: {
  agentId: string;
  agentName?: string;
  onAgentUpdated?: () => void;
}) {
  const { data, isLoading, refetch } = useAgentProperties(agentId);
  const [formState, setFormState] = useState<AgentPropertiesResponse | null>(
    null
  );
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (data) {
      const next = JSON.parse(JSON.stringify(data)) as AgentPropertiesResponse;
      // Hydrate ai.model and ai.temperature from data.ai (source of truth), fallback to data.prompt
      if (next.ai) {
        next.ai.model =
          next.ai.model ??
          (data.prompt?.model as string | undefined) ??
          DEFAULT_LLM_MODEL;
        next.ai.temperature =
          next.ai.temperature !== undefined && next.ai.temperature !== null
            ? Number(next.ai.temperature)
            : (data.prompt?.temperature !== undefined &&
              data.prompt?.temperature !== null
                ? Number(data.prompt.temperature)
                : getDefaultTemperatureForModel(next.ai.model ?? DEFAULT_LLM_MODEL));
      }
      setFormState(next);
    } else setFormState(null);
  }, [data]);

  const update = useCallback(
    <K extends keyof AgentPropertiesResponse>(
      docId: K,
      updater: (prev: AgentPropertiesResponse[K]) => AgentPropertiesResponse[K]
    ) => {
      setFormState((prev) => {
        if (!prev) return prev;
        return { ...prev, [docId]: updater(prev[docId]) };
      });
    },
    []
  );

  const handleSave = useCallback(async () => {
    if (!agentId || !formState || !data) return;
    const idsToSave = getPendingDocumentIds(formState, data);
    if (idsToSave.length === 0) return;
    setSaving(true);
    try {
      let ok = true;
      for (const docId of idsToSave) {
        const payload = buildPartialPayloadForDocument(docId, formState, data);
        if (Object.keys(payload).length === 0) continue;
        const success = await updateAgentPropertyDocument(
          agentId,
          docId,
          payload,
        );
        if (!success) ok = false;
      }
      if (ok) {
        toast.success("Propiedades guardadas");
        refetch();
      }
    } finally {
      setSaving(false);
    }
  }, [agentId, formState, data, refetch]);

  const isEnabled = formState?.agent.enabled !== false;

  const handleToggleEnabled = useCallback(async () => {
    if (!agentId || !formState) return;
    const newEnabled = !isEnabled;
    setSaving(true);
    try {
      const success = await updateAgentPropertyDocument(
        agentId,
        "agent",
        { enabled: newEnabled },
      );
      if (success) {
        update("agent", (prev) => ({ ...prev, enabled: newEnabled }));
        refetch();
        await onAgentUpdated?.();
        toast.success(newEnabled ? "Agente encendido" : "Agente apagado");
      }
    } finally {
      setSaving(false);
    }
  }, [agentId, formState, isEnabled, update, refetch, onAgentUpdated]);

  if (!agentId) return null;

  return (
    <div className="flex flex-col gap-4 w-full max-w-3xl mx-auto min-h-0">
      <div className="shrink-0 space-y-1">
        <h2 className="text-lg font-semibold">
          Propiedades de {agentName || agentId}
        </h2>
        <p className="text-sm text-muted-foreground">
          Editá los documentos de configuración. Guardá los cambios pendientes abajo.
        </p>
      </div>

        <div className="min-h-0 overflow-hidden grid grid-rows-[1fr] max-h-[min(70vh,720px)] border rounded-lg">
          <div className="min-h-0 overflow-y-auto overflow-x-hidden pr-2 space-y-4">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2Icon className="w-8 h-8 animate-spin text-muted-foreground" />
            </div>
          ) : formState ? (
            <>
              {/* Agent */}
              <section className="space-y-3 rounded-lg border p-4">
                <h3 className="font-medium">{DOCUMENT_LABELS.agent}</h3>
                <div className="grid gap-3">
                  {(
                    [
                      "isAuthEnable",
                      "injectCommandsInPrompt",
                      "isMemoryEnable",
                      "isMultiMessageEnable",
                      "isMultiMessageResponseEnable",
                      "omitFirstEchoes",
                      "isValidatorAgentEnable",
                    ] as const
                  ).map((key) => (
                    <div key={key} className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        id={`agent-${key}`}
                        checked={!!formState.agent[key]}
                        onChange={(e) =>
                          update("agent", (prev) => ({
                            ...prev,
                            [key]: e.target.checked,
                          }))
                        }
                        className="h-4 w-4 rounded border-input"
                      />
                      <FieldLabel docId="agent" fieldKey={key} id={`agent-${key}`} />
                    </div>
                  ))}
                  <div className="space-y-2">
                    <FieldLabel
                      docId="agent"
                      fieldKey="maxFunctionCalls"
                      id="agent-maxFunctionCalls"
                    />
                    <Input
                      id="agent-maxFunctionCalls"
                      type="number"
                      min={1}
                      max={8}
                      value={formState.agent.maxFunctionCalls ?? 4}
                      onChange={(e) => {
                        const v = parseInt(e.target.value, 10);
                        const clamped = Number.isFinite(v)
                          ? Math.min(8, Math.max(1, v))
                          : 4;
                        update("agent", (prev) => ({
                          ...prev,
                          maxFunctionCalls: clamped,
                        }));
                      }}
                    />
                  </div>
                  <div className="space-y-2">
                    <FieldLabel
                      docId="agent"
                      fieldKey="excludedNumbers"
                      id="agent-excludedNumbers"
                    />
                    <Textarea
                      id="agent-excludedNumbers"
                      value={(formState.agent.excludedNumbers ?? []).join("\n")}
                      onChange={(e) =>
                        update("agent", (prev) => ({
                          ...prev,
                          excludedNumbers: e.target.value
                            .split("\n")
                            .map((s) => s.trim())
                            .filter(Boolean),
                        }))
                      }
                      placeholder="Un número por línea"
                      rows={3}
                      className="font-mono text-sm"
                    />
                  </div>
                </div>
              </section>

              {/* Answer */}
              <section className="space-y-3 rounded-lg border p-4">
                <h3 className="font-medium">{DOCUMENT_LABELS.answer}</h3>
                <div className="space-y-2">
                  <FieldLabel docId="answer" fieldKey="notSupport" id="answer-notSupport" />
                  <Input
                    id="answer-notSupport"
                    value={formState.answer.notSupport ?? ""}
                    onChange={(e) =>
                      update("answer", (prev) => ({
                        ...prev,
                        notSupport: e.target.value,
                      }))
                    }
                    placeholder="Hola súper! Cómo te llamas?"
                  />
                </div>
              </section>

              {/* AI (thinking) - model and temperature are source of truth here */}
              <section className="space-y-3 rounded-lg border p-4">
                <h3 className="font-medium">{DOCUMENT_LABELS.ai}</h3>
                <div className="space-y-3">
                  <div className="space-y-2">
                    <FieldLabel
                      docId="ai"
                      fieldKey="model"
                      id="ai-model"
                    />
                    <Select
                      value={
                        formState.ai?.model &&
                        AGENT_LLM_MODELS.includes(
                          formState.ai.model as (typeof AGENT_LLM_MODELS)[number]
                        )
                          ? formState.ai.model
                          : DEFAULT_LLM_MODEL
                      }
                      onValueChange={(value) =>
                        update("ai", (prev) => ({ ...prev, model: value }))
                      }
                    >
                      <SelectTrigger id="ai-model" className="w-full">
                        <SelectValue placeholder="Selecciona el modelo" />
                      </SelectTrigger>
                      <SelectContent>
                        {AGENT_LLM_MODELS.map((modelId) => (
                          <SelectItem key={modelId} value={modelId}>
                            {modelId}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <FieldLabel
                      docId="ai"
                      fieldKey="temperature"
                      id="ai-temperature"
                    />
                    <Input
                      id="ai-temperature"
                      type="number"
                      min={0}
                      max={1}
                      step={0.05}
                      value={
                        formState.ai?.temperature !== undefined &&
                        formState.ai?.temperature !== null
                          ? Number(formState.ai.temperature)
                          : getDefaultTemperatureForModel(
                              formState.ai?.model ?? DEFAULT_LLM_MODEL
                            )
                      }
                      onChange={(e) => {
                        const v = parseFloat(e.target.value);
                        const defaultTemp = getDefaultTemperatureForModel(
                          formState.ai?.model ?? DEFAULT_LLM_MODEL
                        );
                        const clamped = Number.isFinite(v)
                          ? Math.min(1, Math.max(0, v))
                          : defaultTemp;
                        update("ai", (prev) => ({
                          ...prev,
                          temperature: clamped,
                        }));
                      }}
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      id="ai-thinking-includeThoughts"
                      checked={!!formState.ai?.thinking?.includeThoughts}
                      onChange={(e) =>
                        update("ai", (prev) => ({
                          ...prev,
                          thinking: {
                            budget: prev.thinking?.budget,
                            includeThoughts: e.target.checked,
                            level: prev.thinking?.level ?? "",
                          },
                        }))
                      }
                      className="h-4 w-4 rounded border-input"
                    />
                    <FieldLabel
                      docId="ai"
                      fieldKey="thinking.includeThoughts"
                      id="ai-thinking-includeThoughts"
                    />
                  </div>
                  <div className="space-y-2">
                    <FieldLabel
                      docId="ai"
                      fieldKey="thinking.level"
                      id="ai-thinking-level"
                    />
                    <Select
                      value={
                        formState.ai?.thinking?.level &&
                        ["minimal", "low", "medium", "high"].includes(
                          formState.ai.thinking.level
                        )
                          ? formState.ai.thinking.level
                          : "__none__"
                      }
                      onValueChange={(value) =>
                        update("ai", (prev) => ({
                          ...prev,
                          thinking: {
                            budget: prev.thinking?.budget,
                            includeThoughts: prev.thinking?.includeThoughts ?? false,
                            level: value === "__none__" ? "" : value,
                          },
                        }))
                      }
                    >
                      <SelectTrigger id="ai-thinking-level" className="w-full">
                        <SelectValue placeholder="Sin especificar" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">Sin especificar</SelectItem>
                        <SelectItem value="minimal">Minimal</SelectItem>
                        <SelectItem value="low">Low</SelectItem>
                        <SelectItem value="medium">Medium</SelectItem>
                        <SelectItem value="high">High</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <FieldLabel
                      docId="ai"
                      fieldKey="thinking.budget"
                      id="ai-thinking-budget"
                    />
                    <Input
                      id="ai-thinking-budget"
                      type="number"
                      min={-1}
                      value={
                        formState.ai?.thinking?.budget !== undefined &&
                        formState.ai?.thinking?.budget !== null
                          ? formState.ai.thinking.budget
                          : ""
                      }
                      onChange={(e) => {
                        const raw = e.target.value;
                        if (raw === "" || raw === null || raw === undefined) {
                          update("ai", (prev) => ({
                            ...prev,
                            thinking: {
                              budget: undefined,
                              includeThoughts: prev.thinking?.includeThoughts ?? false,
                              level: prev.thinking?.level ?? "",
                            },
                          }));
                          return;
                        }
                        const v = parseInt(raw, 10);
                        const budget = Number.isFinite(v) ? v : undefined;
                        update("ai", (prev) => ({
                          ...prev,
                          thinking: {
                            budget,
                            includeThoughts: prev.thinking?.includeThoughts ?? false,
                            level: prev.thinking?.level ?? "",
                          },
                        }));
                      }}
                      placeholder="-1 = automático, 0 = desactivado, &gt;0 = tokens"
                    />
                    <p className="text-xs text-muted-foreground">
                      0 = desactivado, -1 = automático, número positivo = tokens
                    </p>
                  </div>
                </div>
              </section>

              {/* Response */}
              <section className="space-y-3 rounded-lg border p-4">
                <h3 className="font-medium">{DOCUMENT_LABELS.response}</h3>
                <div className="space-y-3">
                  <div className="space-y-2">
                    <FieldLabel docId="response" fieldKey="waitTime" id="response-waitTime" />
                    <Input
                      id="response-waitTime"
                      type="number"
                      min={0}
                      value={formState.response.waitTime ?? 3}
                      onChange={(e) =>
                        update("response", (prev) => ({
                          ...prev,
                          waitTime: parseInt(e.target.value, 10) || 0,
                        }))
                      }
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      id="response-maxResponseLinesEnabled"
                      checked={!!formState.response.maxResponseLinesEnabled}
                      onChange={(e) =>
                        update("response", (prev) => ({
                          ...prev,
                          maxResponseLinesEnabled: e.target.checked,
                        }))
                      }
                      className="h-4 w-4 rounded border-input"
                    />
                    <FieldLabel
                      docId="response"
                      fieldKey="maxResponseLinesEnabled"
                      id="response-maxResponseLinesEnabled"
                    />
                  </div>
                  {formState.response.maxResponseLinesEnabled && (
                    <div className="space-y-2">
                      <FieldLabel
                        docId="response"
                        fieldKey="maxResponseLines"
                        id="response-maxResponseLines"
                      />
                      <Input
                        id="response-maxResponseLines"
                        type="number"
                        min={1}
                        value={formState.response.maxResponseLines ?? 50}
                        onChange={(e) =>
                          update("response", (prev) => ({
                            ...prev,
                            maxResponseLines: Math.max(
                              1,
                              parseInt(e.target.value, 10) || 50
                            ),
                          }))
                        }
                      />
                    </div>
                  )}
                </div>
              </section>

              {/* Time */}
              <section className="space-y-3 rounded-lg border p-4">
                <h3 className="font-medium">{DOCUMENT_LABELS.time}</h3>
                <div className="space-y-2">
                  <FieldLabel docId="time" fieldKey="zone" id="time-zone" />
                  <Input
                    id="time-zone"
                    value={formState.time.zone ?? ""}
                    onChange={(e) =>
                      update("time", (prev) => ({ ...prev, zone: e.target.value }))
                    }
                    placeholder="America/Mexico_City"
                  />
                </div>
              </section>

              {/* Prompt */}
              <section className="space-y-3 rounded-lg border p-4">
                <h3 className="font-medium">{DOCUMENT_LABELS.prompt}</h3>
                <div className="space-y-3">
                  <div className="space-y-2">
                    <FieldLabel
                      docId="prompt"
                      fieldKey="auth.auth"
                      id="prompt-auth-auth"
                    />
                    <Textarea
                      id="prompt-auth-auth"
                      value={formState.prompt.auth?.auth ?? ""}
                      onChange={(e) =>
                        update("prompt", (prev) => ({
                          ...prev,
                          auth: {
                            ...prev.auth,
                            auth: e.target.value,
                            unauth: prev.auth?.unauth ?? "",
                          },
                        }))
                      }
                      rows={2}
                      className="font-mono text-sm"
                    />
                  </div>
                  <div className="space-y-2">
                    <FieldLabel
                      docId="prompt"
                      fieldKey="auth.unauth"
                      id="prompt-auth-unauth"
                    />
                    <Textarea
                      id="prompt-auth-unauth"
                      value={formState.prompt.auth?.unauth ?? ""}
                      onChange={(e) =>
                        update("prompt", (prev) => ({
                          ...prev,
                          auth: {
                            ...prev.auth,
                            auth: prev.auth?.auth ?? "",
                            unauth: e.target.value,
                          },
                        }))
                      }
                      rows={2}
                      className="font-mono text-sm"
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      id="prompt-isMultiFunctionCallingEnable"
                      checked={!!formState.prompt.isMultiFunctionCallingEnable}
                      onChange={(e) =>
                        update("prompt", (prev) => ({
                          ...prev,
                          isMultiFunctionCallingEnable: e.target.checked,
                        }))
                      }
                      className="h-4 w-4 rounded border-input"
                    />
                    <FieldLabel
                      docId="prompt"
                      fieldKey="isMultiFunctionCallingEnable"
                      id="prompt-isMultiFunctionCallingEnable"
                    />
                  </div>
                </div>
              </section>

              {/* Memory */}
              <section className="space-y-3 rounded-lg border p-4">
                <h3 className="font-medium">{DOCUMENT_LABELS.memory}</h3>
                <div className="space-y-2">
                  <FieldLabel docId="memory" fieldKey="limit" id="memory-limit" />
                  <Input
                    id="memory-limit"
                    type="number"
                    min={0}
                    value={formState.memory.limit ?? 15}
                    onChange={(e) =>
                      update("memory", (prev) => ({
                        ...prev,
                        limit: parseInt(e.target.value, 10) || 0,
                      }))
                    }
                  />
                </div>
              </section>

              {/* MCP (Validador) - solo editable si isValidatorAgentEnable está activo */}
              <section
                className={cn(
                  "space-y-3 rounded-lg border p-4",
                  !formState.agent.isValidatorAgentEnable && "opacity-60"
                )}
              >
                <h3 className="font-medium">{DOCUMENT_LABELS.mcp}</h3>
                <div className="space-y-2">
                  <FieldLabel docId="mcp" fieldKey="maxRetries" id="mcp-maxRetries" />
                  <Input
                    id="mcp-maxRetries"
                    type="number"
                    min={0}
                    value={formState.mcp.maxRetries ?? 1}
                    onChange={(e) =>
                      update("mcp", (prev) => ({
                        ...prev,
                        maxRetries: Math.max(0, parseInt(e.target.value, 10) || 0),
                      }))
                    }
                    disabled={!formState.agent.isValidatorAgentEnable}
                    aria-describedby={
                      !formState.agent.isValidatorAgentEnable
                        ? "mcp-maxRetries-hint"
                        : undefined
                    }
                  />
                  {!formState.agent.isValidatorAgentEnable && (
                    <p id="mcp-maxRetries-hint" className="text-xs text-muted-foreground">
                      Activa el agente validador en &quot;Comportamiento general&quot; para editar este valor.
                    </p>
                  )}
                </div>
              </section>
            </>
          ) : null}
          </div>
        </div>

        {formState && (
          <div className="min-h-0 flex flex-col gap-3 border-t pt-4">
            <div className="flex items-center gap-2 shrink-0">
              <Button
                type="button"
                variant={isEnabled ? "outline" : "default"}
                size="sm"
                onClick={handleToggleEnabled}
                disabled={saving}
              >
                {saving ? (
                  <Loader2Icon className="w-4 h-4 animate-spin" />
                ) : isEnabled ? (
                  <>
                    <PowerOffIcon className="w-4 h-4 mr-1.5" />
                    Apagar agente
                  </>
                ) : (
                  <>
                    <PowerIcon className="w-4 h-4 mr-1.5" />
                    Encender agente
                  </>
                )}
              </Button>
            </div>
            {data && (
              <PendingChangesPanel
                formState={formState}
                originalData={data}
                className="shrink-0"
              />
            )}
            <div className="flex justify-end gap-2 shrink-0">
              <Button
                onClick={handleSave}
                disabled={
                  saving ||
                  !data ||
                  getPendingDocumentIds(formState, data).length === 0
                }
              >
                {saving ? (
                  <>
                    <Loader2Icon className="w-4 h-4 animate-spin mr-2" />
                    Guardando…
                  </>
                ) : (
                  "Guardar todo"
                )}
              </Button>
            </div>
          </div>
        )}
    </div>
  );
}
function buildPayloadForDocument(
  documentId: PropertyDocumentId,
  formState: AgentPropertiesResponse
): Record<string, unknown> {
  switch (documentId) {
    case "agent": {
      const rawMax = formState.agent.maxFunctionCalls ?? 4;
      const maxFunctionCalls = Math.min(
        8,
        Math.max(1, Number.isFinite(rawMax) ? rawMax : 4),
      );
      return {
        enabled: formState.agent.enabled !== false,
        isAuthEnable: formState.agent.isAuthEnable,
        injectCommandsInPrompt: formState.agent.injectCommandsInPrompt,
        isMemoryEnable: formState.agent.isMemoryEnable,
        isMultiMessageEnable: formState.agent.isMultiMessageEnable,
        isMultiMessageResponseEnable: formState.agent.isMultiMessageResponseEnable,
        maxFunctionCalls,
        omitFirstEchoes: formState.agent.omitFirstEchoes,
        isValidatorAgentEnable: formState.agent.isValidatorAgentEnable ?? false,
        excludedNumbers: formState.agent.excludedNumbers ?? [],
      };
    }
    case "answer":
      return { notSupport: formState.answer.notSupport ?? "" };
    case "ai": {
      const thinking = formState.ai?.thinking;
      const aiModel = formState.ai?.model ?? DEFAULT_LLM_MODEL;
      const aiTemp =
        formState.ai?.temperature !== undefined &&
        formState.ai?.temperature !== null
          ? Number(formState.ai.temperature)
          : getDefaultTemperatureForModel(aiModel);
      return {
        model: aiModel,
        temperature: Number.isFinite(aiTemp) ? aiTemp : getDefaultTemperatureForModel(aiModel),
        thinking: {
          budget: thinking?.budget,
          includeThoughts: thinking?.includeThoughts ?? false,
          level: thinking?.level ?? "",
        },
      };
    }
    case "response": {
      const maxResponseLinesEnabled =
        formState.response.maxResponseLinesEnabled ?? false;
      const maxResponseLines =
        formState.response.maxResponseLines ?? 50;
      return {
        maxResponseLinesEnabled,
        maxResponseLines: maxResponseLinesEnabled ? maxResponseLines : undefined,
        waitTime: formState.response.waitTime ?? 3,
      };
    }
    case "time":
      return { zone: formState.time.zone ?? "America/Mexico_City" };
    case "prompt": {
      return {
        auth: {
          auth: formState.prompt.auth?.auth ?? "",
          unauth: formState.prompt.auth?.unauth ?? "",
        },
        isMultiFunctionCallingEnable: formState.prompt.isMultiFunctionCallingEnable,
      };
    }
    case "memory":
      return { limit: formState.memory.limit ?? 15 };
    case "mcp":
      return { maxRetries: formState.mcp.maxRetries ?? 1 };
    default:
      return {};
  }
}

/**
 * Builds a payload with only the top-level keys that differ from originalData.
 * Used so we only write changed fields; unchanged ones stay unset and the agent keeps defaults.
 */
function buildPartialPayloadForDocument(
  documentId: PropertyDocumentId,
  formState: AgentPropertiesResponse,
  originalData: AgentPropertiesResponse | null
): Record<string, unknown> {
  if (!originalData) return buildPayloadForDocument(documentId, formState);
  const fullForm = buildPayloadForDocument(documentId, formState);
  const fullOriginal = buildPayloadForDocument(documentId, originalData);
  const result: Record<string, unknown> = {};
  for (const key of Object.keys(fullForm)) {
    if (!valueEquals(fullForm[key], fullOriginal[key])) {
      result[key] = fullForm[key];
    }
  }
  return result;
}
