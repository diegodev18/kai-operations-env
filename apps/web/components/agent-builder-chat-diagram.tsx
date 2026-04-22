"use client";

import "@xyflow/react/dist/style.css";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  applyNodeChanges,
  Background,
  ReactFlow,
  type Edge,
  type Node,
  type NodeChange,
} from "@xyflow/react";
import {
  ArrowLeftIcon,
  BotIcon,
  PlusIcon,
  CheckIcon,
  PencilIcon,
  Trash2Icon,
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
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  createDraftPendingTask,
  createDraftPropertyItem,
  deleteDraftPropertyItem,
  fetchAgentDraft,
  fetchDraftPropertyItems,
  fetchDraftPendingTasks,
  fetchDraftTechnicalProperties,
  fetchToolsCatalog,
  patchDraftPropertyItem,
  patchDraftTechnicalPropertyDocument,
  postAgentBuilderChat,
  patchAgentDraft,
  postAgentDraft,
  type DraftPendingTask,
  type DraftPropertyItem,
  type ToolsCatalogItem,
} from "@/services/agents-api";
import { BuilderChatUiBlock } from "@/components/builder-chat-ui";
import { Checkbox } from "@/components/ui/checkbox";
import { ToolsCatalogSearchList } from "@/components/tools-catalog-search-list";
import {
  BUILDER_TECHNICAL_FIELDS,
  BUILDER_TECH_PROPERTY_DEPENDENCY_EDGES,
  formatTechnicalFieldValue,
  getTechFieldDefault,
} from "@/lib/form-builder/builder-technical-properties";
import {
  PROPERTY_DESCRIPTIONS,
  PROPERTY_TITLES,
} from "@/consts/form-builder/property-descriptions";
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
  /** Idioma en que el agente hablará con el usuario (el system prompt generado se guarda en inglés). */
  response_language: string;
  business_name: string;
  owner_name: string;
  industry: string;
  description: string;
  agent_description: string;
  target_audience: string;
  escalation_rules: string;
  country: string;
  use_emojis: string;
  country_accent: string;
  agent_signature: string;
  business_timezone: string;
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
  | "escalation_rules"
  | "business_timezone"
  | "country";

type DraftTextKey =
  | "agent_name"
  | "agent_personality"
  | "response_language"
  | "business_name"
  | "owner_name"
  | "industry"
  | "description"
  | "agent_description"
  | "target_audience"
  | "escalation_rules"
  | "country"
  | "use_emojis"
  | "country_accent"
  | "agent_signature"
  | "business_timezone";

type ManualNode = {
  id: string;
  title: string;
  value: string;
};

type ManualSection = "business" | "personality";
type BuilderMode = "unselected" | "conversational" | "form";
type FormStep = "business" | "tools" | "personality" | "review";

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
  "business_timezone",
  "country",
];
const FORM_STEPS: FormStep[] = ["business", "tools", "personality", "review"];

const BUSINESS_FIELD_GRAPH: Array<{ key: BusinessFieldKey; label: string }> = [
  { key: "business_name", label: "Nombre" },
  { key: "owner_name", label: "Responsable" },
  { key: "industry", label: "Industria" },
  { key: "description", label: "Descripción" },
  { key: "target_audience", label: "Audiencia" },
  { key: "agent_description", label: "Rol del agente" },
  { key: "escalation_rules", label: "Escalamiento" },
  { key: "business_timezone", label: "Zona horaria" },
  { key: "country", label: "País" },
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
  return (
    !!state.agent_name.trim() &&
    !!state.agent_personality.trim() &&
    !!state.response_language.trim() &&
    !!state.use_emojis.trim() &&
    !!state.country_accent.trim() &&
    !!state.agent_signature.trim()
  );
}

/** Lista legible de lo que impide cerrar el builder (alineado con `readyToConfirm`). */
function getBuilderIncompleteItems(state: DraftState): string[] {
  const items: string[] = [];
  for (const key of BUSINESS_FLOW) {
    if (!state[key].trim()) {
      const label = BUSINESS_FIELD_GRAPH.find((f) => f.key === key)?.label ?? key;
      items.push(`Negocio — ${label}`);
    }
  }
  if (state.selected_tools.length === 0) {
    items.push("Tools — al menos una herramienta del catálogo");
  }
  if (!state.agent_name.trim()) {
    items.push("Personalidad — nombre del agente");
  }
  if (!state.agent_personality.trim()) {
    items.push("Personalidad — estilo del agente");
  }
  if (!state.response_language.trim()) {
    items.push("Personalidad — idioma de respuesta al usuario");
  }
  if (!state.use_emojis.trim()) {
    items.push("Personalidad — uso de emojis");
  }
  if (!state.country_accent.trim()) {
    items.push("Personalidad — acento / dialecto");
  }
  if (!state.agent_signature.trim()) {
    items.push("Personalidad — firma / despedida");
  }
  return items;
}

function buildConfirmIncompletePromptForModel(state: DraftState): string {
  const missing = getBuilderIncompleteItems(state);
  const list = missing.map((line) => `- ${line}`).join("\n");
  return [
    "Quiero confirmar y finalizar el builder, pero el sistema indica que aún no se puede cerrar.",
    "Falta completar lo siguiente:",
    list,
    "",
    "Guía al usuario paso a paso para terminar la configuración. Si puedes inferir valores del contexto previo, proponlos en draftPatch y pide confirmación cuando sea necesario.",
  ].join("\n");
}

function hasAnyBusinessValue(state: DraftState) {
  return BUSINESS_FLOW.some((f) => !!state[f].trim());
}

