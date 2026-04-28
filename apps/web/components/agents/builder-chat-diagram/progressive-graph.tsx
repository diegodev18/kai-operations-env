"use client";

import { BotIcon, PlusIcon, XIcon } from "lucide-react";
import type { Edge, Node } from "@xyflow/react";

import {
  BUILDER_TECHNICAL_FIELDS,
  BUILDER_TECH_PROPERTY_DEPENDENCY_EDGES,
  formatTechnicalFieldValue,
  getTechFieldDefault,
} from "@/lib/form-builder/builder-technical-properties";
import { PROPERTY_TITLES } from "@/consts/form-builder/property-descriptions";
import type { DraftPendingTask } from "@/services/agents-api";
import type { ToolsCatalogItem } from "@/types";

import { BUSINESS_FIELD_GRAPH } from "./constants";
import { hasAnyBusinessValue } from "./draft-helpers";
import type { DraftState, ManualNode } from "./types";

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
      {value ? (
        <p className="mt-1 text-sm">{value}</p>
      ) : (
        <p className="mt-1 text-sm text-muted-foreground">Sin definir</p>
      )}
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
export function mergeGraphNodesPreservingPositions(prev: Node[], next: Node[]): Node[] {
  const posById = new Map(prev.map((n) => [n.id, n.position]));
  return next.map((n) => {
    const pos = posById.get(n.id);
    return pos ? { ...n, position: pos } : n;
  });
}

export function buildProgressiveGraph(
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
