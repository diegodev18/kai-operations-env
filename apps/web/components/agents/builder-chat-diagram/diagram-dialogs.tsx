"use client";

import type { Dispatch, SetStateAction } from "react";
import { PlusIcon, PencilIcon, XIcon } from "lucide-react";
import { toast } from "sonner";

import { ToolsCatalogSearchList } from "@/components/agents/tools-catalog-search-list";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  PROPERTY_DESCRIPTIONS,
  PROPERTY_TITLES,
} from "@/consts/form-builder/property-descriptions";
import { BUILDER_TECHNICAL_FIELDS } from "@/lib/form-builder/builder-technical-properties";
import {
  createDraftPropertyItem,
  patchDraftPropertyItem,
  patchDraftTechnicalPropertyDocument,
} from "@/services/agents-api";
import type { ToolsCatalogItem } from "@/types";

import {
  manualSectionDocId,
  mapDraftPropertyItemToManualNode,
} from "./draft-helpers";
import type { DraftState, ManualNode, ManualSection, RequiredNodeFieldKey } from "./types";

export type BuilderChatDiagramDialogsProps = {
  catalog: ToolsCatalogItem[];
  draftId: string;
  router: { push: (href: string) => void };
  updateStepFromState: (state: DraftState) => DraftState;
  setDraftState: Dispatch<SetStateAction<DraftState>>;
  removeToolFromDraft: (toolId: string) => void;
  syncTechnicalProps: (id: string) => Promise<void>;
  toolsDialogOpen: boolean;
  setToolsDialogOpen: (open: boolean) => void;
  editingToolId: string | null;
  setEditingToolId: (id: string | null) => void;
  toolSearch: string;
  setToolSearch: (v: string) => void;
  techDialogOpen: boolean;
  setTechDialogOpen: (open: boolean) => void;
  techEditDoc: string | null;
  techEditKey: string | null;
  techBoolValue: boolean;
  setTechBoolValue: (v: boolean) => void;
  techNumberValue: string;
  setTechNumberValue: (v: string) => void;
  techStringValue: string;
  setTechStringValue: (v: string) => void;
  manualDialogOpen: boolean;
  setManualDialogOpen: (open: boolean) => void;
  manualSection: ManualSection;
  manualEditingId: string | null;
  manualTitle: string;
  setManualTitle: (v: string) => void;
  manualValue: string;
  setManualValue: (v: string) => void;
  setManualEditingId: (id: string | null) => void;
  setManualNodesBusiness: Dispatch<SetStateAction<ManualNode[]>>;
  setManualNodesPersonality: Dispatch<SetStateAction<ManualNode[]>>;
  requiredNodeDialogOpen: boolean;
  setRequiredNodeDialogOpen: (open: boolean) => void;
  requiredNodeKey: RequiredNodeFieldKey | null;
  requiredNodeLabel: string;
  requiredNodeValue: string;
  setRequiredNodeValue: (v: string) => void;
  agentCreatedDialogOpen: boolean;
  setAgentCreatedDialogOpen: (open: boolean) => void;
  draftSystemPromptGenStatus: string | null;
};

export function BuilderChatDiagramDialogs(props: BuilderChatDiagramDialogsProps) {
  const {
    catalog,
    draftId,
    router,
    updateStepFromState,
    setDraftState,
    removeToolFromDraft,
    syncTechnicalProps,
    toolsDialogOpen,
    setToolsDialogOpen,
    editingToolId,
    setEditingToolId,
    toolSearch,
    setToolSearch,
    techDialogOpen,
    setTechDialogOpen,
    techEditDoc,
    techEditKey,
    techBoolValue,
    setTechBoolValue,
    techNumberValue,
    setTechNumberValue,
    techStringValue,
    setTechStringValue,
    manualDialogOpen,
    setManualDialogOpen,
    manualSection,
    manualEditingId,
    manualTitle,
    setManualTitle,
    manualValue,
    setManualValue,
    setManualEditingId,
    setManualNodesBusiness,
    setManualNodesPersonality,
    requiredNodeDialogOpen,
    setRequiredNodeDialogOpen,
    requiredNodeKey,
    requiredNodeLabel,
    requiredNodeValue,
    setRequiredNodeValue,
    agentCreatedDialogOpen,
    setAgentCreatedDialogOpen,
    draftSystemPromptGenStatus,
  } = props;

  return (
    <>
      <Dialog open={toolsDialogOpen} onOpenChange={setToolsDialogOpen}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>
              {editingToolId ? "Editar tool del diagrama" : "Agregar tools"}
            </DialogTitle>
            <DialogDescription>
              Selecciona herramientas del catálogo. Al hacer clic en una tool del diagrama puedes
              reemplazarla o eliminarla.
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
              return (
                <p className="text-sm text-muted-foreground">Selecciona un nodo del diagrama.</p>
              );
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
            <Button type="button" variant="outline" onClick={() => setTechDialogOpen(false)}>
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
                  const created = await createDraftPropertyItem(draftId, sectionDocId, {
                    title: manualTitle.trim(),
                    content: manualValue.trim(),
                  });
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
                    El system prompt especializado se está generando en segundo plano. En el
                    diseñador de prompts verás el progreso y el texto cuando esté listo.
                  </p>
                )}
                {draftSystemPromptGenStatus === "ready" && (
                  <p className="text-xs text-muted-foreground">
                    La generación del system prompt ya terminó; puedes revisarlo en el diseñador de
                    prompts.
                  </p>
                )}
                {draftSystemPromptGenStatus === "failed" && (
                  <p className="text-xs text-destructive">
                    La generación automática del system prompt falló. Puedes reintentarla desde el
                    apartado de prompts del agente.
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
            <Button type="button" variant="secondary" onClick={() => setAgentCreatedDialogOpen(false)}>
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
    </>
  );
}
