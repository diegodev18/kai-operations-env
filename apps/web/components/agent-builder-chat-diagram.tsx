"use client";

import "@xyflow/react/dist/style.css";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Background,
  ReactFlow,
  type Edge,
  type Node,
} from "@xyflow/react";
import {
  ArrowLeftIcon,
  BotIcon,
  CheckIcon,
  Loader2Icon,
  MessageSquareIcon,
  SendIcon,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  createDraftPendingTask,
  fetchAgentDraft,
  fetchDraftPendingTasks,
  fetchToolsCatalog,
  patchAgentDraft,
  postAgentDraft,
  type DraftPendingTask,
  type ToolsCatalogItem,
} from "@/lib/agents-api";
import { cn } from "@/lib/utils";

type ChatMessage = { id: string; role: "assistant" | "user"; text: string };

type DraftState = {
  agent_name: string;
  agent_personality: string;
  business_name: string;
  owner_name: string;
  industry: string;
  description: string;
  agent_description: string;
  target_audience: string;
  escalation_rules: string;
  country: string;
  selected_tools: string[];
  creation_step: "personality" | "business" | "tools" | "complete";
};

type StepField =
  | "business_name"
  | "owner_name"
  | "industry"
  | "description"
  | "target_audience"
  | "agent_description"
  | "escalation_rules"
  | "selected_tools"
  | "agent_name"
  | "agent_personality"
  | "confirm";

const BUSINESS_FLOW: Array<keyof DraftState> = [
  "business_name",
  "owner_name",
  "industry",
  "description",
  "target_audience",
  "agent_description",
  "escalation_rules",
];

const BUSINESS_FIELD_GRAPH: Array<{ key: keyof DraftState; label: string }> = [
  { key: "business_name", label: "Nombre" },
  { key: "owner_name", label: "Responsable" },
  { key: "industry", label: "Industria" },
  { key: "description", label: "Descripción" },
  { key: "target_audience", label: "Audiencia" },
  { key: "agent_description", label: "Rol del agente" },
  { key: "escalation_rules", label: "Escalamiento" },
];

const PROMPTS: Record<StepField, string> = {
  business_name: "Comencemos. ¿Cuál es el nombre del negocio?",
  owner_name: "¿Quién es la persona responsable o dueña del negocio?",
  industry: "¿En qué industria opera el negocio?",
  description: "Describe brevemente qué hace el negocio.",
  target_audience: "¿Quién es su audiencia objetivo?",
  agent_description: "¿Qué rol y tareas tendrá el agente?",
  escalation_rules: "¿Qué reglas de escalamiento debe seguir?",
  selected_tools:
    "Escribe el nombre de una o varias tools (separadas por coma) para seleccionarlas.",
  agent_name: "Perfecto. Ahora define el nombre público del agente.",
  agent_personality:
    "Describe la personalidad del agente (tono, estilo, formalidad).",
  confirm:
    "Resumen listo. Escribe 'confirmar' para finalizar o edita cualquier nodo del mapa.",
};

function nowId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function str(v: unknown): string {
  return typeof v === "string" ? v : "";
}

function detectDeferredIntent(text: string): boolean {
  const deferRegex =
    /\b(luego|despu[eé]s|m[aá]s tarde|otro d[ií]a|en otro momento)\b/i;
  const actionRegex =
    /\b(hacer|crear|configurar|definir|agregar|subir|conectar|completar|revisar|documentar|probar|integrar)\b/i;
  return deferRegex.test(text) && actionRegex.test(text);
}

function deriveDeferredTaskTitle(text: string): string {
  const cleaned = text
    .replace(/\b(luego|despu[eé]s|m[aá]s tarde|otro d[ií]a|en otro momento)\b/gi, "")
    .replace(/\s+/g, " ")
    .trim();
  return (cleaned || text.trim() || "Seguimiento pendiente").slice(0, 90);
}

