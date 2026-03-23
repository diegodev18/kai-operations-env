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
  postAgentBuilderChat,
  patchAgentDraft,
  postAgentDraft,
  type DraftPendingTask,
  type ToolsCatalogItem,
} from "@/lib/agents-api";
import { BuilderChatUiBlock } from "@/components/builder-chat-ui";
import type { BuilderChatUI } from "@/types/agents-api";
import { cn } from "@/lib/utils";

type ChatMessage = {
  id: string;
  role: "assistant" | "user";
  /** Texto enviado al API (puede ser UI_VALUE / UI_FORM). */
  text: string;
  /** Texto mostrado en la burbuja del usuario (legible). */
  displayText?: string;
  ui?: BuilderChatUI;
};

/** Texto legible para burbujas de usuario cuando no hay displayText (p. ej. mensajes antiguos). */
function formatUserBubbleText(raw: string): string {
  const valueMatch = /^UI_VALUE:([^:]+):([\s\S]+)$/.exec(raw);
  if (valueMatch) {
    try {
      return decodeURIComponent(valueMatch[2]);
    } catch {
      return valueMatch[2];
    }
  }
  const formMatch = /^UI_FORM:([^:]+):([\s\S]+)$/.exec(raw);
  if (formMatch) {
    try {
      const obj = JSON.parse(formMatch[2]) as Record<string, string>;
      const entries = Object.entries(obj).filter(([, v]) => String(v).trim());
      if (entries.length === 0) return "Formulario enviado";
      return entries
        .slice(0, 5)
        .map(([k, v]) => `${k}: ${v}`)
        .join(" · ");
    } catch {
      return "Formulario enviado";
    }
  }
  return raw;
}
const THINKING_LABELS = [
  "Construyendo agente...",
  "Refinando agente...",
  "Analizando contexto...",
  "Buscando tools relevantes...",
  "Ajustando la respuesta...",
  "Optimizando el flujo...",
];

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

type BusinessFieldKey =
  | "business_name"
  | "owner_name"
  | "industry"
  | "description"
  | "target_audience"
  | "agent_description"
  | "escalation_rules";

type DraftTextKey =
  | "agent_name"
  | "agent_personality"
  | "business_name"
  | "owner_name"
  | "industry"
  | "description"
  | "agent_description"
  | "target_audience"
  | "escalation_rules"
  | "country";

const BUSINESS_FLOW: BusinessFieldKey[] = [
  "business_name",
  "owner_name",
  "industry",
  "description",
  "target_audience",
  "agent_description",
  "escalation_rules",
];

