"use client";

import "@xyflow/react/dist/style.css";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Background,
  Controls,
  MiniMap,
  ReactFlow,
  type Edge,
  type Node,
} from "@xyflow/react";
import {
  ArrowLeftIcon,
  CheckIcon,
  Loader2Icon,
  MessageSquareIcon,
  SendIcon,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  createDraftPendingTask,
  fetchAgentDraft,
  fetchDraftPendingTasks,
  fetchToolsCatalog,
  patchAgentDraft,
  patchDraftPendingTask,
  postAgentDraft,
  type DraftPendingTask,
  type ToolsCatalogItem,
} from "@/lib/agents-api";
import { cn } from "@/lib/utils";

type ChatMessage = {
  id: string;
  role: "assistant" | "user";
  text: string;
};

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

const REQUIRED_FLOW_FIELDS: Array<keyof DraftState> = [
  "agent_name",
  "agent_personality",
  "business_name",
  "owner_name",
  "industry",
  "description",
  "agent_description",
  "target_audience",
  "escalation_rules",
];

const FIELD_PROMPTS: Record<keyof DraftState, string> = {
  agent_name: "Dime el nombre público del agente.",
  agent_personality:
    "Describe la personalidad del agente (tono, estilo, formalidad).",
  business_name: "¿Cuál es el nombre del negocio?",
  owner_name: "¿Quién es el dueño o responsable principal?",
  industry: "¿En qué industria opera el negocio?",
  description: "Cuéntame una descripción corta del negocio.",
  agent_description: "¿Qué rol y objetivos tendrá el agente?",
  target_audience: "¿Quién es la audiencia objetivo?",
  escalation_rules: "¿Cuáles son las reglas de escalamiento?",
  country: "¿País principal de operación? (opcional)",
  selected_tools: "Selecciona herramientas para el agente.",
  creation_step: "",
};

const textareaClass =
  "min-h-[88px] w-full rounded-lg border border-input bg-transparent px-2.5 py-2 text-sm transition-colors outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30";

function str(v: unknown): string {
  return typeof v === "string" ? v : "";
}

function nowId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

function isBusinessComplete(state: DraftState): boolean {
  return (
    !!state.business_name.trim() &&
    !!state.owner_name.trim() &&
    !!state.industry.trim() &&
    !!state.description.trim() &&
    !!state.agent_description.trim() &&
    !!state.target_audience.trim() &&
    !!state.escalation_rules.trim()
  );
}

function isPersonalityComplete(state: DraftState): boolean {
  return !!state.agent_name.trim() && !!state.agent_personality.trim();
}

function nextMissingField(state: DraftState): keyof DraftState | null {
  for (const key of REQUIRED_FLOW_FIELDS) {
    const value = state[key];
    if (typeof value === "string" && !value.trim()) return key;
  }
  if (state.selected_tools.length === 0) return "selected_tools";
  return null;
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
  const base = cleaned.length > 0 ? cleaned : text.trim();
  const title = base.slice(0, 90);
  return title.length > 0 ? title : "Seguimiento pendiente";
}