function pickToolIdsFromText(text: string, catalog: ToolsCatalogItem[]): string[] {
  const rawParts = text
    .split(",")
    .map((p) => p.trim().toLowerCase())
    .filter(Boolean);
  if (rawParts.length === 0) return [];
  const ids = new Set<string>();
  for (const part of rawParts) {
    for (const tool of catalog) {
      const name = tool.name.toLowerCase();
      const display = tool.displayName.toLowerCase();
      if (name.includes(part) || display.includes(part) || part.includes(name)) {
        ids.add(tool.id);
      }
    }
  }
  return [...ids];
}

function isBusinessComplete(state: DraftState) {
  return BUSINESS_FLOW.every((f) => !!state[f].trim());
}

function isPersonalityComplete(state: DraftState) {
  return !!state.agent_name.trim() && !!state.agent_personality.trim();
}

function hasAnyBusinessValue(state: DraftState) {
  return BUSINESS_FLOW.some((f) => !!state[f].trim());
}

function getCurrentStep(state: DraftState, confirmed: boolean): StepField {
  for (const field of BUSINESS_FLOW) {
    if (!state[field].trim()) return field as StepField;
  }
  if (state.selected_tools.length === 0) return "selected_tools";
  if (!state.agent_name.trim()) return "agent_name";
  if (!state.agent_personality.trim()) return "agent_personality";
  if (!confirmed) return "confirm";
  return "confirm";
}

function summarize(state: DraftState, pendingCount: number): string {
  return [
    "Resumen del agente:",
    `- Negocio: ${state.business_name}`,
    `- Industria: ${state.industry}`,
    `- Audiencia: ${state.target_audience}`,
    `- Rol del agente: ${state.agent_description}`,
    `- Tools seleccionadas: ${state.selected_tools.length}`,
    `- Nombre del agente: ${state.agent_name}`,
    `- Tareas pendientes: ${pendingCount}`,
  ].join("\n");
}

function withCardStyle(width: number) {
  return {
    width,
    borderRadius: 12,
    border: "1px solid var(--border)",
    background: "var(--card)",
    color: "var(--card-foreground)",
  };
}

function fieldNodeValue(value: string): string {
  return value.trim().slice(0, 44);
}

function buildProgressiveGraph(
  state: DraftState,
  pendingTasks: DraftPendingTask[],
  confirmed: boolean,
): { nodes: Node[]; edges: Edge[] } {
  const nodes: Node[] = [
    {
      id: "agentRoot",
      position: { x: 80, y: 120 },
      data: {
        label: (
          <div className="flex items-center gap-2">
            <BotIcon className="size-4" />
            <span>Agente</span>
          </div>
        ),
      },
      style: withCardStyle(140),
    },
  ];
  const edges: Edge[] = [];

  const businessVisible = hasAnyBusinessValue(state) || state.creation_step !== "personality";
  const toolsVisible = isBusinessComplete(state) || state.selected_tools.length > 0;
  const personalityVisible = toolsVisible || !!state.agent_name.trim() || !!state.agent_personality.trim();
  const completeVisible = confirmed || state.creation_step === "complete";
  const tasksVisible = pendingTasks.length > 0;

  if (businessVisible) {
    nodes.push({
      id: "business",
      position: { x: 300, y: 120 },
      data: {
        label: `${isBusinessComplete(state) ? "Completado" : "En progreso"} · Negocio`,
      },
      style: withCardStyle(220),
    });
    edges.push({ id: "e-root-business", source: "agentRoot", target: "business" });

    BUSINESS_FIELD_GRAPH.forEach((field, index) => {
      const rawValue = state[field.key];
      if (!rawValue.trim()) return;
      const row = Math.floor(index / 2);
      const col = index % 2;
      const x = 300 + col * 250;
      const y = 250 + row * 86;
      const value = fieldNodeValue(rawValue);
      const fieldNodeId = `business-${field.key}`;
      nodes.push({
        id: fieldNodeId,
        position: { x, y },
        data: {
          label: `${field.label}: ${value}`,
        },
        style: withCardStyle(230),
      });
      edges.push({
        id: `e-business-${field.key}`,
        source: "business",
        target: fieldNodeId,
      });
    });
  }

  if (toolsVisible) {
    nodes.push({
      id: "tools",
      position: { x: 830, y: 120 },
      data: { label: `Tools (${state.selected_tools.length})` },
      style: withCardStyle(200),
    });
    edges.push({ id: "e-business-tools", source: "business", target: "tools" });
  }

  if (personalityVisible) {
    nodes.push({
      id: "personality",
      position: { x: 1060, y: 120 },
      data: {
        label: `${isPersonalityComplete(state) ? "Completado" : "En progreso"} · Personalidad`,
      },
      style: withCardStyle(220),
    });
    edges.push({ id: "e-tools-personality", source: "tools", target: "personality" });
  }

  if (tasksVisible) {
    const openTasks = pendingTasks.filter((task) => task.status === "pending").length;
    nodes.push({
      id: "tasks",
      position: { x: 830, y: 520 },
      data: { label: `Tareas pendientes (${openTasks})` },
      style: withCardStyle(230),
    });
    if (businessVisible) {
      edges.push({ id: "e-business-tasks", source: "business", target: "tasks" });
    }
  }

  if (completeVisible) {
    nodes.push({
      id: "complete",
      position: { x: 1300, y: 120 },
      data: { label: state.creation_step === "complete" ? "Builder finalizado" : "Confirmación" },
      style: withCardStyle(210),
    });
    edges.push({
      id: "e-personality-complete",
      source: "personality",
      target: "complete",
    });
  }

  return { nodes, edges };
}