const BUSINESS_FIELD_GRAPH: Array<{ key: BusinessFieldKey; label: string }> = [
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

function pickFirstString(
  source: Record<string, unknown>,
  paths: string[],
): string {
  for (const path of paths) {
    const parts = path.split(".");
    let current: unknown = source;
    for (const part of parts) {
      if (current == null || typeof current !== "object") {
        current = undefined;
        break;
      }
      current = (current as Record<string, unknown>)[part];
    }
    if (typeof current === "string" && current.trim()) {
      return current.trim();
    }
  }
  return "";
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
  catalogById: Map<string, ToolsCatalogItem>,
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

    state.selected_tools.slice(0, 8).forEach((toolId, index) => {
      const tool = catalogById.get(toolId);
      const label = tool?.displayName || tool?.name || toolId;
      const col = index % 2;
      const row = Math.floor(index / 2);
      const nodeId = `tool-${toolId}`;
      nodes.push({
        id: nodeId,
        position: { x: 560 + col * 260, y: 10 - row * 80 },
        data: { label: label.slice(0, 46) },
        style: withCardStyle(230),
      });
      edges.push({
        id: `e-tools-${toolId}`,
        source: "tools",
        target: nodeId,
      });
    });
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
  const [catalog, setCatalog] = useState<ToolsCatalogItem[]>([]);
  const [pendingTasks, setPendingTasks] = useState<DraftPendingTask[]>([]);
  const [queuedDeferredTexts, setQueuedDeferredTexts] = useState<string[]>([]);
  const [confirmedSummary, setConfirmedSummary] = useState(false);
  const [isThinking, setIsThinking] = useState(false);
  const [thinkingLabel, setThinkingLabel] = useState("Construyendo agente...");
  const [typingMessageId, setTypingMessageId] = useState<string | null>(null);
  const [isHydratingDraft, setIsHydratingDraft] = useState(false);
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
  const hasHydratedDraftRef = useRef(false);

  const addMessage = useCallback(
    (role: ChatMessage["role"], text: string, displayText?: string) => {
      setChatMessages((prev) => [
        ...prev,
        {
          id: nowId(),
          role,
          text,
          ...(displayText != null && displayText !== "" ? { displayText } : {}),
        },
      ]);
    },
    [],
  );

  const pickThinkingLabel = useCallback(() => {
    const index = Math.floor(Math.random() * THINKING_LABELS.length);
    return THINKING_LABELS[index] ?? THINKING_LABELS[0];
  }, []);

  const addAssistantMessageProgressive = useCallback(
    async (fullText: string, ui?: BuilderChatUI) => {
      const id = nowId();
      const normalized = fullText.trim();
      setTypingMessageId(id);
      setChatMessages((prev) => [...prev, { id, role: "assistant", text: "" }]);
      if (!normalized) {
        setTypingMessageId((current) => (current === id ? null : current));
        return;
      }
      const step = normalized.length > 420 ? 5 : normalized.length > 220 ? 4 : 3;
      for (let index = step; index <= normalized.length + step; index += step) {
        const partial = normalized.slice(0, Math.min(index, normalized.length));
        setChatMessages((prev) =>
          prev.map((message) => (message.id === id ? { ...message, text: partial } : message)),
        );
        await new Promise((resolve) => setTimeout(resolve, 16));
      }
      setChatMessages((prev) =>
        prev.map((message) =>
          message.id === id
            ? {
                ...message,
                text: normalized,
                ...(ui ? { ui } : {}),
              }
            : message,
        ),
      );
      setTypingMessageId((current) => (current === id ? null : current));
    },
    [],
  );

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

  const catalogById = useMemo(() => {
    return new Map(catalog.map((tool) => [tool.id, tool]));
  }, [catalog]);

  const graph = useMemo(
    () => buildProgressiveGraph(draftState, pendingTasks, catalogById, confirmedSummary),
    [catalogById, draftState, pendingTasks, confirmedSummary],
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
      if (list) setCatalog(list);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!draftFromUrl) {
      hasHydratedDraftRef.current = true;
      setLoadingDraft(false);
      return;
    }
    let cancelled = false;
    setLoadingDraft(true);
    setIsHydratingDraft(true);
    void (async () => {
      const res = await fetchAgentDraft(draftFromUrl);
      if (cancelled) return;
      setLoadingDraft(false);
      if (!res.ok) {
        setIsHydratingDraft(false);
        toast.error(res.error);
        return;
      }
      const d = res.draft as Record<string, unknown>;
      const creationStepRaw = str(d.creation_step);
      const creationStep: DraftState["creation_step"] =
        creationStepRaw === "business" ||
        creationStepRaw === "tools" ||
        creationStepRaw === "personality" ||
        creationStepRaw === "complete"
          ? creationStepRaw
          : "personality";
      const nextState = updateStepFromState({
        agent_name: pickFirstString(d, [
          "agent_name",
          "mcp_configuration.agent_personalization.agent_name",
        ]),
        agent_personality: pickFirstString(d, [
          "agent_personality",
          "mcp_configuration.agent_personalization.agent_personality",
        ]),
        business_name: pickFirstString(d, [
          "business_name",
          "mcp_configuration.agent_business_info.business_name",
        ]),
        owner_name: pickFirstString(d, [
          "owner_name",
          "mcp_configuration.agent_business_info.owner_name",
        ]),
        industry: pickFirstString(d, [
          "industry",
          "mcp_configuration.agent_business_info.industry",
        ]),
        description: pickFirstString(d, [
          "description",
          "mcp_configuration.agent_business_info.description",
        ]),
        agent_description: pickFirstString(d, [
          "agent_description",
          "mcp_configuration.agent_business_info.agent_description",
        ]),
        target_audience: pickFirstString(d, [
          "target_audience",
          "mcp_configuration.agent_business_info.target_audience",
        ]),
        escalation_rules: pickFirstString(d, [
          "escalation_rules",
          "mcp_configuration.agent_business_info.escalation_rules",
        ]),
        country: pickFirstString(d, [
          "country",
          "mcp_configuration.agent_business_info.country",
        ]),
        selected_tools: Array.isArray(d.selected_tools)
          ? d.selected_tools.filter((x): x is string => typeof x === "string")
          : [],
        creation_step: creationStep,
      });
      setDraftId(res.id);
      setDraftState(nextState);
      setConfirmedSummary(nextState.creation_step === "complete");
      const contextLines = [
        "Borrador cargado. Este es tu contexto actual:",
        nextState.business_name.trim() ? `- Negocio: ${nextState.business_name}` : null,
        nextState.industry.trim() ? `- Industria: ${nextState.industry}` : null,
        nextState.target_audience.trim() ? `- Audiencia: ${nextState.target_audience}` : null,
        nextState.agent_description.trim()
          ? `- Rol del agente: ${nextState.agent_description}`
          : null,
        nextState.agent_name.trim() ? `- Nombre del agente: ${nextState.agent_name}` : null,
        `- Tools seleccionadas: ${nextState.selected_tools.length}`,
      ].filter((line): line is string => Boolean(line));
      setChatMessages([
        {
          id: nowId(),
          role: "assistant",
          text: contextLines.join("\n"),
        },
      ]);
      await syncPendingTasks(res.id);
      hasHydratedDraftRef.current = true;
      setIsHydratingDraft(false);
    })();
    return () => {
      cancelled = true;
      setIsHydratingDraft(false);
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
        const textKeys: DraftTextKey[] = [
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

  const sendUserText = useCallback(
    async (text: string, displayText?: string) => {
      const trimmed = text.trim();
      if (!trimmed || isThinking) return;

      addMessage("user", trimmed, displayText);
      await handleDeferredTask(trimmed);

      if (trimmed.toLowerCase() === "confirmar") {
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

      setThinkingLabel(pickThinkingLabel());
      setIsThinking(true);
      try {
        const llmRes = await postAgentBuilderChat({
          messages: [...chatMessages, { role: "user", text: trimmed }],
          draftState,
          pendingTasksCount: pendingTasks.length,
        });
        if (!llmRes.ok) {
          addMessage("assistant", `No pude responder en este momento: ${llmRes.error}`);
          return;
        }
        applyDraftPatch(llmRes.draftPatch as Record<string, unknown>);
        await addAssistantMessageProgressive(llmRes.assistantMessage, llmRes.ui);
      } finally {
        setIsThinking(false);
      }
    },
    [
      addAssistantMessageProgressive,
      applyDraftPatch,
      addMessage,
      chatMessages,
      draftState,
      handleDeferredTask,
      isThinking,
      pendingTasks.length,
      persistState,
      readyToConfirm,
      updateStepFromState,
      pickThinkingLabel,
    ],
  );

  const handleSend = useCallback(async () => {
    const text = chatInput.trim();
    if (!text) return;
    setChatInput("");
    await sendUserText(text);
  }, [chatInput, sendUserText]);

  useEffect(() => {
    if (!hasHydratedDraftRef.current) return;
    if (loadingDraft || isHydratingDraft) return;
    void persistState(draftState, false);
  }, [draftState, isHydratingDraft, loadingDraft, persistState]);

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
                {message.role === "user"
                  ? (message.displayText ?? formatUserBubbleText(message.text))
                  : message.text}
                {typingMessageId === message.id ? (
                  <span className="ml-0.5 inline-block animate-pulse align-baseline font-mono">
                    ▍
                  </span>
                ) : null}
                {message.role === "assistant" &&
                message.ui &&
                typingMessageId !== message.id ? (
                  <BuilderChatUiBlock
                    ui={message.ui}
                    disabled={isThinking}
                    onSend={(payload, displayText) => void sendUserText(payload, displayText)}
                  />
                ) : null}
              </div>
            ))}
            {isThinking ? (
              <div className="max-w-[92%] px-1 py-1 text-sm text-muted-foreground">
                <div className="relative inline-block">
                  <span className="shine-text relative">
                    {thinkingLabel}
                    <span className="ml-0.5 inline-block animate-pulse">▍</span>
                  </span>
                </div>
              </div>
            ) : null}
          </div>
          <div className="space-y-2 border-t border-border p-3">
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
      <style jsx>{`
        .shine-text {
          color: rgba(255, 255, 255, 0.36);
          background-image:
            linear-gradient(rgba(255, 255, 255, 0.36), rgba(255, 255, 255, 0.36)),
            linear-gradient(
              110deg,
              rgba(255, 255, 255, 0) 0%,
              rgba(255, 255, 255, 0) 42%,
              rgba(255, 255, 255, 0.7) 50%,
              rgba(255, 255, 255, 0) 58%,
              rgba(255, 255, 255, 0) 100%
            );
          background-size:
            100% 100%,
            220px 100%;
          background-repeat:
            no-repeat,
            no-repeat;
          background-position:
            0 0,
            -220px 0;
          background-clip: text;
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          animation: subtle-shine 2.8s linear infinite;
        }

        @keyframes subtle-shine {
          0% {
            background-position:
              0 0,
              -220px 0;
          }
          100% {
            background-position:
              0 0,
              calc(100% + 220px) 0;
          }
        }
      `}</style>
    </div>
  );
}
