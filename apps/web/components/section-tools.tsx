"use client";

import { AGENT_BUILDER_MANDATORY_TOOL_NAMES } from "@kai/shared";
import { Loader2Icon, XIcon } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import type {
  FormBuilderState,
  FormSectionId,
} from "@/lib/form-builder-constants";
import { FORM_SECTIONS } from "@/lib/form-builder-constants";
import type { ToolsCatalogItem } from "@/services/agents-api";

interface SectionToolsProps {
  state: FormBuilderState;
  onChange: (updates: Partial<FormBuilderState>) => void;
  catalog: ToolsCatalogItem[];
  isSaving: boolean;
  prerequisitesMet: boolean;
  firstBlockedSection: FormSectionId | null;
  onGoToSection: (id: FormSectionId) => void;
  recommendLoading: boolean;
  recommendError: string | null;
  onRegenerateTools: () => void;
  toolsRationale: string | null;
  toolsWarnings: string[];
  toolReasonById: Record<string, string>;
  operationalSummary: string;
}

function sectionTitle(id: FormSectionId): string {
  return FORM_SECTIONS.find((s) => s.id === id)?.title ?? id;
}

export function SectionTools({
  state,
  onChange: _onChange,
  catalog,
  isSaving,
  prerequisitesMet,
  firstBlockedSection,
  onGoToSection,
  recommendLoading,
  recommendError,
  onRegenerateTools,
  toolsRationale,
  toolsWarnings,
  toolReasonById,
  operationalSummary,
}: SectionToolsProps) {
  const mandatoryToolNames = new Set<string>(
    AGENT_BUILDER_MANDATORY_TOOL_NAMES,
  );
  const canRemove = (toolId: string) => {
    const tool = catalog.find((t) => t.id === toolId);
    const toolName = tool?.name || "";
    return !mandatoryToolNames.has(toolName);
  };

  const confirmRemoveTool = (toolId: string) => {
    _onChange({
      selected_tools: state.selected_tools.filter((id) => id !== toolId),
    });
  };

  if (!prerequisitesMet) {
    return (
      <div className="space-y-4 rounded-lg border border-amber-500/40 bg-amber-500/5 p-4">
        <p className="text-sm font-medium text-amber-900 dark:text-amber-100">
          Para recomendar herramientas con IA, completa primero los pasos
          anteriores.
        </p>
        <p className="text-sm text-muted-foreground">
          Faltan datos en:{" "}
          {firstBlockedSection
            ? sectionTitle(firstBlockedSection)
            : "pasos previos"}
          .
        </p>
        {firstBlockedSection ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => onGoToSection(firstBlockedSection)}
          >
            Ir a {sectionTitle(firstBlockedSection)}
          </Button>
        ) : null}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <p className="text-sm text-muted-foreground">
        Usamos lo que contaste en <strong>Flujos</strong> más tu negocio y
        personalidad. Puedes regenerar la lista si cambias algo en pasos
        anteriores.
      </p>

      {operationalSummary.trim() ? (
        <div className="rounded-lg border bg-muted/20 p-3 text-xs text-muted-foreground">
          <p className="mb-1 font-medium text-foreground">
            Resumen de lo que nos contaste en Flujos
          </p>
          <pre className="max-h-40 overflow-y-auto whitespace-pre-wrap font-sans">
            {operationalSummary}
          </pre>
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={onRegenerateTools}
          disabled={isSaving || recommendLoading || catalog.length === 0}
        >
          {recommendLoading ? (
            <>
              <Loader2Icon className="mr-2 size-4 animate-spin" />
              Generando…
            </>
          ) : (
            "Regenerar recomendación"
          )}
        </Button>
      </div>

      {recommendError ? (
        <div className="rounded-md border border-destructive/50 bg-destructive/5 p-3 text-sm text-destructive">
          {recommendError}
        </div>
      ) : null}

      {toolsWarnings.length > 0 ? (
        <div className="rounded-md border border-amber-500/40 bg-amber-500/5 p-3 text-sm text-amber-900 dark:text-amber-100">
          <p className="font-medium">Avisos</p>
          <ul className="mt-1 list-inside list-disc">
            {toolsWarnings.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {toolsRationale ? (
        <div className="rounded-lg border bg-muted/30 p-3 text-sm">
          <p className="font-medium text-foreground">Resumen</p>
          <p className="mt-1 text-muted-foreground">{toolsRationale}</p>
        </div>
      ) : null}

      {recommendLoading && state.selected_tools.length === 0 ? (
        <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
          <Loader2Icon className="size-5 animate-spin" />
          Generando herramientas recomendadas…
        </div>
      ) : null}

      {state.selected_tools.length > 0 ? (
        <div className="space-y-2">
          <p className="text-sm font-medium">
            Herramientas propuestas ({state.selected_tools.length})
          </p>
          <div className="max-h-[360px] space-y-2 overflow-y-auto">
            {state.selected_tools.map((toolId) => {
              const tool = catalog.find((t) => t.id === toolId);
              const reason = toolReasonById[toolId];
              return (
                <div
                  key={toolId}
                  className="flex items-start justify-between gap-2 rounded-lg border border-border bg-card p-3 text-sm"
                >
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">
                      {tool?.displayName || tool?.name || toolId}
                    </p>
                    {reason ? (
                      <p className="mt-1 text-muted-foreground">{reason}</p>
                    ) : tool?.description ? (
                      <p className="mt-1 text-muted-foreground">
                        {tool.description}
                      </p>
                    ) : null}
                  </div>
                  {canRemove(toolId) ? (
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <button
                          type="button"
                          className="shrink-0 rounded-md p-1 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                          aria-label={`Eliminar ${tool?.displayName || tool?.name || toolId}`}
                        >
                          <XIcon className="size-4" />
                        </button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>
                            ¿Eliminar herramienta?
                          </AlertDialogTitle>
                          <AlertDialogDescription>
                            ¿Estás seguro de que quieres eliminar &quot;
                            {tool?.displayName || tool?.name || toolId}&quot;?
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancelar</AlertDialogCancel>
                          <AlertDialogAction
                            onClick={() => confirmRemoveTool(toolId)}
                          >
                            Eliminar
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  ) : (
                    <button
                      type="button"
                      disabled
                      className="shrink-0 rounded-md p-1 text-muted-foreground/50 cursor-not-allowed"
                      aria-label={`${tool?.displayName || tool?.name || toolId} no se puede eliminar`}
                    >
                      <XIcon className="size-4" />
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ) : !recommendLoading ? (
        <p className="text-sm text-muted-foreground">
          Aún no hay herramientas. Pulsa &quot;Regenerar recomendación&quot; o
          espera a que se genere automáticamente.
        </p>
      ) : null}
    </div>
  );
}
