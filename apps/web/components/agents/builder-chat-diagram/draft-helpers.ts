import type { DraftPropertyItem } from "@/services/agents-api";

import { BUSINESS_FIELD_GRAPH, BUSINESS_FLOW } from "./constants";
import type { DraftState, ManualNode, ManualSection } from "./types";

export function manualSectionDocId(section: ManualSection): "business" | "personality" {
  return section;
}

export function mapDraftPropertyItemToManualNode(item: DraftPropertyItem): ManualNode {
  return {
    id: item.id,
    title: item.title,
    value: item.content,
  };
}

export function nowId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function str(v: unknown): string {
  return typeof v === "string" ? v : "";
}

export function pickFirstString(
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

export function detectDeferredIntent(text: string): boolean {
  const deferRegex =
    /\b(luego|despu[eé]s|m[aá]s tarde|otro d[ií]a|en otro momento)\b/i;
  const actionRegex =
    /\b(hacer|crear|configurar|definir|agregar|subir|conectar|completar|revisar|documentar|probar|integrar)\b/i;
  return deferRegex.test(text) && actionRegex.test(text);
}

export function deriveDeferredTaskTitle(text: string): string {
  const cleaned = text
    .replace(/\b(luego|despu[eé]s|m[aá]s tarde|otro d[ií]a|en otro momento)\b/gi, "")
    .replace(/\s+/g, " ")
    .trim();
  return (cleaned || text.trim() || "Seguimiento pendiente").slice(0, 90);
}

export function isBusinessComplete(state: DraftState) {
  return BUSINESS_FLOW.every((f) => !!state[f].trim());
}

export function isPersonalityComplete(state: DraftState) {
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
export function getBuilderIncompleteItems(state: DraftState): string[] {
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

export function buildConfirmIncompletePromptForModel(state: DraftState): string {
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

export function hasAnyBusinessValue(state: DraftState) {
  return BUSINESS_FLOW.some((f) => !!state[f].trim());
}