export function AgentBuilderChatDiagram() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const draftFromUrl = searchParams.get("draft")?.trim() ?? "";

  const [draftId, setDraftId] = useState<string>(draftFromUrl);
  const [loadingDraft, setLoadingDraft] = useState(Boolean(draftFromUrl));
  const [saving, setSaving] = useState(false);
  const [chatInput, setChatInput] = useState("");
  const [toolSearch, setToolSearch] = useState("");
  const [catalog, setCatalog] = useState<ToolsCatalogItem[]>([]);
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [pendingTasks, setPendingTasks] = useState<DraftPendingTask[]>([]);
  const [activeNode, setActiveNode] = useState("personality");
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([
    {
      id: nowId(),
      role: "assistant",
      text: "Vamos a construir tu agente en formato conversación + diagrama. Empecemos por el nombre del agente.",
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

  const lastSyncedRef = useRef<{
    personality: string;
    business: string;
    tools: string;
    complete: boolean;
  }>({
    personality: "",
    business: "",
    tools: "",
    complete: false,
  });

  const addMessage = useCallback((role: ChatMessage["role"], text: string) => {
    setChatMessages((prev) => [...prev, { id: nowId(), role, text }]);
  }, []);

  const filteredCatalog = useMemo(() => {
    const q = toolSearch.trim().toLowerCase();
    if (!q) return catalog;
    return catalog.filter(
      (tool) =>
        tool.name.toLowerCase().includes(q) ||
        tool.displayName.toLowerCase().includes(q) ||
        tool.description.toLowerCase().includes(q),
    );
  }, [catalog, toolSearch]);

  const updateStepFromState = useCallback((state: DraftState): DraftState => {
    const next = { ...state };
    if (!isPersonalityComplete(next)) {
      next.creation_step = "personality";
      return next;
    }
    if (!isBusinessComplete(next)) {
      next.creation_step = "business";
      return next;
    }
    if (next.selected_tools.length === 0) {
      next.creation_step = "tools";
      return next;
    }
    next.creation_step = "complete";
    return next;
  }, []);

  const syncPendingTasks = useCallback(
    async (id: string) => {
      const res = await fetchDraftPendingTasks(id);
      if (!res) return;
      setPendingTasks(res.tasks);
    },
    [setPendingTasks],
  );

  const persistState = useCallback(
    async (state: DraftState) => {
      const stepped = updateStepFromState(state);
      const personalitySig = `${stepped.agent_name}|${stepped.agent_personality}`;
      const businessSig = [
        stepped.business_name,
        stepped.owner_name,
        stepped.industry,
        stepped.description,
        stepped.agent_description,
        stepped.target_audience,
        stepped.escalation_rules,
        stepped.country,
      ].join("|");
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
        } finally {
          setSaving(false);
        }
      }
      if (!currentDraftId) return;

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
          if (res.ok) {
            lastSyncedRef.current.personality = personalitySig;
          } else {
            toast.error(res.error);
          }
        } finally {
          setSaving(false);
        }
      }

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
          if (res.ok) {
            lastSyncedRef.current.business = businessSig;
          } else {
            toast.error(res.error);
          }
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
          if (res.ok) {
            lastSyncedRef.current.tools = toolsSig;
          } else {
            toast.error(res.error);
          }
        } finally {
          setSaving(false);
        }
      }

      if (stepped.creation_step === "complete" && !lastSyncedRef.current.complete) {
        setSaving(true);
        try {
          const res = await patchAgentDraft(currentDraftId, { step: "complete" });
          if (res.ok) {
            lastSyncedRef.current.complete = true;
          }
        } finally {
          setSaving(false);
        }
      }
    },
    [draftId, router, syncPendingTasks, updateStepFromState],
  );

  useEffect(() => {
    let cancelled = false;
    setCatalogLoading(true);
    void (async () => {
      const list = await fetchToolsCatalog();
      if (cancelled) return;
      setCatalogLoading(false);
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
      addMessage("assistant", "Borrador cargado. Continuemos donde te quedaste.");
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
        addMessage(
          "assistant",
          "Detecté que quieres posponer algo. En cuanto se cree el borrador lo guardo como tarea pendiente.",
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
      addMessage(
        "assistant",
        `Tarea creada automáticamente: "${created.task.title}".`,
      );
    },
    [addMessage, draftId],
  );

  const handleSend = useCallback(async () => {
    const text = chatInput.trim();
    if (!text) return;
    setChatInput("");
    addMessage("user", text);
    await handleDeferredTask(text);

    const missing = nextMissingField(draftState);
    if (!missing) {
      addMessage(
        "assistant",
        "Ya tienes todo completo. Puedes finalizar o ajustar cualquier nodo del diagrama.",
      );
      return;
    }
    if (missing === "selected_tools") {
      addMessage(
        "assistant",
        "Perfecto. Ahora selecciona al menos una tool en el panel derecho.",
      );
      setActiveNode("tools");
      return;
    }

    const updated = updateStepFromState({
      ...draftState,
      [missing]: text,
    });
    setDraftState(updated);
    await persistState(updated);

    const next = nextMissingField(updated);
    if (!next) {
      addMessage(
        "assistant",
        "Excelente. Información principal completa. Selecciona tools para cerrar el builder.",
      );
    } else if (next === "selected_tools") {
      addMessage(
        "assistant",
        "Listo. Ahora selecciona tools y, cuando quieras, finaliza.",
      );
      setActiveNode("tools");
    } else {
      addMessage("assistant", FIELD_PROMPTS[next]);
    }
  }, [
    addMessage,
    chatInput,
    draftState,
    handleDeferredTask,
    persistState,
    updateStepFromState,
  ]);

  const toggleTool = useCallback(
    async (id: string) => {
      const nextSelected = draftState.selected_tools.includes(id)
        ? draftState.selected_tools.filter((x) => x !== id)
        : [...draftState.selected_tools, id];
      const nextState = updateStepFromState({
        ...draftState,
        selected_tools: nextSelected,
      });
      setDraftState(nextState);
      await persistState(nextState);
    },
    [draftState, persistState, updateStepFromState],
  );

  const finalize = useCallback(async () => {
    const missing = nextMissingField(draftState);
    if (missing) {
      toast.error("Aún hay información pendiente antes de finalizar.");
      return;
    }
    const nextState = updateStepFromState({
      ...draftState,
      creation_step: "complete",
    });
    setDraftState(nextState);
    await persistState(nextState);
    addMessage("assistant", "Borrador finalizado correctamente.");
    toast.success("Builder completado");
  }, [addMessage, draftState, persistState, updateStepFromState]);

  const setTaskStatus = useCallback(
    async (taskId: string, status: "pending" | "completed") => {
      if (!draftId) return;
      const res = await patchDraftPendingTask(draftId, taskId, { status });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      setPendingTasks((prev) =>
        prev.map((task) => (task.id === taskId ? res.task : task)),
      );
    },
    [draftId],
  );

  const completion = useMemo(() => {
    const total = REQUIRED_FLOW_FIELDS.length + 1;
    const requiredDone = REQUIRED_FLOW_FIELDS.filter((key) => {
      const v = draftState[key];
      return typeof v === "string" ? !!v.trim() : true;
    }).length;
    const toolsDone = draftState.selected_tools.length > 0 ? 1 : 0;
    return Math.round(((requiredDone + toolsDone) / total) * 100);
  }, [draftState]);

  const flowNodes = useMemo<Node[]>(
    () => [
      {
        id: "personality",
        position: { x: 40, y: 40 },
        data: {
          label: `${isPersonalityComplete(draftState) ? "Completado" : "Pendiente"} · Personalidad`,
        },
        style: {
          width: 240,
          borderRadius: 12,
          border: "1px solid var(--border)",
          background: "var(--card)",
          color: "var(--card-foreground)",
        },
      },
      {
        id: "business",
        position: { x: 330, y: 40 },
        data: {
          label: `${isBusinessComplete(draftState) ? "Completado" : "Pendiente"} · Negocio`,
        },
        style: {
          width: 240,
          borderRadius: 12,
          border: "1px solid var(--border)",
          background: "var(--card)",
          color: "var(--card-foreground)",
        },
      },
      {
        id: "tools",
        position: { x: 620, y: 40 },
        data: {
          label: `${draftState.selected_tools.length > 0 ? "Completado" : "Pendiente"} · Tools (${draftState.selected_tools.length})`,
        },
        style: {
          width: 220,
          borderRadius: 12,
          border: "1px solid var(--border)",
          background: "var(--card)",
          color: "var(--card-foreground)",
        },
      },
      {
        id: "tasks",
        position: { x: 330, y: 220 },
        data: {
          label: `Tareas pendientes (${pendingTasks.filter((t) => t.status === "pending").length})`,
        },
        style: {
          width: 260,
          borderRadius: 12,
          border: "1px solid var(--border)",
          background: "var(--card)",
          color: "var(--card-foreground)",
        },
      },
      {
        id: "complete",
        position: { x: 620, y: 220 },
        data: {
          label: `${draftState.creation_step === "complete" ? "Finalizado" : "En progreso"} · Builder`,
        },
        style: {
          width: 220,
          borderRadius: 12,
          border: "1px solid var(--border)",
          background: "var(--card)",
          color: "var(--card-foreground)",
        },
      },
    ],
    [draftState, pendingTasks],
  );

  const flowEdges = useMemo<Edge[]>(
    () => [
      { id: "e1", source: "personality", target: "business" },
      { id: "e2", source: "business", target: "tools" },
      { id: "e3", source: "tools", target: "complete" },
      { id: "e4", source: "business", target: "tasks" },
      { id: "e5", source: "tasks", target: "complete" },
    ],
    [],
  );

  if (loadingDraft) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center gap-2 text-muted-foreground">
        <Loader2Icon className="size-5 animate-spin" />
        Cargando borrador...
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-[1400px] flex-col gap-4 p-4 pb-10">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Button variant="outline" size="icon" asChild>
            <Link href="/" aria-label="Volver al panel">
              <ArrowLeftIcon className="size-4" />
            </Link>
          </Button>
          <div>
            <h1 className="text-xl font-semibold tracking-tight">
              Builder de agente interactivo
            </h1>
            <p className="text-sm text-muted-foreground">
              Chat + diagrama en tiempo real. Progreso: {completion}%.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button onClick={() => void finalize()} disabled={saving}>
            {saving ? <Loader2Icon className="size-4 animate-spin" /> : <CheckIcon />}
            Finalizar
          </Button>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(320px,480px)_1fr]">
        <section className="flex min-h-[70vh] flex-col rounded-xl border border-border bg-card">
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
                  "max-w-[92%] rounded-xl px-3 py-2 text-sm",
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
              Siguiente objetivo:{" "}
              {nextMissingField(draftState)
                ? FIELD_PROMPTS[nextMissingField(draftState)!]
                : "Todo completo"}
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
              <Button size="icon" onClick={() => void handleSend()}>
                <SendIcon className="size-4" />
              </Button>
            </div>
          </div>
        </section>

        <section className="grid min-h-[70vh] gap-4 rounded-xl border border-border bg-card p-3 xl:grid-cols-[1fr_320px]">
          <div className="overflow-hidden rounded-lg border border-border">
            <ReactFlow
              nodes={flowNodes}
              edges={flowEdges}
              fitView
              onNodeClick={(_, node) => setActiveNode(node.id)}
            >
              <Background />
              <MiniMap />
              <Controls />
            </ReactFlow>
          </div>

          <aside className="space-y-4 overflow-y-auto rounded-lg border border-border p-3">
            <div className="space-y-2">
              <p className="text-sm font-medium">Nodo activo: {activeNode}</p>
              <p className="text-xs text-muted-foreground">
                Haz click en un nodo para enfocarte en su configuración.
              </p>
            </div>

            <div className="space-y-2 rounded-lg border border-border p-3">
              <Label htmlFor="tool_search">Tools</Label>
              <Input
                id="tool_search"
                placeholder="Buscar tool..."
                value={toolSearch}
                onChange={(e) => setToolSearch(e.target.value)}
              />
              <ul className="max-h-[180px] space-y-2 overflow-y-auto">
                {catalogLoading ? (
                  <li className="text-sm text-muted-foreground">Cargando tools...</li>
                ) : (
                  filteredCatalog.slice(0, 20).map((tool) => (
                    <li key={tool.id} className="flex items-start gap-2 text-sm">
                      <Checkbox
                        checked={draftState.selected_tools.includes(tool.id)}
                        onCheckedChange={() => void toggleTool(tool.id)}
                      />
                      <div className="min-w-0">
                        <p className="truncate font-medium">
                          {tool.displayName || tool.name}
                        </p>
                        <p className="line-clamp-2 text-xs text-muted-foreground">
                          {tool.description}
                        </p>
                      </div>
                    </li>
                  ))
                )}
              </ul>
            </div>

            <div className="space-y-2 rounded-lg border border-border p-3">
              <p className="text-sm font-medium">Tareas pendientes</p>
              <ul className="space-y-2">
                {pendingTasks.length === 0 ? (
                  <li className="text-xs text-muted-foreground">
                    Sin tareas pendientes.
                  </li>
                ) : (
                  pendingTasks.map((task) => (
                    <li key={task.id} className="flex items-start gap-2 rounded border p-2">
                      <Checkbox
                        checked={task.status === "completed"}
                        onCheckedChange={(checked) =>
                          void setTaskStatus(
                            task.id,
                            checked ? "completed" : "pending",
                          )
                        }
                      />
                      <div className="min-w-0">
                        <p
                          className={cn(
                            "text-sm",
                            task.status === "completed" && "line-through opacity-70",
                          )}
                        >
                          {task.title}
                        </p>
                        {task.context ? (
                          <p className="line-clamp-2 text-xs text-muted-foreground">
                            {task.context}
                          </p>
                        ) : null}
                      </div>
                    </li>
                  ))
                )}
              </ul>
            </div>

            <div className="space-y-2 rounded-lg border border-border p-3">
              <p className="text-sm font-medium">Campos clave</p>
              <div className="grid gap-2">
                <Label htmlFor="agent_name">Nombre del agente</Label>
                <Input
                  id="agent_name"
                  value={draftState.agent_name}
                  onChange={(e) =>
                    setDraftState((prev) => ({ ...prev, agent_name: e.target.value }))
                  }
                  onBlur={() => void persistState(updateStepFromState(draftState))}
                />
                <Label htmlFor="agent_personality">Personalidad</Label>
                <textarea
                  id="agent_personality"
                  className={textareaClass}
                  value={draftState.agent_personality}
                  onChange={(e) =>
                    setDraftState((prev) => ({
                      ...prev,
                      agent_personality: e.target.value,
                    }))
                  }
                  onBlur={() => void persistState(updateStepFromState(draftState))}
                />
              </div>
            </div>
          </aside>
        </section>
      </div>
    </div>
  );
}
