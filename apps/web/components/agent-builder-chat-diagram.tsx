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
  postAgentBuilderChat,
  patchAgentDraft,
  postAgentDraft,
  type DraftPendingTask,
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

function isBusinessComplete(state: DraftState) {
  return BUSINESS_FLOW.every((f) => !!state[f].trim());
}

function isPersonalityComplete(state: DraftState) {
  return !!state.agent_name.trim() && !!state.agent_personality.trim();
}

function hasAnyBusinessValue(state: DraftState) {
  return BUSINESS_FLOW.some((f) => !!state[f].trim());
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
      position: { x: 700, y: 360 },
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
      position: { x: 1040, y: 340 },
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
      const x = 960 + col * 250;
      const y = 470 + row * 86;
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
      position: { x: 700, y: 120 },
      data: { label: `Tools (${state.selected_tools.length})` },
      style: withCardStyle(200),
    });
    edges.push({ id: "e-root-tools", source: "agentRoot", target: "tools" });
  }

  if (personalityVisible) {
    nodes.push({
      id: "personality",
      position: { x: 330, y: 340 },
      data: {
        label: `${isPersonalityComplete(state) ? "Completado" : "En progreso"} · Personalidad`,
      },
      style: withCardStyle(220),
    });
    edges.push({
      id: "e-root-personality",
      source: "agentRoot",
      target: "personality",
    });
  }

  if (tasksVisible) {
    const openTasks = pendingTasks.filter((task) => task.status === "pending").length;
    nodes.push({
      id: "tasks",
      position: { x: 700, y: 610 },
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
      position: { x: 700, y: 20 },
      data: { label: state.creation_step === "complete" ? "Builder finalizado" : "Confirmación" },
      style: withCardStyle(210),
    });
    edges.push({
      id: "e-root-complete",
      source: "agentRoot",
      target: "complete",
    });
  }

  return { nodes, edges };
}

export function AgentBuilderChatDiagram() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const draftFromUrl = searchParams.get("draft")?.trim() ?? "";
  const layoutRef = useRef<HTMLDivElement | null>(null);
  const resizingRef = useRef(false);

  const [draftId, setDraftId] = useState(draftFromUrl);
  const [loadingDraft, setLoadingDraft] = useState(Boolean(draftFromUrl));
  const [saving, setSaving] = useState(false);
  const [chatPanelWidth, setChatPanelWidth] = useState(430);
  const [chatInput, setChatInput] = useState("");
  const [pendingTasks, setPendingTasks] = useState<DraftPendingTask[]>([]);
  const [queuedDeferredTexts, setQueuedDeferredTexts] = useState<string[]>([]);
  const [confirmedSummary, setConfirmedSummary] = useState(false);
  const [isThinking, setIsThinking] = useState(false);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([
    {
      id: nowId(),
      role: "assistant",
      text: "Empezamos en modo conversacional con IA. Cuéntame sobre tu negocio y el agente que quieres construir.",
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

  const readyToConfirm = useMemo(
    () =>
      isBusinessComplete(draftState) &&
      draftState.selected_tools.length > 0 &&
      isPersonalityComplete(draftState),
    [draftState],
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
      addMessage("assistant", "Borrador cargado. Continuemos desde tu avance actual.");
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

  const applyDraftPatch = useCallback(
    (patch: Record<string, unknown>) => {
      setDraftState((prev) => {
        const next = { ...prev };
        const textKeys: Array<keyof DraftState> = [
          "agent_name",
          "agent_personality",
          "business_name",
          "owner_name",
          "industry",
          "description",
          "agent_description",
          "target_audience",
          "escalation_rules",
          "country",
        ];
        for (const key of textKeys) {
          const value = patch[key];
          if (typeof value === "string") next[key] = value.trim();
        }
        if (Array.isArray(patch.selected_tools)) {
          const incoming = patch.selected_tools.filter(
            (x): x is string => typeof x === "string" && x.trim().length > 0,
          );
          if (incoming.length > 0) {
            next.selected_tools = [...new Set([...next.selected_tools, ...incoming])];
          }
        }
        return updateStepFromState(next);
      });
    },
    [updateStepFromState],
  );

  const handleSend = useCallback(async () => {
    const text = chatInput.trim();
    if (!text) return;
    setChatInput("");
    addMessage("user", text);
    await handleDeferredTask(text);

    if (text.toLowerCase() === "confirmar") {
      if (!readyToConfirm) {
        addMessage(
          "assistant",
          "Aún faltan datos por completar (negocio, tools o personalidad). Continuemos.",
        );
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

    setIsThinking(true);
    try {
      const llmRes = await postAgentBuilderChat({
        messages: [...chatMessages, { role: "user", text }],
        draftState,
        pendingTasksCount: pendingTasks.length,
      });
      if (!llmRes.ok) {
        addMessage("assistant", `No pude responder en este momento: ${llmRes.error}`);
        return;
      }
      applyDraftPatch(llmRes.draftPatch as Record<string, unknown>);
      addMessage("assistant", llmRes.assistantMessage);
    } finally {
      setIsThinking(false);
    }
  }, [
    applyDraftPatch,
    addMessage,
    chatInput,
    chatMessages,
    draftState,
    handleDeferredTask,
    pendingTasks.length,
    persistState,
    readyToConfirm,
    updateStepFromState,
  ]);

  useEffect(() => {
    void persistState(draftState, false);
  }, [draftState, persistState]);

  useEffect(() => {
    const onMouseMove = (event: MouseEvent) => {
      if (!resizingRef.current || !layoutRef.current) return;
      const rect = layoutRef.current.getBoundingClientRect();
      const nextWidth = event.clientX - rect.left;
      const min = 320;
      const max = Math.min(760, rect.width - 280);
      const clamped = Math.max(min, Math.min(max, nextWidth));
      setChatPanelWidth(clamped);
    };
    const onMouseUp = () => {
      resizingRef.current = false;
    };
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };
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
          disabled={saving || !readyToConfirm}
        >
          {saving ? <Loader2Icon className="size-4 animate-spin" /> : <CheckIcon />}
          Confirmar y finalizar
        </Button>
      </div>

      <div ref={layoutRef} className="flex flex-1 flex-col gap-3 lg:flex-row lg:gap-1">
        <section
          className="flex h-[calc(100vh-110px)] min-h-[700px] flex-col rounded-xl border border-border bg-card lg:shrink-0"
          style={{ width: `${chatPanelWidth}px` }}
        >
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
            <p className="text-xs text-muted-foreground">
              {isThinking
                ? "La IA está analizando tu mensaje..."
                : readyToConfirm
                  ? "Listo para confirmar cuando quieras."
                  : "Sigue conversando para completar negocio, tools y personalidad."}
            </p>
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
              <Button size="icon" onClick={() => void handleSend()} disabled={isThinking}>
                <SendIcon className="size-4" />
              </Button>
            </div>
          </div>
        </section>

        <div
          className="hidden w-px cursor-col-resize bg-border/50 transition-colors hover:bg-primary/40 lg:block"
          onMouseDown={() => {
            resizingRef.current = true;
          }}
          role="separator"
          aria-orientation="vertical"
          aria-label="Redimensionar panel del chat"
        />

        <section className="h-[calc(100vh-110px)] min-h-[700px] flex-1 rounded-xl border border-border bg-card p-3">
          <div className="h-full overflow-hidden rounded-lg border border-border">
            <ReactFlow
              nodes={graph.nodes}
              edges={graph.edges}
              fitView
              minZoom={0.3}
              maxZoom={1.8}
            >
              <Background />
            </ReactFlow>
          </div>
        </section>
      </div>
    </div>
  );
}
