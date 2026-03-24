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
  PlusIcon,
  CheckIcon,
  PencilIcon,
  XIcon,
  Loader2Icon,
  MessageSquareIcon,
  SendIcon,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogFooter,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  createDraftPendingTask,
  createDraftPropertyItem,
  deleteDraftPropertyItem,
  fetchAgentDraft,
  fetchDraftPropertyItems,
  fetchDraftPendingTasks,
  fetchToolsCatalog,
  patchDraftPropertyItem,
  postAgentBuilderChat,
  patchAgentDraft,
  postAgentDraft,
  type DraftPendingTask,
  type DraftPropertyItem,
  type ToolsCatalogItem,
} from "@/lib/agents-api";
import { BuilderChatUiBlock } from "@/components/builder-chat-ui";
import { ToolsCatalogSearchList } from "@/components/tools-catalog-search-list";
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
  const multiMatch = /^UI_MULTI:([^:]+):([\s\S]+)$/.exec(raw);
  if (multiMatch) {
    try {
      const parsed = JSON.parse(multiMatch[2]) as {
        selected?: Array<{ label?: string; value?: string }>;
      };
      const items = parsed.selected ?? [];
      if (items.length === 0) return "Selección vacía";
      return items
        .map((s) => (s.label ?? s.value ?? "").trim())
        .filter(Boolean)
        .join(" · ");
    } catch {
      return "Selección múltiple";
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

type ManualNode = {
  id: string;
  title: string;
  value: string;
};

type ManualSection = "business" | "personality";

function manualSectionDocId(section: ManualSection): "business" | "personality" {
  return section;
}

function mapDraftPropertyItemToManualNode(item: DraftPropertyItem): ManualNode {
  return {
    id: item.id,
    title: item.title,
    value: item.content,
  };
}

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

function nodeLabelCard({
  title,
  value,
  canDelete = false,
  onDelete,
}: {
  title: string;
  value?: string;
  canDelete?: boolean;
  onDelete?: () => void;
}) {
  return (
    <div className="group relative pr-5">
      <p className="text-xs font-medium text-muted-foreground">{title}</p>
      {value ? <p className="mt-1 text-sm">{value}</p> : null}
      {canDelete ? (
        <button
          type="button"
          className="absolute -top-1 -right-1 rounded-full border border-border bg-background p-0.5 opacity-0 transition-opacity group-hover:opacity-100"
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            onDelete?.();
          }}
          aria-label={`Eliminar ${title}`}
        >
          <XIcon className="size-3" />
        </button>
      ) : null}
    </div>
  );
}

