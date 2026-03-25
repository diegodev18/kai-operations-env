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
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { fetchAgentById } from "@/lib/agents-api";

const DOCUMENT_IDS: PropertyDocumentId[] = [
  "agent",
  "ai",
  "answer",
  "response",
  "time",
  "prompt",
  "memory",
  "mcp",
  "limitation",
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
  limitation: "Acceso (lista blanca)",
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
  onAgentUpdated,
}: {
  agentId: string;
  onAgentUpdated?: () => void;
}) {
  const { data, isLoading, refetch } = useAgentProperties(agentId);
  const [formState, setFormState] = useState<AgentPropertiesResponse | null>(
    null
  );
  const [saving, setSaving] = useState(false);
  const [agentNameForConfirm, setAgentNameForConfirm] = useState("");
  const [isDisableDialogOpen, setIsDisableDialogOpen] = useState(false);
  const [disableConfirmInput, setDisableConfirmInput] = useState("");

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
      next.limitation = {
        userLimitation: !!next.limitation?.userLimitation,
        allowedUsers: Array.isArray(next.limitation?.allowedUsers)
          ? next.limitation.allowedUsers
          : [],
      };
      setFormState(next);
    } else setFormState(null);
  }, [data]);

  useEffect(() => {
    if (!agentId) return;
    let cancelled = false;
    (async () => {
      const agent = await fetchAgentById(agentId);
      if (cancelled) return;
      const resolvedName =
        (typeof agent?.agentName === "string" && agent.agentName.trim() !== ""
          ? agent.agentName
          : agent?.name) ?? agentId;
      setAgentNameForConfirm(resolvedName);
    })();
    return () => {
      cancelled = true;
    };
  }, [agentId]);

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
        toast.success("Cambios guardados");
        refetch();
        await onAgentUpdated?.();
      }
    } finally {
      setSaving(false);
    }
  }, [agentId, formState, data, refetch, onAgentUpdated]);

  const isEnabled = formState?.agent.enabled !== false;

  const handleToggleEnabled = useCallback(async (): Promise<boolean> => {
    if (!agentId || !formState) return false;
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
        return true;
      }
      return false;
    } finally {
      setSaving(false);
    }
  }, [agentId, formState, isEnabled, update, refetch, onAgentUpdated]);

  const expectedDisableName = agentNameForConfirm.trim() || agentId;
  const canConfirmDisable =
    disableConfirmInput.trim() === expectedDisableName && !saving;

  const handleDisableDialogOpenChange = useCallback((open: boolean) => {
    setIsDisableDialogOpen(open);
    if (!open) setDisableConfirmInput("");
  }, []);

  const handleToggleClick = useCallback(() => {
    if (isEnabled) {
      setIsDisableDialogOpen(true);
      return;
    }
    void handleToggleEnabled();
  }, [isEnabled, handleToggleEnabled]);

  if (!agentId) return null;

  return (
    <div
      className="flex w-full min-h-0 flex-1 flex-col"
      role="region"
      aria-label="Configuración del agente"
    >
      {isLoading ? (
        <div className="flex flex-1 items-center justify-center py-16">
          <Loader2Icon className="size-8 animate-spin text-muted-foreground" />
        </div>
      ) : formState ? (
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="grid grid-cols-1 gap-12 lg:grid-cols-2 lg:gap-0 lg:items-start">
          <div className="min-w-0 space-y-12 lg:pr-8">
              {/* Agent */}
              <section className="space-y-4">
                <h3 className="text-sm font-semibold tracking-tight text-foreground">
                  {DOCUMENT_LABELS.agent}
                </h3>
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

              {/* Limitación: lista blanca (MCP-KAI-AGENTS properties/limitation) */}
              <section className="space-y-4">
                <h3 className="text-sm font-semibold tracking-tight text-foreground">
                  {DOCUMENT_LABELS.limitation}
                </h3>
                <div className="grid gap-3">
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      id="limitation-userLimitation"
                      checked={!!formState.limitation.userLimitation}
                      onChange={(e) =>
                        update("limitation", (prev) => ({
                          ...prev,
                          userLimitation: e.target.checked,
                        }))
                      }
                      className="h-4 w-4 rounded border-input"
                    />
                    <FieldLabel
                      docId="limitation"
                      fieldKey="userLimitation"
                      id="limitation-userLimitation"
                    />
                  </div>
                  <div className="space-y-2">
                    <FieldLabel
                      docId="limitation"
                      fieldKey="allowedUsers"
                      id="limitation-allowedUsers"
                    />
                    <Textarea
                      id="limitation-allowedUsers"
                      value={(formState.limitation.allowedUsers ?? []).join("\n")}
                      onChange={(e) =>
                        update("limitation", (prev) => ({
                          ...prev,
                          allowedUsers: e.target.value
                            .split("\n")
                            .map((s) => s.trim())
                            .filter(Boolean),
                        }))
                      }
                      placeholder="Un número por línea (mismo formato que phoneNumber en Firestore)"
                      rows={4}
                      className="font-mono text-sm"
                    />
                  </div>
                </div>
              </section>

              {/* Answer */}
              <section className="space-y-4">
                <h3 className="text-sm font-semibold tracking-tight text-foreground">
                  {DOCUMENT_LABELS.answer}
                </h3>
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
              <section className="space-y-4">
                <h3 className="text-sm font-semibold tracking-tight text-foreground">
                  {DOCUMENT_LABELS.ai}
                </h3>
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
              <section className="space-y-4">
                <h3 className="text-sm font-semibold tracking-tight text-foreground">
                  {DOCUMENT_LABELS.response}
                </h3>
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
          </div>
          <div className="min-w-0 space-y-12 border-t border-border pt-12 lg:border-t-0 lg:border-l lg:border-border lg:pt-0 lg:pl-8">
              {/* Time */}
              <section className="space-y-4">
                <h3 className="text-sm font-semibold tracking-tight text-foreground">
                  {DOCUMENT_LABELS.time}
                </h3>
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
              <section className="space-y-4">
                <h3 className="text-sm font-semibold tracking-tight text-foreground">
                  {DOCUMENT_LABELS.prompt}
                </h3>
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
              <section className="space-y-4">
                <h3 className="text-sm font-semibold tracking-tight text-foreground">
                  {DOCUMENT_LABELS.memory}
                </h3>
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
                  "space-y-4",
                  !formState.agent.isValidatorAgentEnable && "opacity-60",
                )}
              >
                <h3 className="text-sm font-semibold tracking-tight text-foreground">
                  {DOCUMENT_LABELS.mcp}
                </h3>
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
          </div>
        </div>
          </div>
          <div
            className="shrink-0 flex flex-col gap-4 border-t border-border bg-background/95 py-4 backdrop-blur supports-[backdrop-filter]:bg-background/80 sm:flex-row sm:items-end sm:justify-between"
            role="toolbar"
            aria-label="Acciones de configuración"
          >
            <div className="flex min-w-0 flex-1 flex-col gap-3 sm:flex-row sm:items-center sm:gap-4">
              <Button
                type="button"
                variant={isEnabled ? "outline" : "default"}
                size="sm"
                onClick={handleToggleClick}
                disabled={saving}
                className="w-fit shrink-0"
              >
                {saving ? (
                  <Loader2Icon className="h-4 w-4 animate-spin" />
                ) : isEnabled ? (
                  <>
                    <PowerOffIcon className="mr-1.5 h-4 w-4" />
                    Apagar agente
                  </>
                ) : (
                  <>
                    <PowerIcon className="mr-1.5 h-4 w-4" />
                    Encender agente
                  </>
                )}
              </Button>
              {data ? (
                <PendingChangesPanel
                  formState={formState}
                  originalData={data}
                  className="min-w-0 flex-1"
                />
              ) : null}
            </div>
            <Button
              type="button"
              onClick={handleSave}
              disabled={
                saving ||
                !data ||
                getPendingDocumentIds(formState, data).length === 0
              }
              className="w-full shrink-0 sm:w-auto"
            >
              {saving ? (
                <>
                  <Loader2Icon className="mr-2 h-4 w-4 animate-spin" />
                  Guardando…
                </>
              ) : (
                "Guardar cambios"
              )}
            </Button>
          </div>
          <Dialog open={isDisableDialogOpen} onOpenChange={handleDisableDialogOpenChange}>
            <DialogContent className="max-w-md" showClose>
              <DialogHeader>
                <DialogTitle>Confirmar apagado del agente</DialogTitle>
                <p className="text-sm text-muted-foreground">
                  Para apagar el agente, escribe su nombre exactamente:
                  {" "}
                  <span className="font-semibold text-foreground">
                    {expectedDisableName}
                  </span>
                </p>
              </DialogHeader>
              <div className="space-y-2">
                <Label htmlFor="confirm-disable-agent-name">Nombre del agente</Label>
                <Input
                  id="confirm-disable-agent-name"
                  value={disableConfirmInput}
                  onChange={(e) => setDisableConfirmInput(e.target.value)}
                  placeholder={expectedDisableName}
                  autoComplete="off"
                />
              </div>
              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => handleDisableDialogOpenChange(false)}
                  disabled={saving}
                >
                  Cancelar
                </Button>
                <Button
                  type="button"
                  variant="destructive"
                  disabled={!canConfirmDisable}
                  onClick={async () => {
                    const toggled = await handleToggleEnabled();
                    if (toggled) handleDisableDialogOpenChange(false);
                  }}
                >
                  {saving ? (
                    <>
                      <Loader2Icon className="mr-2 h-4 w-4 animate-spin" />
                      Apagando…
                    </>
                  ) : (
                    "Apagar agente"
                  )}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      ) : null}
    </div>
  );
}
function buildPayloadForDocument(
  documentId: PropertyDocumentId,
  formState: AgentPropertiesResponse
): Record<string, unknown> {
  switch (documentId) {
    case "agent": {
      const agent = formState.agent ?? {};
      const rawMax = agent.maxFunctionCalls ?? 4;
      const maxFunctionCalls = Math.min(
        8,
        Math.max(1, Number.isFinite(rawMax) ? rawMax : 4),
      );
      return {
        enabled: agent.enabled !== false,
        isAuthEnable: agent.isAuthEnable,
        injectCommandsInPrompt: agent.injectCommandsInPrompt,
        isMemoryEnable: agent.isMemoryEnable,
        isMultiMessageEnable: agent.isMultiMessageEnable,
        isMultiMessageResponseEnable: agent.isMultiMessageResponseEnable,
        maxFunctionCalls,
        omitFirstEchoes: agent.omitFirstEchoes,
        isValidatorAgentEnable: agent.isValidatorAgentEnable ?? false,
        excludedNumbers: agent.excludedNumbers ?? [],
      };
    }
    case "answer":
      return { notSupport: formState.answer?.notSupport ?? "" };
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
      const response = formState.response ?? {};
      const maxResponseLinesEnabled =
        response.maxResponseLinesEnabled ?? false;
      const maxResponseLines =
        response.maxResponseLines ?? 50;
      return {
        maxResponseLinesEnabled,
        maxResponseLines: maxResponseLinesEnabled ? maxResponseLines : undefined,
        waitTime: response.waitTime ?? 3,
      };
    }
    case "time":
      return { zone: formState.time?.zone ?? "America/Mexico_City" };
    case "prompt": {
      const prompt = formState.prompt ?? {};
      return {
        auth: {
          auth: prompt.auth?.auth ?? "",
          unauth: prompt.auth?.unauth ?? "",
        },
        isMultiFunctionCallingEnable: prompt.isMultiFunctionCallingEnable,
      };
    }
    case "memory":
      return { limit: formState.memory?.limit ?? 15 };
    case "mcp":
      return { maxRetries: formState.mcp?.maxRetries ?? 1 };
    case "limitation": {
      const lim = formState.limitation;
      return {
        userLimitation: lim?.userLimitation ?? false,
        allowedUsers: Array.isArray(lim?.allowedUsers) ? lim.allowedUsers : [],
      };
    }
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