function withCardStyle(width: number, dimmed = false) {
  return {
    width,
    borderRadius: 12,
    border: "1px solid var(--border)",
    background: "var(--card)",
    color: "var(--card-foreground)",
    opacity: dimmed ? 0.5 : 1,
    transition: "all 0.3s ease",
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
      {value ? <p className="mt-1 text-sm">{value}</p> : <p className="mt-1 text-sm text-muted-foreground">Sin definir</p>}
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

/** Al recalcular el grafo, mantiene posiciones que el usuario arrastró. */
function mergeGraphNodesPreservingPositions(prev: Node[], next: Node[]): Node[] {
  const posById = new Map(prev.map((n) => [n.id, n.position]));
  return next.map((n) => {
    const pos = posById.get(n.id);
    return pos ? { ...n, position: pos } : n;
  });
}

function buildProgressiveGraph(
  state: DraftState,
  pendingTasks: DraftPendingTask[],
  catalogById: Map<string, ToolsCatalogItem>,
  confirmed: boolean,
  businessManualNodes: ManualNode[],
  personalityManualNodes: ManualNode[],
  technicalProps: Record<string, Record<string, unknown>> | null,
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
  /** Siempre visible para poder añadir tools desde el diagrama sin pasar por el chat. */
  const toolsVisible = true;
  const personalityVisible = true;
  const completeVisible = confirmed || state.creation_step === "complete";
  const tasksVisible = pendingTasks.length > 0;

  if (businessVisible || true) {
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
        style: withCardStyle(230, !rawValue.trim()),
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

    nodes.push({
      id: "personality-name",
      position: { x: 250, y: 470 },
      data: {
        label: nodeLabelCard({
          title: "Nombre del agente",
          value: fieldNodeValue(state.agent_name),
        }),
      },
      style: withCardStyle(230, !state.agent_name.trim()),
    });
    edges.push({
      id: "e-personality-name",
      source: "personality",
      target: "personality-name",
    });

    nodes.push({
      id: "personality-style",
      position: { x: 500, y: 470 },
      data: {
        label: nodeLabelCard({
          title: "Estilo",
          value: fieldNodeValue(state.agent_personality),
        }),
      },
      style: withCardStyle(230, !state.agent_personality.trim()),
    });
    edges.push({
      id: "e-personality-style",
      source: "personality",
      target: "personality-style",
    });

    nodes.push({
      id: "personality-language",
      position: { x: 250, y: 556 },
      data: {
        label: nodeLabelCard({
          title: "Idioma (respuestas)",
          value: fieldNodeValue(state.response_language),
        }),
      },
      style: withCardStyle(230, !state.response_language.trim()),
    });
    edges.push({
      id: "e-personality-language",
      source: "personality",
      target: "personality-language",
    });

    const emojiNodeId = "personality-emojis";
    nodes.push({
      id: emojiNodeId,
      position: { x: 500, y: 556 },
      data: {
        label: nodeLabelCard({
          title: "Uso de emojis",
          value: fieldNodeValue(state.use_emojis),
        }),
      },
      style: withCardStyle(230, !state.use_emojis.trim()),
    });
    edges.push({
      id: "e-personality-emojis",
      source: "personality",
      target: emojiNodeId,
    });

    const accentNodeId = "personality-accent";
    nodes.push({
      id: accentNodeId,
      position: { x: 250, y: 642 },
      data: {
        label: nodeLabelCard({
          title: "Acento / Dialecto",
          value: fieldNodeValue(state.country_accent),
        }),
      },
      style: withCardStyle(230, !state.country_accent.trim()),
    });
    edges.push({
      id: "e-personality-accent",
      source: "personality",
      target: accentNodeId,
    });

    const signatureNodeId = "personality-signature";
    nodes.push({
      id: signatureNodeId,
      position: { x: 500, y: 642 },
      data: {
        label: nodeLabelCard({
          title: "Firma / Despedida",
          value: fieldNodeValue(state.agent_signature),
        }),
      },
      style: withCardStyle(230, !state.agent_signature.trim()),
    });
    edges.push({
      id: "e-personality-signature",
      source: "personality",
      target: signatureNodeId,
    });

    personalityManualNodes.forEach((item, index) => {
      const x = 250 + (index % 2) * 250;
      const y = 728 + Math.floor(index / 2) * 84;
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
        y: 728 + Math.ceil(personalityManualNodes.length / 2) * 84 + 38,
      },
      data: {
        label: (
          <div className="flex items-center gap-2 text-sm">
            <PlusIcon className="size-4" />
            Agregar nodo manual
          </div>
        )
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
    /* Propiedades siempre visibles: tareas debajo del bloque técnico. */
    nodes.push({
      id: "tasks",
      position: { x: 620, y: 1720 },
      data: { label: `Tareas pendientes (${openTasks})` },
      style: withCardStyle(230),
    });
    if (businessVisible) {
      edges.push({ id: "e-business-tasks", source: "business", target: "tasks" });
    }
  }

  const propsVisible = true;
  /** Izquierda del eje de Negocio (≥960) y debajo de filas de negocio (~470–900) para evitar solapes. */
  const PROPS_ORIGIN_X = 40;
  const PROPS_COL_STEP = 300;
  const PROPS_ROOT = { x: 340, y: 920 };
  /* Por debajo de negocio + nodos manuales y el botón agregar (hasta ~1200+ en Y). */
  const PROPS_FIRST_ROW_Y = 1060;
  const PROPS_ROW_STEP = 82;
  if (propsVisible) {
    nodes.push({
      id: "properties-root",
      position: PROPS_ROOT,
      data: { label: "Propiedades" },
      style: withCardStyle(220),
    });
    edges.push({
      id: "e-root-properties",
      source: "agentRoot",
      target: "properties-root",
    });

    const techNodeId = (d: string, k: string) => `tech-${d}-${k}`;
    const techFieldKey = (d: string, k: string) => `${d}:${k}`;
    const fieldInGraph = (doc: string, key: string) =>
      BUILDER_TECHNICAL_FIELDS.some((f) => f.documentId === doc && f.fieldKey === key);

    const validPropertyDeps = BUILDER_TECH_PROPERTY_DEPENDENCY_EDGES.filter(
      ({ parent, child }) =>
        fieldInGraph(parent.documentId, parent.fieldKey) &&
        fieldInGraph(child.documentId, child.fieldKey),
    );

    /** Hijas con padre en el diagrama: solo enlazan desde el padre, no desde Propiedades (cadena). */
    const propertyNodesLinkedFromParent = new Set(
      validPropertyDeps.map((dep) =>
        techFieldKey(dep.child.documentId, dep.child.fieldKey),
      ),
    );

    BUILDER_TECHNICAL_FIELDS.forEach((field, index) => {
      const raw = technicalProps?.[field.documentId]?.[field.fieldKey];
      const defVal = getTechFieldDefault(field.documentId, field.fieldKey);
      const effective = raw !== undefined && raw !== null ? raw : defVal;
      const display = formatTechnicalFieldValue(field.kind, effective);
      
      // Glow and full opacity if the value is defined (even if at default)
      const isDefined = effective !== undefined && effective !== null;
      
      const title =
        PROPERTY_TITLES[field.documentId]?.[field.fieldKey] ?? field.fieldKey;
      const nodeId = techNodeId(field.documentId, field.fieldKey);
      const col = index % 2;
      const row = Math.floor(index / 2);
      nodes.push({
        id: nodeId,
        position: {
          x: PROPS_ORIGIN_X + col * PROPS_COL_STEP,
          y: PROPS_FIRST_ROW_Y + row * PROPS_ROW_STEP,
        },
        data: {
          label: nodeLabelCard({ title, value: display }),
        },
        style: withCardStyle(278, !isDefined),
      });
      if (!propertyNodesLinkedFromParent.has(techFieldKey(field.documentId, field.fieldKey))) {
        edges.push({
          id: `e-props-${nodeId}`,
          source: "properties-root",
          target: nodeId,
        });
      }
    });

    for (const { parent, child } of validPropertyDeps) {
      edges.push({
        id: `e-tech-dep-${parent.documentId}-${parent.fieldKey}-${child.documentId}-${child.fieldKey}`,
        source: techNodeId(parent.documentId, parent.fieldKey),
        target: techNodeId(child.documentId, child.fieldKey),
      });
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

/** Altura del área de mensaje: crece hasta 4 líneas (`leading-5`), luego scroll. */
const CHAT_COMPOSER_LINE_HEIGHT_PX = 20;
const CHAT_COMPOSER_PAD_Y_PX = 12;
const CHAT_COMPOSER_MIN_HEIGHT_PX = CHAT_COMPOSER_LINE_HEIGHT_PX + CHAT_COMPOSER_PAD_Y_PX;
const CHAT_COMPOSER_MAX_HEIGHT_PX =
  CHAT_COMPOSER_LINE_HEIGHT_PX * 4 + CHAT_COMPOSER_PAD_Y_PX;

export function AgentBuilderChatDiagram(props?: { initialMode?: "form" | "conversational" }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const draftFromUrl = searchParams.get("draft")?.trim() ?? "";
  const layoutRef = useRef<HTMLDivElement | null>(null);
  const resizingRef = useRef(false);
  const chatComposerRef = useRef<HTMLTextAreaElement | null>(null);

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
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const initialMode = props?.initialMode ?? "form";
  const [builderMode, setBuilderMode] = useState<BuilderMode>(initialMode === "conversational" ? "conversational" : "form");
  const [formStep, setFormStep] = useState<FormStep>("business");

  const [draftState, setDraftState] = useState<DraftState>({
    agent_name: "",
    agent_personality: "",
    response_language: "Spanish",
    business_name: "",
    owner_name: "",
    industry: "",
    description: "",
    agent_description: "",
    target_audience: "",
    escalation_rules: "",
    country: "",
    use_emojis: "",
    country_accent: "",
    agent_signature: "",
    business_timezone: "",
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
  /**
   * Evita múltiples POST / agent_drafts cuando varias llamadas a persistState
   * coinciden antes de que React aplique setDraftId (efecto + actualizaciones de estado).
   */
  const draftCreationPromiseRef = useRef<Promise<string> | null>(null);

  const [agentCreatedDialogOpen, setAgentCreatedDialogOpen] = useState(false);
  /** Estado de generación async del system prompt (campos MCP del borrador). */
  const [draftSystemPromptGenStatus, setDraftSystemPromptGenStatus] = useState<
    string | null
  >(null);
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
  const [requiredNodeDialogOpen, setRequiredNodeDialogOpen] = useState(false);
  const [requiredNodeKey, setRequiredNodeKey] = useState<
    BusinessFieldKey | "agent_name" | "agent_personality" | "response_language" | null
  >(null);
  const [requiredNodeLabel, setRequiredNodeLabel] = useState("");
  const [requiredNodeValue, setRequiredNodeValue] = useState("");
  const [technicalPropsBundle, setTechnicalPropsBundle] = useState<
    Record<string, Record<string, unknown>> | null
  >(null);
  const [techDialogOpen, setTechDialogOpen] = useState(false);
  const [techEditDoc, setTechEditDoc] = useState<string | null>(null);
  const [techEditKey, setTechEditKey] = useState<string | null>(null);
  const [techBoolValue, setTechBoolValue] = useState(false);
  const [techNumberValue, setTechNumberValue] = useState("");
  const [techStringValue, setTechStringValue] = useState("");

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

  const launchConversationalMode = useCallback(() => {
    setBuilderMode("conversational");
    setChatMessages((prev) => {
      if (prev.length > 0) return prev;
      return [
        {
          id: nowId(),
          role: "assistant",
          text: "Empezamos en modo conversacional con IA. Cuéntame sobre tu negocio y el agente que quieres construir.",
        },
      ];
    });
  }, []);

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

  const openRequiredNodeDialog = useCallback(
    (
      key: BusinessFieldKey | "agent_name" | "agent_personality" | "response_language",
      label: string,
    ) => {
      setRequiredNodeKey(key);
      setRequiredNodeLabel(label);
      setRequiredNodeValue(draftState[key]);
      setRequiredNodeDialogOpen(true);
    },
    [draftState],
  );

  const syncTechnicalProps = useCallback(async (id: string) => {
    const res = await fetchDraftTechnicalProperties(id);
    if (res) setTechnicalPropsBundle(res);
  }, []);

  const openTechnicalPropertyDialog = useCallback(
    (documentId: string, fieldKey: string) => {
      const field = BUILDER_TECHNICAL_FIELDS.find(
        (f) => f.documentId === documentId && f.fieldKey === fieldKey,
      );
      if (!field) return;
      const raw = technicalPropsBundle?.[documentId]?.[fieldKey];
      const def = getTechFieldDefault(documentId, fieldKey);
      const effective = raw !== undefined && raw !== null ? raw : def;
      setTechEditDoc(documentId);
      setTechEditKey(fieldKey);
      if (field.kind === "boolean") {
        setTechBoolValue(effective === true);
        setTechNumberValue("");
        setTechStringValue("");
      } else if (field.kind === "number") {
        setTechBoolValue(false);
        setTechNumberValue(
          typeof effective === "number" && Number.isFinite(effective)
            ? String(effective)
            : typeof def === "number"
              ? String(def)
              : "",
        );
        setTechStringValue("");
      } else {
        setTechBoolValue(false);
        setTechNumberValue("");
        setTechStringValue(
          typeof effective === "string" ? effective : typeof def === "string" ? def : "",
        );
      }
      setTechDialogOpen(true);
    },
    [technicalPropsBundle],
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
        technicalPropsBundle,
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
      technicalPropsBundle,
    ],
  );

  const [nodes, setNodes] = useState<Node[]>([]);
  useLayoutEffect(() => {
    setNodes((prev) => mergeGraphNodesPreservingPositions(prev, graph.nodes));
  }, [graph]);

  const onNodesChange = useCallback((changes: NodeChange[]) => {
    setNodes((nds) => applyNodeChanges(changes, nds));
  }, []);

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
    async (state: DraftState, markComplete: boolean): Promise<string | null> => {
      const stepped = updateStepFromState(state);
      const personalitySig = `${stepped.agent_name}|${stepped.agent_personality}|${stepped.response_language}`;
      const businessSig = BUSINESS_FLOW.map((field) => stepped[field]).join("|");
      const toolsSig = [...stepped.selected_tools].sort().join("|");

      let currentDraftId = draftId;
      if (!currentDraftId && isPersonalityComplete(stepped)) {
        if (!draftCreationPromiseRef.current) {
          draftCreationPromiseRef.current = (async (): Promise<string> => {
            setSaving(true);
            try {
              const created = await postAgentDraft({
                agent_name: stepped.agent_name.trim(),
                agent_personality: stepped.agent_personality.trim(),
              });
              if (!created.ok) {
                toast.error(created.error);
                throw new Error(created.error);
              }
              setDraftId(created.id);
              await syncPendingTasks(created.id);
              await flushQueuedDeferredTasks(created.id);
              await syncTechnicalProps(created.id);
              return created.id;
            } finally {
              setSaving(false);
            }
          })().finally(() => {
            draftCreationPromiseRef.current = null;
          });
        }
        try {
          currentDraftId = await draftCreationPromiseRef.current;
        } catch {
          return null;
        }
      }
      if (!currentDraftId) return null;

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
            business_timezone: stepped.business_timezone.trim(),
            country: stepped.country.trim(),
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
            response_language:
              stepped.response_language.trim() || "Spanish",
            use_emojis: stepped.use_emojis.trim(),
            country_accent: stepped.country_accent.trim(),
            agent_signature: stepped.agent_signature.trim(),
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
          if (res.ok) {
            lastSyncedRef.current.complete = true;
            setDraftSystemPromptGenStatus("generating");
            toast.success(
              "Builder finalizado. El system prompt se está generando en segundo plano; en el diseñador de prompts verás el estado.",
            );
          } else {
            toast.error(res.error);
          }
        } finally {
          setSaving(false);
        }
      }
      return currentDraftId;
    },
    [
      draftId,
      flushQueuedDeferredTasks,
      syncPendingTasks,
      syncTechnicalProps,
      updateStepFromState,
    ],
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
      const mode = initialMode === "conversational" ? "conversational" : "form";
      setBuilderMode(mode);
      setFormStep("business");
      if (mode === "conversational") {
        setChatMessages([
          {
            id: nowId(),
            role: "assistant",
            text: "Empezamos en modo conversacional con IA. Cuéntame sobre tu negocio y el agente que quieres construir.",
          },
        ]);
      }
      hasHydratedDraftRef.current = true;
      skipDraftPersistenceRef.current = false;
      setLoadingDraft(false);
      setManualNodesBusiness([]);
      setManualNodesPersonality([]);
      setTechnicalPropsBundle(null);
      setDraftSystemPromptGenStatus(null);
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
        response_language:
          pickFirstString(d, [
            "response_language",
            "mcp_configuration.agent_personalization.response_language",
          ]) || "Spanish",
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
        use_emojis: pickFirstString(d, [
          "use_emojis",
          "mcp_configuration.agent_personalization.use_emojis",
        ]),
        country_accent: pickFirstString(d, [
          "country_accent",
          "mcp_configuration.agent_personalization.country_accent",
        ]),
        agent_signature: pickFirstString(d, [
          "agent_signature",
          "mcp_configuration.agent_personalization.agent_signature",
        ]),
        business_timezone: pickFirstString(d, [
          "business_timezone",
          "mcp_configuration.agent_business_info.business_timezone",
        ]),
        selected_tools: Array.isArray(d.selected_tools)
          ? d.selected_tools.filter((x): x is string => typeof x === "string")
          : [],
        creation_step: creationStep,
      });
      const serverMarkedComplete = creationStepRaw === "complete";
      /** Solo el servidor puede marcar el builder como cerrado; si usáramos `creation_step` local,
       * un borrador con todos los campos llenos pondría `lastSyncedRef.complete` sin PATCH y el
       * confirm no ejecutaría el paso `complete` ni el estado de generación del prompt. */
      const serverFlowComplete = serverMarkedComplete;

      const mcpHydrated = d.mcp_configuration as
        | Record<string, unknown>
        | undefined;
      const genFromNested =
        typeof mcpHydrated?.system_prompt_generation_status === "string"
          ? mcpHydrated.system_prompt_generation_status
          : null;
      const genSt = res.systemPromptGenerationStatus ?? genFromNested;

      setDraftId(res.id);
      setDraftState(nextState);
      setConfirmedSummary(serverFlowComplete);
      setDraftSystemPromptGenStatus(
        typeof genSt === "string" && genSt.length > 0 ? genSt : null,
      );

      if (serverFlowComplete) {
        setBuilderMode("conversational");
        skipDraftPersistenceRef.current = true;
        lastSyncedRef.current.complete = true;
        setAgentCreatedDialogOpen(true);
        setChatMessages([]);
      } else {
        setBuilderMode("conversational");
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
          nextState.response_language.trim()
            ? `- Idioma de respuestas al usuario: ${nextState.response_language}`
            : null,
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
      const tech = await fetchDraftTechnicalProperties(res.id);
      if (!cancelled && tech) setTechnicalPropsBundle(tech);
      hasHydratedDraftRef.current = true;
      setIsHydratingDraft(false);
    })();
    return () => {
      cancelled = true;
      setIsHydratingDraft(false);
    };
  }, [draftFromUrl, syncManualNodesFromDraft, syncPendingTasks, updateStepFromState]);

  useEffect(() => {
    if (!draftId || draftState.creation_step !== "complete") {
      return;
    }
    let cancelled = false;
    const poll = async () => {
      const r = await fetchAgentDraft(draftId);
      if (cancelled || !r.ok) return;
      const doc = r.draft as Record<string, unknown>;
      const mcp = doc.mcp_configuration as Record<string, unknown> | undefined;
      const nested =
        typeof mcp?.system_prompt_generation_status === "string"
          ? mcp.system_prompt_generation_status
          : null;
      const st = r.systemPromptGenerationStatus ?? nested;
      setDraftSystemPromptGenStatus(
        typeof st === "string" && st.length > 0 ? st : null,
      );
    };
    void poll();
    const interval = window.setInterval(() => void poll(), 5000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [draftId, draftState.creation_step]);

  useEffect(() => {
    if (!draftId) return;
    void syncTechnicalProps(draftId);
  }, [draftId, syncTechnicalProps]);

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
          "response_language",
          "business_name",
          "owner_name",
          "industry",
          "description",
          "agent_description",
          "target_audience",
          "escalation_rules",
          "country",
          "use_emojis",
          "country_accent",
          "agent_signature",
          "business_timezone",
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

      const isConfirm = trimmed.toLowerCase() === "confirmar";

      if (isConfirm && !readyToConfirm) {
        const fullUserText = buildConfirmIncompletePromptForModel(draftState);
        addMessage("user", fullUserText, displayText ?? "confirmar");
        await handleDeferredTask(trimmed);
        setThinkingLabel(pickThinkingLabel());
        setIsThinking(true);
        try {
          const llmRes = await postAgentBuilderChat({
            messages: [...chatMessages, { role: "user", text: fullUserText }],
            draftState,
            pendingTasksCount: pendingTasks.length,
            ...(draftId ? { draftId } : {}),
          });
          if (!llmRes.ok) {
            addMessage("assistant", `No pude responder en este momento: ${llmRes.error}`);
            return;
          }
          applyDraftPatch(llmRes.draftPatch as Record<string, unknown>);
          await addAssistantMessageProgressive(llmRes.assistantMessage, llmRes.ui);
          if (draftId) await syncTechnicalProps(draftId);
        } finally {
          setIsThinking(false);
        }
        return;
      }

      addMessage("user", trimmed, displayText);
      await handleDeferredTask(trimmed);

      if (isConfirm && readyToConfirm) {
        setConfirmedSummary(true);
        const nextState = updateStepFromState({ ...draftState, creation_step: "complete" });
        setDraftState(nextState);
        const persistedId = await persistState(nextState, true);
        setDraftSystemPromptGenStatus("generating");
        const draftIdForSync = persistedId ?? draftId;
        if (draftIdForSync) {
          const syncRes = await fetchAgentDraft(draftIdForSync);
          if (syncRes.ok) {
            const doc = syncRes.draft as Record<string, unknown>;
            const mcp = doc.mcp_configuration as Record<string, unknown> | undefined;
            const nested =
              typeof mcp?.system_prompt_generation_status === "string"
                ? mcp.system_prompt_generation_status
                : null;
            const st = syncRes.systemPromptGenerationStatus ?? nested;
            const creationStep =
              typeof doc.creation_step === "string" ? doc.creation_step : "";
            let resolved: string | null =
              typeof st === "string" && st.length > 0 ? st : null;
            if (
              creationStep === "complete" &&
              (resolved === null || resolved === "idle")
            ) {
              resolved = "generating";
            }
            setDraftSystemPromptGenStatus(resolved);
          }
        }
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
          ...(draftId ? { draftId } : {}),
        });
        if (!llmRes.ok) {
          addMessage("assistant", `No pude responder en este momento: ${llmRes.error}`);
          return;
        }
        applyDraftPatch(llmRes.draftPatch as Record<string, unknown>);
        await addAssistantMessageProgressive(llmRes.assistantMessage, llmRes.ui);
        if (draftId) await syncTechnicalProps(draftId);
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
      syncTechnicalProps,
      draftId,
      updateStepFromState,
      pickThinkingLabel,
    ],
  );

  const handleSend = useCallback(
    async (textOverride?: string) => {
      if (builderMode === "unselected") return;
      if (
        builderMode === "form" &&
        formStep !== "tools" &&
        textOverride === undefined
      ) {
        return;
      }
      const text = (textOverride ?? chatInput).trim();
      if (!text) return;
      setChatInput("");
      await sendUserText(text);
    },
    [builderMode, chatInput, formStep, sendUserText],
  );

  const canUseChatComposer = builderMode === "conversational" || formStep === "tools";
  const formStepIndex = FORM_STEPS.indexOf(formStep);
  const selectedToolsForForm = draftState.selected_tools
    .map((toolId) => catalogById.get(toolId))
    .filter((tool): tool is ToolsCatalogItem => Boolean(tool));

  useLayoutEffect(() => {
    const el = chatComposerRef.current;
    if (!el) return;
    el.style.height = "auto";
    const h = Math.max(
      CHAT_COMPOSER_MIN_HEIGHT_PX,
      Math.min(el.scrollHeight, CHAT_COMPOSER_MAX_HEIGHT_PX),
    );
    el.style.height = `${h}px`;
  }, [chatInput]);

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
            void handleSend("confirmar");
          }}
          disabled={saving || agentCreatedDialogOpen || isThinking}
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
              {builderMode === "form" ? "Constructor por formulario" : "Conversación guiada"}
            </p>
          </header>
          <div className="flex-1 space-y-3 overflow-y-auto p-4">
            {builderMode === "form" ? (
              <div className="space-y-3 rounded-xl border border-border bg-muted/20 p-3">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Paso {formStepIndex + 1} de {FORM_STEPS.length}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {formStep === "business"
                      ? "Negocio"
                      : formStep === "tools"
                        ? "Tools"
                        : formStep === "personality"
                          ? "Personalidad"
                          : "Revisión"}
                  </p>
                </div>
                {formStep === "business" ? (
                  <div className="space-y-2">
                    <Label>Nombre del negocio</Label>
                    <Input
                      value={draftState.business_name}
                      onChange={(event) =>
                        setDraftState((prev) =>
                          updateStepFromState({ ...prev, business_name: event.target.value }),
                        )
                      }
                    />
                    <Label>Responsable</Label>
                    <Input
                      value={draftState.owner_name}
                      onChange={(event) =>
                        setDraftState((prev) =>
                          updateStepFromState({ ...prev, owner_name: event.target.value }),
                        )
                      }
                    />
                    <Label>Industria</Label>
                    <Input
                      value={draftState.industry}
                      onChange={(event) =>
                        setDraftState((prev) =>
                          updateStepFromState({ ...prev, industry: event.target.value }),
                        )
                      }
                    />
                    <Label>Descripción del negocio</Label>
                    <Textarea
                      value={draftState.description}
                      onChange={(event) =>
                        setDraftState((prev) =>
                          updateStepFromState({ ...prev, description: event.target.value }),
                        )
                      }
                      rows={2}
                    />
                    <Label>Audiencia objetivo</Label>
                    <Textarea
                      value={draftState.target_audience}
                      onChange={(event) =>
                        setDraftState((prev) =>
                          updateStepFromState({ ...prev, target_audience: event.target.value }),
                        )
                      }
                      rows={2}
                    />
                    <Label>Rol del agente</Label>
                    <Textarea
                      value={draftState.agent_description}
                      onChange={(event) =>
                        setDraftState((prev) =>
                          updateStepFromState({ ...prev, agent_description: event.target.value }),
                        )
                      }
                      rows={2}
                    />
                    <Label>Reglas de escalamiento</Label>
                    <Textarea
                      value={draftState.escalation_rules}
                      onChange={(event) =>
                        setDraftState((prev) =>
                          updateStepFromState({ ...prev, escalation_rules: event.target.value }),
                        )
                      }
                      rows={2}
                    />
                    <Label>País</Label>
                    <Input
                      value={draftState.country}
                      onChange={(event) =>
                        setDraftState((prev) =>
                          updateStepFromState({ ...prev, country: event.target.value }),
                        )
                      }
                      placeholder="p. ej. México, Colombia"
                    />
                  </div>
                ) : null}
                {formStep === "tools" ? (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-medium">Tools seleccionadas</p>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setEditingToolId(null);
                          setToolsDialogOpen(true);
                        }}
                      >
                        <PlusIcon className="mr-1 size-4" />
                        Agregar tool
                      </Button>
                    </div>
                    {selectedToolsForForm.length === 0 ? (
                      <p className="text-sm text-muted-foreground">
                        Aún no hay tools seleccionadas.
                      </p>
                    ) : (
                      <div className="space-y-2">
                        {selectedToolsForForm.map((tool) => (
                          <div
                            key={tool.id}
                            className="flex items-center justify-between rounded-md border border-border bg-background px-2 py-2"
                          >
                            <div className="pr-2">
                              <p className="text-sm font-medium">{tool.displayName ?? tool.name}</p>
                              <p className="line-clamp-1 text-xs text-muted-foreground">{tool.name}</p>
                            </div>
                            <div className="flex items-center gap-1">
                              <Button
                                type="button"
                                size="icon"
                                variant="ghost"
                                onClick={() => {
                                  setEditingToolId(tool.id);
                                  setToolsDialogOpen(true);
                                }}
                                aria-label={`Personalizar ${tool.displayName ?? tool.name}`}
                              >
                                <PencilIcon className="size-4" />
                              </Button>
                              <Button
                                type="button"
                                size="icon"
                                variant="ghost"
                                onClick={() => removeToolFromDraft(tool.id)}
                                aria-label={`Eliminar ${tool.displayName ?? tool.name}`}
                              >
                                <Trash2Icon className="size-4 text-destructive" />
                              </Button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                    <p className="text-xs text-muted-foreground">
                      Usa el chat de abajo en este paso para que el agente te ayude a encontrar tools.
                    </p>
                  </div>
                ) : null}
                {formStep === "personality" ? (
                  <div className="space-y-2">
                    <Label>Nombre del agente</Label>
                    <Input
                      value={draftState.agent_name}
                      onChange={(event) =>
                        setDraftState((prev) =>
                          updateStepFromState({ ...prev, agent_name: event.target.value }),
                        )
                      }
                    />
                    <Label>Personalidad del agente</Label>
                    <Textarea
                      value={draftState.agent_personality}
                      onChange={(event) =>
                        setDraftState((prev) =>
                          updateStepFromState({ ...prev, agent_personality: event.target.value }),
                        )
                      }
                      rows={3}
                    />
                    <Label>Idioma de las respuestas al usuario</Label>
                    <Input
                      value={draftState.response_language}
                      onChange={(event) =>
                        setDraftState((prev) =>
                          updateStepFromState({
                            ...prev,
                            response_language: event.target.value,
                          }),
                        )
                      }
                      placeholder="p. ej. Spanish, English"
                    />
                    <p className="text-xs text-muted-foreground">
                      El system prompt técnico se guarda en inglés; este valor indica en qué idioma
                      debe hablar el agente con tus clientes.
                    </p>
                    <Label>Uso de emojis</Label>
                    <Input
                      value={draftState.use_emojis}
                      onChange={(event) =>
                        setDraftState((prev) =>
                          updateStepFromState({ ...prev, use_emojis: event.target.value }),
                        )
                      }
                      placeholder="p. ej. Sí, usar emojis con moderación"
                    />
                    <Label>Acento / Dialecto</Label>
                    <Input
                      value={draftState.country_accent}
                      onChange={(event) =>
                        setDraftState((prev) =>
                          updateStepFromState({ ...prev, country_accent: event.target.value }),
                        )
                      }
                      placeholder="p. ej. Español de México"
                    />
                    <Label>Firma / Despedida</Label>
                    <Input
                      value={draftState.agent_signature}
                      onChange={(event) =>
                        setDraftState((prev) =>
                          updateStepFromState({ ...prev, agent_signature: event.target.value }),
                        )
                      }
                      placeholder="p. ej. Saludos, tu asistente virtual"
                    />
                  </div>
                ) : null}
                {formStep === "review" ? (
                  <div className="space-y-2 text-sm">
                    <p className="font-medium">Revisión final</p>
                    <p>
                      Negocio:{" "}
                      <span className="text-muted-foreground">
                        {draftState.business_name || "Sin completar"}
                      </span>
                    </p>
                    <p>
                      Tools:{" "}
                      <span className="text-muted-foreground">
                        {draftState.selected_tools.length} seleccionadas
                      </span>
                    </p>
                    <p>
                      Agente:{" "}
                      <span className="text-muted-foreground">
                        {draftState.agent_name || "Sin nombre"}
                      </span>
                    </p>
                    <p>
                      Idioma de respuestas:{" "}
                      <span className="text-muted-foreground">
                        {draftState.response_language.trim() || "—"}
                      </span>
                    </p>
                    <Button
                      type="button"
                      onClick={() => {
                        void handleSend("confirmar");
                      }}
                      disabled={!readyToConfirm || isThinking || saving}
                    >
                      Confirmar desde formulario
                    </Button>
                  </div>
                ) : null}
                <div className="flex items-center justify-between pt-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      const prevIndex = Math.max(0, formStepIndex - 1);
                      setFormStep(FORM_STEPS[prevIndex] ?? "business");
                    }}
                    disabled={formStepIndex === 0}
                  >
                    Anterior
                  </Button>
                  <Button
                    type="button"
                    onClick={() => {
                      if (formStep === "business" && !isBusinessComplete(draftState)) {
                        toast.error("Completa los campos de negocio requeridos.");
                        return;
                      }
                      if (formStep === "tools" && draftState.selected_tools.length === 0) {
                        toast.error("Selecciona al menos una tool.");
                        return;
                      }
                      if (formStep === "personality" && !isPersonalityComplete(draftState)) {
                        toast.error("Completa todos los campos de personalidad del agente.");
                        return;
                      }
                      const nextIndex = Math.min(FORM_STEPS.length - 1, formStepIndex + 1);
                      setFormStep(FORM_STEPS[nextIndex] ?? "review");
                    }}
                    disabled={formStepIndex === FORM_STEPS.length - 1}
                  >
                    Siguiente
                  </Button>
                </div>
              </div>
            ) : null}
            {builderMode !== "form" || formStep === "tools"
              ? chatMessages.map((message, messageIndex) => {
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
                })
              : null}
            {isThinking && (builderMode !== "form" || formStep === "tools") ? (
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
            <div className="flex items-end gap-2">
              <Textarea
                ref={chatComposerRef}
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    void handleSend();
                  }
                }}
                disabled={agentCreatedDialogOpen || !canUseChatComposer}
                placeholder={
                  canUseChatComposer
                    ? formStep === "tools" && builderMode === "form"
                      ? "Pide sugerencias de tools al agente..."
                      : "Escribe un mensaje..."
                    : "Activa modo conversacional o avanza al paso Tools"
                }
                rows={1}
                aria-label="Mensaje del chat"
                className={cn(
                  "max-h-[92px] min-h-[32px] resize-none overflow-y-auto rounded-lg px-2.5 py-1.5 text-sm leading-5 shadow-none md:text-sm dark:bg-input/30",
                  "field-sizing-fixed",
                )}
              />
              <Button
                size="icon"
                onClick={() => void handleSend()}
                disabled={isThinking || agentCreatedDialogOpen || !canUseChatComposer}
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

        {builderMode !== "form" ? (
          <section className="h-[calc(100vh-110px)] min-h-[700px] flex-1 rounded-xl border border-border bg-card p-3">
            <div className="h-full overflow-hidden rounded-lg border border-border">
              <ReactFlow
                nodes={nodes}
                edges={graph.edges}
                onNodesChange={onNodesChange}
                nodesDraggable
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
                    return;
                  }
                  if (node.id.startsWith("business-")) {
                    const key = node.id.slice("business-".length) as BusinessFieldKey;
                    const field = BUSINESS_FIELD_GRAPH.find((item) => item.key === key);
                    if (field) openRequiredNodeDialog(key, field.label);
                    return;
                  }
                  if (node.id === "personality-name") {
                    openRequiredNodeDialog("agent_name", "Nombre del agente");
                    return;
                  }
                  if (node.id === "personality-style") {
                    openRequiredNodeDialog("agent_personality", "Estilo");
                    return;
                  }
                  if (node.id === "personality-language") {
                    openRequiredNodeDialog(
                      "response_language",
                      "Idioma de las respuestas al usuario",
                    );
                    return;
                  }
                  if (node.id.startsWith("tech-")) {
                    const rest = node.id.slice("tech-".length);
                    const firstDash = rest.indexOf("-");
                    if (firstDash > 0) {
                      const docId = rest.slice(0, firstDash);
                      const fieldKey = rest.slice(firstDash + 1);
                      openTechnicalPropertyDialog(docId, fieldKey);
                    }
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
        ) : (
          <section className="h-[calc(100vh-110px)] min-h-[700px] flex-1 rounded-xl border border-border bg-card p-3 flex items-center justify-center">
            <p className="text-muted-foreground text-sm">
              Completa el formulario para ver el diagrama de tu agente
            </p>
          </section>
        )}
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
      <Dialog open={techDialogOpen} onOpenChange={setTechDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {techEditDoc && techEditKey
                ? PROPERTY_TITLES[techEditDoc]?.[techEditKey] ?? techEditKey
                : "Propiedad técnica"}
            </DialogTitle>
            {techEditDoc && techEditKey ? (
              <DialogDescription className="text-xs">
                {PROPERTY_DESCRIPTIONS[techEditDoc]?.[techEditKey] ?? ""}
              </DialogDescription>
            ) : null}
          </DialogHeader>
          {(() => {
            const field = BUILDER_TECHNICAL_FIELDS.find(
              (f) => f.documentId === techEditDoc && f.fieldKey === techEditKey,
            );
            if (!field) {
              return <p className="text-sm text-muted-foreground">Selecciona un nodo del diagrama.</p>;
            }
            if (field.kind === "boolean") {
              return (
                <div className="flex items-center gap-2 py-2">
                  <Checkbox
                    id="tech-bool-field"
                    checked={techBoolValue}
                    onCheckedChange={(v) => setTechBoolValue(v === true)}
                  />
                  <Label htmlFor="tech-bool-field" className="cursor-pointer font-normal">
                    Activado
                  </Label>
                </div>
              );
            }
            if (field.kind === "number") {
              return (
                <div className="space-y-1.5">
                  <Label>Valor numérico</Label>
                  <Input
                    type="number"
                    value={techNumberValue}
                    onChange={(event) => setTechNumberValue(event.target.value)}
                  />
                </div>
              );
            }
            return (
              <div className="space-y-1.5">
                <Label>Texto</Label>
                <Textarea
                  value={techStringValue}
                  onChange={(event) => setTechStringValue(event.target.value)}
                  rows={4}
                />
              </div>
            );
          })()}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setTechDialogOpen(false)}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              onClick={() => {
                void (async () => {
                  if (!draftId || !techEditDoc || !techEditKey) return;
                  const field = BUILDER_TECHNICAL_FIELDS.find(
                    (f) => f.documentId === techEditDoc && f.fieldKey === techEditKey,
                  );
                  if (!field) return;
                  const payload: Record<string, unknown> = {};
                  if (field.kind === "boolean") {
                    payload[techEditKey] = techBoolValue;
                  } else if (field.kind === "number") {
                    const n = Number(techNumberValue);
                    if (!Number.isFinite(n)) {
                      toast.error("Número inválido");
                      return;
                    }
                    payload[techEditKey] = n;
                  } else {
                    const s = techStringValue.trim();
                    if (!s.length) {
                      toast.error("El texto no puede quedar vacío");
                      return;
                    }
                    payload[techEditKey] = s;
                  }
                  const res = await patchDraftTechnicalPropertyDocument(
                    draftId,
                    techEditDoc,
                    payload,
                  );
                  if (!res.ok) {
                    toast.error(res.error);
                    return;
                  }
                  toast.success("Propiedad guardada");
                  setTechDialogOpen(false);
                  await syncTechnicalProps(draftId);
                })();
              }}
            >
              Guardar
            </Button>
          </DialogFooter>
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
      <Dialog open={requiredNodeDialogOpen} onOpenChange={setRequiredNodeDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Editar nodo</DialogTitle>
            <DialogDescription>
              Asigna un valor para <span className="font-medium">{requiredNodeLabel}</span>.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label>Valor</Label>
            <Input
              value={requiredNodeValue}
              onChange={(event) => setRequiredNodeValue(event.target.value)}
              placeholder="Escribe el valor..."
            />
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setRequiredNodeDialogOpen(false);
              }}
            >
              Cancelar
            </Button>
            <Button
              onClick={() => {
                if (!requiredNodeKey) return;
                const raw = requiredNodeValue.trim();
                const value =
                  requiredNodeKey === "response_language" && !raw ? "Spanish" : raw;
                setDraftState((prev) =>
                  updateStepFromState({
                    ...prev,
                    [requiredNodeKey]: value,
                  }),
                );
                setRequiredNodeDialogOpen(false);
              }}
            >
              Guardar valor
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
            <DialogDescription asChild>
              <div className="space-y-2">
                <p>El builder finalizó correctamente. ¿Qué deseas hacer ahora?</p>
                {(draftSystemPromptGenStatus === "generating" ||
                  draftSystemPromptGenStatus === "pending" ||
                  draftSystemPromptGenStatus === "idle") && (
                  <p className="text-xs text-muted-foreground">
                    El system prompt especializado se está generando en segundo
                    plano. En el diseñador de prompts verás el progreso y el texto
                    cuando esté listo.
                  </p>
                )}
                {draftSystemPromptGenStatus === "ready" && (
                  <p className="text-xs text-muted-foreground">
                    La generación del system prompt ya terminó; puedes revisarlo en
                    el diseñador de prompts.
                  </p>
                )}
                {draftSystemPromptGenStatus === "failed" && (
                  <p className="text-xs text-destructive">
                    La generación automática del system prompt falló. Puedes
                    reintentarla desde el apartado de prompts del agente.
                  </p>
                )}
              </div>
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-2 pt-2">
            <Button
              type="button"
              onClick={() => {
                setAgentCreatedDialogOpen(false);
                if (!draftId) return;
                router.push(`/agents/${draftId}/prompt-design`);
              }}
              disabled={!draftId}
            >
              Ir al diseñador de prompt
            </Button>
            <Button
              type="button"
              variant="secondary"
              onClick={() => setAgentCreatedDialogOpen(false)}
            >
              Seguir configurando agente
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