function buildProgressiveGraph(
  state: DraftState,
  pendingTasks: DraftPendingTask[],
  catalogById: Map<string, ToolsCatalogItem>,
  confirmed: boolean,
  businessManualNodes: ManualNode[],
  personalityManualNodes: ManualNode[],
  onRemoveTool: (toolId: string) => void,
  onRemoveManualBusinessNode: (nodeId: string) => void,
  onRemoveManualPersonalityNode: (nodeId: string) => void,
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
        label: "Negocio",
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
          label: nodeLabelCard({ title: field.label, value }),
        },
        style: withCardStyle(230),
      });
      edges.push({
        id: `e-business-${field.key}`,
        source: "business",
        target: fieldNodeId,
      });
    });
    businessManualNodes.forEach((item, index) => {
      const baseId = `business-manual-${item.id}`;
      const x = 960 + (index % 2) * 250;
      const y = 820 + Math.floor(index / 2) * 84;
      nodes.push({
        id: baseId,
        position: { x, y },
        data: {
          label: nodeLabelCard({
            title: item.title.slice(0, 36),
            value: fieldNodeValue(item.value),
            canDelete: true,
            onDelete: () => onRemoveManualBusinessNode(item.id),
          }),
        },
        style: withCardStyle(230),
      });
      edges.push({
        id: `e-business-manual-${item.id}`,
        source: "business",
        target: baseId,
      });
    });
    nodes.push({
      id: "business-add-manual",
      position: {
        x: 960,
        y: 820 + Math.ceil(businessManualNodes.length / 2) * 84 + 40,
      },
      data: {
        label: (
          <div className="flex items-center gap-2 text-sm">
            <PlusIcon className="size-4" />
            Agregar nodo manual
          </div>
        ),
      },
      style: withCardStyle(220),
    });
    edges.push({
      id: "e-business-add-manual",
      source: "business",
      target: "business-add-manual",
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

    state.selected_tools.forEach((toolId, index) => {
      const tool = catalogById.get(toolId);
      const label = tool?.displayName || tool?.name || toolId;
      const col = index % 2;
      const row = Math.floor(index / 2);
      const nodeId = `tool-${toolId}`;
      nodes.push({
        id: nodeId,
        position: { x: 560 + col * 260, y: 10 - row * 80 },
        data: {
          label: nodeLabelCard({
            title: "Tool",
            value: label.slice(0, 46),
            canDelete: true,
            onDelete: () => onRemoveTool(toolId),
          }),
        },
        style: withCardStyle(230),
      });
      edges.push({
        id: `e-tools-${toolId}`,
        source: "tools",
        target: nodeId,
      });
    });
    nodes.push({
      id: "tool-add",
      position: { x: 820, y: -320 },
      data: {
        label: (
          <div className="flex items-center gap-2 text-sm">
            <PlusIcon className="size-4" />
            Agregar tool
          </div>
        ),
      },
      style: withCardStyle(200),
    });
    edges.push({
      id: "e-tools-add",
      source: "tools",
      target: "tool-add",
    });
  }

  if (personalityVisible) {
    nodes.push({
      id: "personality",
      position: { x: 330, y: 340 },
      data: {
        label: "Personalidad",
      },
      style: withCardStyle(220),
    });
    edges.push({
      id: "e-root-personality",
      source: "agentRoot",
      target: "personality",
    });
    if (state.agent_name.trim()) {
      nodes.push({
        id: "personality-name",
        position: { x: 250, y: 470 },
        data: {
          label: nodeLabelCard({
            title: "Nombre del agente",
            value: fieldNodeValue(state.agent_name),
          }),
        },
        style: withCardStyle(230),
      });
      edges.push({
        id: "e-personality-name",
        source: "personality",
        target: "personality-name",
      });
    }
    if (state.agent_personality.trim()) {
      nodes.push({
        id: "personality-style",
        position: { x: 500, y: 470 },
        data: {
          label: nodeLabelCard({
            title: "Estilo",
            value: fieldNodeValue(state.agent_personality),
          }),
        },
        style: withCardStyle(230),
      });
      edges.push({
        id: "e-personality-style",
        source: "personality",
        target: "personality-style",
      });
    }
    personalityManualNodes.forEach((item, index) => {
      const x = 250 + (index % 2) * 250;
      const y = 560 + Math.floor(index / 2) * 84;
      const nodeId = `personality-manual-${item.id}`;
      nodes.push({
        id: nodeId,
        position: { x, y },
        data: {
          label: nodeLabelCard({
            title: item.title.slice(0, 36),
            value: fieldNodeValue(item.value),
            canDelete: true,
            onDelete: () => onRemoveManualPersonalityNode(item.id),
          }),
        },
        style: withCardStyle(230),
      });
      edges.push({
        id: `e-personality-manual-${item.id}`,
        source: "personality",
        target: nodeId,
      });
    });
    nodes.push({
      id: "personality-add-manual",
      position: {
        x: 250,
        y: 560 + Math.ceil(personalityManualNodes.length / 2) * 84 + 38,
      },
      data: {
        label: (
          <div className="flex items-center gap-2 text-sm">
            <PlusIcon className="size-4" />
            Agregar nodo manual
          </div>
        ),
      },
      style: withCardStyle(220),
    });
    edges.push({
      id: "e-personality-add-manual",
      source: "personality",
      target: "personality-add-manual",
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
  /** Evita PATCH al hidratar un borrador ya marcado como completo en servidor. */
  const skipDraftPersistenceRef = useRef(false);

  const [agentCreatedDialogOpen, setAgentCreatedDialogOpen] = useState(false);
  const [toolsDialogOpen, setToolsDialogOpen] = useState(false);
  const [toolSearch, setToolSearch] = useState("");
  const [editingToolId, setEditingToolId] = useState<string | null>(null);
  const [manualDialogOpen, setManualDialogOpen] = useState(false);
  const [manualSection, setManualSection] = useState<ManualSection>("business");
  const [manualNodesBusiness, setManualNodesBusiness] = useState<ManualNode[]>([]);
  const [manualNodesPersonality, setManualNodesPersonality] = useState<ManualNode[]>([]);
  const [manualEditingId, setManualEditingId] = useState<string | null>(null);
  const [manualTitle, setManualTitle] = useState("");
  const [manualValue, setManualValue] = useState("");

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

  const removeToolFromDraft = useCallback((toolId: string) => {
    setDraftState((prev) =>
      updateStepFromState({
        ...prev,
        selected_tools: prev.selected_tools.filter((id) => id !== toolId),
      }),
    );
  }, [updateStepFromState]);

  const openManualNodeDialog = useCallback(
    (section: ManualSection, node?: ManualNode) => {
      setManualSection(section);
      setManualEditingId(node?.id ?? null);
      setManualTitle(node?.title ?? "");
      setManualValue(node?.value ?? "");
      setManualDialogOpen(true);
    },
    [],
  );

  const removeManualNode = useCallback(
    async (section: ManualSection, itemId: string) => {
      if (draftId) {
        const deleted = await deleteDraftPropertyItem(
          draftId,
          manualSectionDocId(section),
          itemId,
        );
        if (!deleted.ok) {
          toast.error(deleted.error);
          return;
        }
      }
      if (section === "business") {
        setManualNodesBusiness((prev) => prev.filter((node) => node.id !== itemId));
      } else {
        setManualNodesPersonality((prev) => prev.filter((node) => node.id !== itemId));
      }
    },
    [draftId],
  );

  const graph = useMemo(
    () =>
      buildProgressiveGraph(
        draftState,
        pendingTasks,
        catalogById,
        confirmedSummary,
        manualNodesBusiness,
        manualNodesPersonality,
        removeToolFromDraft,
        (nodeId) => void removeManualNode("business", nodeId),
        (nodeId) => void removeManualNode("personality", nodeId),
      ),
    [
      catalogById,
      confirmedSummary,
      draftState,
      manualNodesBusiness,
      manualNodesPersonality,
      pendingTasks,
      removeManualNode,
      removeToolFromDraft,
    ],
  );

  const syncPendingTasks = useCallback(async (id: string) => {
    const res = await fetchDraftPendingTasks(id);
    if (res) setPendingTasks(res.tasks);
  }, []);

  const syncManualNodesFromDraft = useCallback(async (id: string) => {
    const [personalityRes, businessRes] = await Promise.all([
      fetchDraftPropertyItems(id, "personality"),
      fetchDraftPropertyItems(id, "business"),
    ]);
    if (personalityRes) {
      setManualNodesPersonality(personalityRes.items.map(mapDraftPropertyItemToManualNode));
    }
    if (businessRes) {
      setManualNodesBusiness(businessRes.items.map(mapDraftPropertyItemToManualNode));
    }
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
    [draftId, flushQueuedDeferredTasks, syncPendingTasks, updateStepFromState],
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
      skipDraftPersistenceRef.current = false;
      setLoadingDraft(false);
      setManualNodesBusiness([]);
      setManualNodesPersonality([]);
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
      const serverMarkedComplete = creationStepRaw === "complete";
      const flowComplete =
        serverMarkedComplete || nextState.creation_step === "complete";

      setDraftId(res.id);
      setDraftState(nextState);
      setConfirmedSummary(flowComplete);

      if (flowComplete) {
        skipDraftPersistenceRef.current = true;
        lastSyncedRef.current.complete = true;
        setAgentCreatedDialogOpen(true);
        setChatMessages([]);
      } else {
        skipDraftPersistenceRef.current = false;
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
      }
      await syncPendingTasks(res.id);
      await syncManualNodesFromDraft(res.id);
      hasHydratedDraftRef.current = true;
      setIsHydratingDraft(false);
    })();
    return () => {
      cancelled = true;
      setIsHydratingDraft(false);
    };
  }, [draftFromUrl, syncManualNodesFromDraft, syncPendingTasks, updateStepFromState]);

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
        setAgentCreatedDialogOpen(true);
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
    if (skipDraftPersistenceRef.current) return;
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
          disabled={saving || !readyToConfirm || agentCreatedDialogOpen}
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
            {chatMessages.map((message, messageIndex) => {
              const isLatestInThread = messageIndex === chatMessages.length - 1;
              /** Solo el último mensaje del hilo puede tener UI activa; tras enviar o elegir opción, queda bloqueada. */
              const uiInteractive = isLatestInThread && !isThinking;
              return (
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
                    disabled={!uiInteractive}
                    onSend={(payload, displayText) => void sendUserText(payload, displayText)}
                  />
                ) : null}
              </div>
              );
            })}
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
                disabled={agentCreatedDialogOpen}
                placeholder="Escribe un mensaje..."
              />
              <Button
                size="icon"
                onClick={() => void handleSend()}
                disabled={isThinking || agentCreatedDialogOpen}
              >
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
              onNodeClick={(_event, node) => {
                if (node.id === "tool-add") {
                  setEditingToolId(null);
                  setToolsDialogOpen(true);
                  return;
                }
                if (node.id.startsWith("tool-")) {
                  const toolId = node.id.slice("tool-".length);
                  setEditingToolId(toolId);
                  setToolsDialogOpen(true);
                  return;
                }
                if (node.id === "business-add-manual") {
                  openManualNodeDialog("business");
                  return;
                }
                if (node.id === "personality-add-manual") {
                  openManualNodeDialog("personality");
                  return;
                }
                if (node.id.startsWith("business-manual-")) {
                  const nodeId = node.id.slice("business-manual-".length);
                  const target = manualNodesBusiness.find((item) => item.id === nodeId);
                  if (target) openManualNodeDialog("business", target);
                  return;
                }
                if (node.id.startsWith("personality-manual-")) {
                  const nodeId = node.id.slice("personality-manual-".length);
                  const target = manualNodesPersonality.find((item) => item.id === nodeId);
                  if (target) openManualNodeDialog("personality", target);
                }
              }}
              fitView
              minZoom={0.3}
              maxZoom={1.8}
            >
              <Background />
            </ReactFlow>
          </div>
        </section>
      </div>
      <Dialog open={toolsDialogOpen} onOpenChange={setToolsDialogOpen}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>
              {editingToolId ? "Editar tool del diagrama" : "Agregar tools"}
            </DialogTitle>
            <DialogDescription>
              Selecciona herramientas del catálogo. Al hacer clic en una tool del diagrama puedes reemplazarla o eliminarla.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <ToolsCatalogSearchList
              tools={catalog}
              maxItems={60}
              value={toolSearch}
              onValueChange={setToolSearch}
              onSelect={(item) => {
                setDraftState((prev) => {
                  const has = prev.selected_tools.includes(item.id);
                  let selected = prev.selected_tools;
                  if (editingToolId) {
                    selected = prev.selected_tools.map((id) =>
                      id === editingToolId ? item.id : id,
                    );
                  } else if (!has) {
                    selected = [...prev.selected_tools, item.id];
                  }
                  return updateStepFromState({
                    ...prev,
                    selected_tools: [...new Set(selected)],
                  });
                });
                setToolsDialogOpen(false);
                setEditingToolId(null);
              }}
              placeholder="Buscar tool por nombre o descripción..."
            />
            {editingToolId ? (
              <Button
                type="button"
                variant="destructive"
                onClick={() => {
                  removeToolFromDraft(editingToolId);
                  setToolsDialogOpen(false);
                  setEditingToolId(null);
                }}
              >
                <XIcon className="mr-2 size-4" />
                Eliminar tool seleccionada
              </Button>
            ) : null}
          </div>
        </DialogContent>
      </Dialog>
      <Dialog open={manualDialogOpen} onOpenChange={setManualDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {manualEditingId ? "Editar nodo manual" : "Nuevo nodo manual"}
            </DialogTitle>
            <DialogDescription>
              Este nodo se agregará en {manualSection === "business" ? "Negocio" : "Personalidad"}.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Título</Label>
              <Input
                value={manualTitle}
                onChange={(event) => setManualTitle(event.target.value)}
                placeholder="Ej. Horarios especiales"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Valor</Label>
              <Input
                value={manualValue}
                onChange={(event) => setManualValue(event.target.value)}
                placeholder="Ej. Domingos hasta las 11pm"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setManualDialogOpen(false);
                setManualEditingId(null);
              }}
            >
              Cancelar
            </Button>
            <Button
              onClick={async () => {
                if (!manualTitle.trim() || !manualValue.trim()) return;
                if (!draftId) {
                  toast.error("Primero completa los datos base para crear el borrador.");
                  return;
                }
                const sectionDocId = manualSectionDocId(manualSection);
                if (manualEditingId) {
                  const updated = await patchDraftPropertyItem(
                    draftId,
                    sectionDocId,
                    manualEditingId,
                    {
                      title: manualTitle.trim(),
                      content: manualValue.trim(),
                    },
                  );
                  if (!updated.ok) {
                    toast.error(updated.error);
                    return;
                  }
                  const payload = mapDraftPropertyItemToManualNode(updated.item);
                  if (manualSection === "business") {
                    setManualNodesBusiness((prev) =>
                      prev.map((item) => (item.id === manualEditingId ? payload : item)),
                    );
                  } else {
                    setManualNodesPersonality((prev) =>
                      prev.map((item) => (item.id === manualEditingId ? payload : item)),
                    );
                  }
                } else {
                  const created = await createDraftPropertyItem(
                    draftId,
                    sectionDocId,
                    {
                      title: manualTitle.trim(),
                      content: manualValue.trim(),
                    },
                  );
                  if (!created.ok) {
                    toast.error(created.error);
                    return;
                  }
                  const payload = mapDraftPropertyItemToManualNode(created.item);
                  if (manualSection === "business") {
                    setManualNodesBusiness((prev) => [...prev, payload]);
                  } else {
                    setManualNodesPersonality((prev) => [...prev, payload]);
                  }
                }
                setManualDialogOpen(false);
                setManualEditingId(null);
                setManualTitle("");
                setManualValue("");
              }}
            >
              {manualEditingId ? (
                <PencilIcon className="mr-2 size-4" />
              ) : (
                <PlusIcon className="mr-2 size-4" />
              )}
              Guardar nodo
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={agentCreatedDialogOpen}>
        <DialogContent
          showClose={false}
          className="sm:max-w-md"
          onPointerDownOutside={(e) => e.preventDefault()}
          onEscapeKeyDown={(e) => e.preventDefault()}
        >
          <DialogHeader>
            <DialogTitle>Agente construido</DialogTitle>
            <DialogDescription>
              El builder finalizó correctamente. ¿Qué deseas hacer ahora?
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-2 pt-2">
            <Button
              type="button"
              onClick={() => {
                setAgentCreatedDialogOpen(false);
                if (!draftId) return;
                router.push(`/agents/${draftId}/configuration`);
              }}
              disabled={!draftId}
            >
              Ir a configuración del agente
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setAgentCreatedDialogOpen(false);
                window.location.assign("/agents/new");
              }}
            >
              Crear otro agente
            </Button>
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                setAgentCreatedDialogOpen(false);
                router.push("/");
              }}
            >
              Volver a la página principal
            </Button>
          </div>
        </DialogContent>
      </Dialog>

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