export function AgentBuilderChatDiagram() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const draftFromUrl = searchParams.get("draft")?.trim() ?? "";

  const [draftId, setDraftId] = useState(draftFromUrl);
  const [loadingDraft, setLoadingDraft] = useState(Boolean(draftFromUrl));
  const [saving, setSaving] = useState(false);
  const [chatInput, setChatInput] = useState("");
  const [catalog, setCatalog] = useState<ToolsCatalogItem[]>([]);
  const [pendingTasks, setPendingTasks] = useState<DraftPendingTask[]>([]);
  const [queuedDeferredTexts, setQueuedDeferredTexts] = useState<string[]>([]);
  const [confirmedSummary, setConfirmedSummary] = useState(false);
  const [focusOverride, setFocusOverride] = useState<StepField | null>(null);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([
    {
      id: nowId(),
      role: "assistant",
      text: "Empezamos en modo conversacional. El mapa arranca vacío y se irá completando con cada paso. ¿Cuál es el nombre del negocio?",
    },
  ]);

  const [draftState, setDraftState] = useState<DraftState>({
    agent_name: "",
    agent_personality: "",
    business_name: "",
    owner_name: "",
    industry: "",
    description: "",
    agent_description: "",
    target_audience: "",
    escalation_rules: "",
    country: "",
    selected_tools: [],
    creation_step: "personality",
  });

  const lastSyncedRef = useRef({
    personality: "",
    business: "",
    tools: "",
    complete: false,
  });

  const addMessage = useCallback((role: ChatMessage["role"], text: string) => {
    setChatMessages((prev) => [...prev, { id: nowId(), role, text }]);
  }, []);

  const updateStepFromState = useCallback(
    (state: DraftState): DraftState => {
      const next = { ...state };
      if (!isBusinessComplete(next)) {
        next.creation_step = "business";
        return next;
      }
      if (next.selected_tools.length === 0) {
        next.creation_step = "tools";
        return next;
      }
      if (!isPersonalityComplete(next)) {
        next.creation_step = "personality";
        return next;
      }
      next.creation_step = "complete";
      return next;
    },
    [],
  );

  const currentStep = useMemo(
    () => focusOverride ?? getCurrentStep(draftState, confirmedSummary),
    [draftState, confirmedSummary, focusOverride],
  );

  const completion = useMemo(() => {
    const sections = [
      isBusinessComplete(draftState),
      draftState.selected_tools.length > 0,
      isPersonalityComplete(draftState),
      confirmedSummary,
    ];
    const done = sections.filter(Boolean).length;
    return Math.round((done / sections.length) * 100);
  }, [confirmedSummary, draftState]);

  const graph = useMemo(
    () => buildProgressiveGraph(draftState, pendingTasks, confirmedSummary),
    [draftState, pendingTasks, confirmedSummary],
  );

  const syncPendingTasks = useCallback(async (id: string) => {
    const res = await fetchDraftPendingTasks(id);
    if (res) setPendingTasks(res.tasks);
  }, []);

  const flushQueuedDeferredTasks = useCallback(
    async (id: string) => {
      if (queuedDeferredTexts.length === 0) return;
      const queued = [...queuedDeferredTexts];
      setQueuedDeferredTexts([]);
      for (const text of queued) {
        const created = await createDraftPendingTask(id, {
          title: deriveDeferredTaskTitle(text),
          context: text,
          postponed_from: "chat_message",
        });
        if (created.ok) {
          setPendingTasks((prev) => [created.task, ...prev]);
        }
      }
    },
    [queuedDeferredTexts],
  );

  const persistState = useCallback(
    async (state: DraftState, markComplete: boolean) => {
      const stepped = updateStepFromState(state);
      const personalitySig = `${stepped.agent_name}|${stepped.agent_personality}`;
      const businessSig = BUSINESS_FLOW.map((field) => stepped[field]).join("|");
      const toolsSig = [...stepped.selected_tools].sort().join("|");

      let currentDraftId = draftId;
      if (!currentDraftId && isPersonalityComplete(stepped)) {
        setSaving(true);
        try {
          const created = await postAgentDraft({
            agent_name: stepped.agent_name.trim(),
            agent_personality: stepped.agent_personality.trim(),
          });
          if (!created.ok) {
            toast.error(created.error);
            return;
          }
          currentDraftId = created.id;
          setDraftId(created.id);
          router.replace(`/agents/new?draft=${encodeURIComponent(created.id)}`);
          await syncPendingTasks(created.id);
          await flushQueuedDeferredTasks(created.id);
        } finally {
          setSaving(false);
        }
      }
      if (!currentDraftId) return;

      if (
        isBusinessComplete(stepped) &&
        lastSyncedRef.current.business !== businessSig
      ) {
        setSaving(true);
        try {
          const res = await patchAgentDraft(currentDraftId, {
            step: "business",
            business_name: stepped.business_name.trim(),
            owner_name: stepped.owner_name.trim(),
            industry: stepped.industry.trim(),
            description: stepped.description.trim(),
            agent_description: stepped.agent_description.trim(),
            target_audience: stepped.target_audience.trim(),
            escalation_rules: stepped.escalation_rules.trim(),
            ...(stepped.country.trim() ? { country: stepped.country.trim() } : {}),
          });
          if (res.ok) lastSyncedRef.current.business = businessSig;
          else toast.error(res.error);
        } finally {
          setSaving(false);
        }
      }

      if (
        stepped.selected_tools.length > 0 &&
        lastSyncedRef.current.tools !== toolsSig
      ) {
        setSaving(true);
        try {
          const res = await patchAgentDraft(currentDraftId, {
            step: "tools",
            selected_tools: stepped.selected_tools,
          });
          if (res.ok) lastSyncedRef.current.tools = toolsSig;
          else toast.error(res.error);
        } finally {
          setSaving(false);
        }
      }

      if (
        isPersonalityComplete(stepped) &&
        lastSyncedRef.current.personality !== personalitySig
      ) {
        setSaving(true);
        try {
          const res = await patchAgentDraft(currentDraftId, {
            step: "personality",
            agent_name: stepped.agent_name.trim(),
            agent_personality: stepped.agent_personality.trim(),
          });
          if (res.ok) lastSyncedRef.current.personality = personalitySig;
          else toast.error(res.error);
        } finally {
          setSaving(false);
        }
      }

      if (markComplete && !lastSyncedRef.current.complete) {
        setSaving(true);
        try {
          const res = await patchAgentDraft(currentDraftId, { step: "complete" });
          if (res.ok) lastSyncedRef.current.complete = true;
        } finally {
          setSaving(false);
        }
      }
    },
    [draftId, flushQueuedDeferredTasks, router, syncPendingTasks, updateStepFromState],
  );

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const list = await fetchToolsCatalog();
      if (cancelled) return;
      if (list === null) {
        toast.error("No se pudo cargar el catálogo de herramientas");
        return;
      }
      setCatalog(list);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!draftFromUrl) {
      setLoadingDraft(false);
      return;
    }
    let cancelled = false;
    setLoadingDraft(true);
    void (async () => {
      const res = await fetchAgentDraft(draftFromUrl);
      if (cancelled) return;
      setLoadingDraft(false);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      const d = res.draft;
      const nextState = updateStepFromState({
        agent_name: str(d.agent_name),
        agent_personality: str(d.agent_personality),
        business_name: str(d.business_name),
        owner_name: str(d.owner_name),
        industry: str(d.industry),
        description: str(d.description),
        agent_description: str(d.agent_description),
        target_audience: str(d.target_audience),
        escalation_rules: str(d.escalation_rules),
        country: str(d.country),
        selected_tools: Array.isArray(d.selected_tools)
          ? d.selected_tools.filter((x): x is string => typeof x === "string")
          : [],
        creation_step:
          str(d.creation_step) === "complete" ? "complete" : "personality",
      });
      setDraftId(res.id);
      setDraftState(nextState);
      setConfirmedSummary(nextState.creation_step === "complete");
      addMessage("assistant", "Borrador cargado. El mapa se reconstruyó según tu avance.");
      await syncPendingTasks(res.id);
    })();
    return () => {
      cancelled = true;
    };
  }, [addMessage, draftFromUrl, syncPendingTasks, updateStepFromState]);

  const handleDeferredTask = useCallback(
    async (text: string) => {
      if (!detectDeferredIntent(text)) return;
      if (!draftId) {
        setQueuedDeferredTexts((prev) => [...prev, text]);
        addMessage(
          "assistant",
          "Detecté una acción para después y la registraré como tarea cuando se cree el borrador.",
        );
        return;
      }
      const created = await createDraftPendingTask(draftId, {
        title: deriveDeferredTaskTitle(text),
        context: text,
        postponed_from: "chat_message",
      });
      if (!created.ok) {
        toast.error(created.error);
        return;
      }
      setPendingTasks((prev) => [created.task, ...prev]);
      addMessage("assistant", `Tarea pendiente creada: "${created.task.title}".`);
    },
    [addMessage, draftId],
  );

  const handleSend = useCallback(async () => {
    const text = chatInput.trim();
    if (!text) return;
    setChatInput("");
    addMessage("user", text);
    await handleDeferredTask(text);

    if (currentStep === "confirm") {
      if (text.toLowerCase() !== "confirmar") {
        addMessage("assistant", "Para cerrar este flujo escribe exactamente: confirmar");
        return;
      }
      setConfirmedSummary(true);
      const nextState = updateStepFromState({ ...draftState, creation_step: "complete" });
      setDraftState(nextState);
      await persistState(nextState, true);
      addMessage("assistant", "Builder finalizado correctamente.");
      toast.success("Builder completado");
      return;
    }

    if (currentStep === "selected_tools") {
      const picked = pickToolIdsFromText(text, catalog);
      if (picked.length === 0) {
        const suggestions = catalog
          .slice(0, 6)
          .map((tool) => tool.displayName || tool.name)
          .join(", ");
        addMessage(
          "assistant",
          `No encontré tools con ese texto. Ejemplos disponibles: ${suggestions}`,
        );
        return;
      }
      const merged = [...new Set([...draftState.selected_tools, ...picked])];
      const nextState = updateStepFromState({
        ...draftState,
        selected_tools: merged,
      });
      setDraftState(nextState);
      await persistState(nextState, false);
      const nextStep = getCurrentStep(nextState, confirmedSummary);
      addMessage("assistant", PROMPTS[nextStep]);
      return;
    }

    const updated = updateStepFromState({
      ...draftState,
      [currentStep]: text,
    });
    setDraftState(updated);
    setFocusOverride(null);
    await persistState(updated, false);

    const nextStep = getCurrentStep(updated, confirmedSummary);
    if (nextStep === "confirm") {
      addMessage("assistant", summarize(updated, pendingTasks.length));
      addMessage("assistant", PROMPTS.confirm);
      return;
    }
    addMessage("assistant", PROMPTS[nextStep]);
  }, [
    addMessage,
    catalog,
    chatInput,
    confirmedSummary,
    currentStep,
    draftState,
    handleDeferredTask,
    pendingTasks.length,
    persistState,
    updateStepFromState,
  ]);

  const onNodeClick = useCallback((nodeId: string) => {
    const map: Partial<Record<string, StepField>> = {
      business: "business_name",
      tools: "selected_tools",
      personality: "agent_name",
      complete: "confirm",
    };
    setFocusOverride(map[nodeId] ?? null);
  }, []);

  if (loadingDraft) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center gap-2 text-muted-foreground">
        <Loader2Icon className="size-5 animate-spin" />
        Cargando borrador...
      </div>
    );
  }

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-[1450px] flex-col gap-3 px-4 pt-3 pb-3">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Button variant="outline" size="icon" asChild>
            <Link href="/" aria-label="Volver al panel">
              <ArrowLeftIcon className="size-4" />
            </Link>
          </Button>
          <div>
            <h1 className="text-xl font-semibold tracking-tight">
              Builder conversacional progresivo
            </h1>
            <p className="text-sm text-muted-foreground">
              Chat + diagrama. El mapa se construye por etapas. Progreso: {completion}%.
            </p>
          </div>
        </div>
        <Button
          onClick={() => {
            setChatInput("confirmar");
            void Promise.resolve().then(() => {
              void handleSend();
            });
          }}
          disabled={saving || currentStep !== "confirm"}
        >
          {saving ? <Loader2Icon className="size-4 animate-spin" /> : <CheckIcon />}
          Confirmar y finalizar
        </Button>
      </div>

      <div className="grid flex-1 gap-3 lg:grid-cols-[minmax(320px,500px)_1fr]">
        <section className="flex h-[calc(100vh-110px)] min-h-[700px] flex-col rounded-xl border border-border bg-card">
          <header className="border-b border-border px-4 py-3">
            <p className="flex items-center gap-2 text-sm font-medium">
              <MessageSquareIcon className="size-4" />
              Conversación guiada
            </p>
          </header>
          <div className="flex-1 space-y-3 overflow-y-auto p-4">
            {chatMessages.map((message) => (
              <div
                key={message.id}
                className={cn(
                  "max-w-[92%] rounded-xl px-3 py-2 text-sm whitespace-pre-wrap",
                  message.role === "assistant"
                    ? "bg-muted text-foreground"
                    : "ml-auto bg-primary text-primary-foreground",
                )}
              >
                {message.text}
              </div>
            ))}
          </div>
          <div className="space-y-2 border-t border-border p-3">
            <p className="text-xs text-muted-foreground">Siguiente objetivo: {PROMPTS[currentStep]}</p>
            <div className="flex gap-2">
              <Input
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    void handleSend();
                  }
                }}
                placeholder="Escribe un mensaje..."
              />
              <Button size="icon" onClick={() => void handleSend()}>
                <SendIcon className="size-4" />
              </Button>
            </div>
          </div>
        </section>

        <section className="h-[calc(100vh-110px)] min-h-[700px] rounded-xl border border-border bg-card p-3">
          <div className="h-full overflow-hidden rounded-lg border border-border">
            <ReactFlow
              nodes={graph.nodes}
              edges={graph.edges}
              fitView
              minZoom={0.3}
              maxZoom={1.8}
              onNodeClick={(_, node) => onNodeClick(node.id)}
            >
              <Background />
            </ReactFlow>
          </div>
        </section>
      </div>
    </div>
  );
}
