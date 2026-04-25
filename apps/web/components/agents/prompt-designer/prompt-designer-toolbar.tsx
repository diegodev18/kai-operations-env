import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  ArrowDownToLineIcon,
  CheckIcon,
  Loader2Icon,
  RocketIcon,
  XIcon,
} from "lucide-react";

export function PromptDesignerToolbar({
  canTransfer,
  canSave,
  hasChanges,
  hasLocalChanges,
  showSuggestion,
  editorViewMode,
  loadingProductionPrompt,
  promptAndChatLocked,
  pullingProductionBase,
  promoting,
  isSaving,
  onOpenPullDialog,
  onToggleDiff,
  onDiscardSuggestion,
  onApplySuggestion,
  onUndo,
  onSave,
  onOpenPushDialog,
}: {
  canTransfer: boolean;
  canSave: boolean;
  hasChanges: boolean;
  hasLocalChanges: boolean;
  showSuggestion: boolean;
  editorViewMode: "edit" | "diff";
  loadingProductionPrompt: boolean;
  promptAndChatLocked: boolean;
  pullingProductionBase: boolean;
  promoting: boolean;
  isSaving: boolean;
  onOpenPullDialog: () => void;
  onToggleDiff: () => void;
  onDiscardSuggestion: () => void;
  onApplySuggestion: () => void;
  onUndo: () => void;
  onSave: () => void;
  onOpenPushDialog: () => void;
}) {
  return (
    <div className="flex w-full flex-wrap items-center gap-2 border-t p-3">
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            type="button"
            variant={canTransfer ? "default" : "outline"}
            onClick={onOpenPullDialog}
            disabled={
              pullingProductionBase ||
              promptAndChatLocked ||
              loadingProductionPrompt ||
              !canTransfer
            }
            className={!canTransfer || loadingProductionPrompt ? "opacity-50" : ""}
          >
            {pullingProductionBase ? (
              <Loader2Icon className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <ArrowDownToLineIcon className="mr-2 h-4 w-4" />
            )}
            Bajar cambios
          </Button>
        </TooltipTrigger>
        <TooltipContent>
          {promptAndChatLocked
            ? "No disponible mientras el editor esté bloqueado."
            : loadingProductionPrompt
              ? "Cargando el prompt de producción…"
              : !canTransfer && canSave
                ? "Guarda primero para crear diferencias entre testing y producción."
                : !canTransfer
                  ? "No hay diferencias entre testing y producción."
                  : hasLocalChanges
                    ? "Tienes cambios locales sin guardar; al bajar cambios se usará el snapshot guardado en testing."
                    : "Copia el prompt principal de producción a pruebas (sustituye el guardado en testing)."}
        </TooltipContent>
      </Tooltip>
      <div className="ml-auto flex flex-wrap justify-end gap-2">
        {hasChanges && (
          <Button
            type="button"
            variant="ghost"
            onClick={onToggleDiff}
            disabled={promptAndChatLocked}
          >
            {editorViewMode === "diff" ? "Editar" : "Ver cambios"}
          </Button>
        )}
        {showSuggestion && (
          <>
            <Button
              type="button"
              variant="ghost"
              onClick={onDiscardSuggestion}
              disabled={promptAndChatLocked}
            >
              <XIcon className="mr-1 h-3 w-3" />
              Descartar sugerencia
            </Button>
            <Button type="button" onClick={onApplySuggestion} disabled={promptAndChatLocked}>
              <CheckIcon className="mr-1 h-3 w-3" />
              Aplicar sugerencia
            </Button>
          </>
        )}
        <Button
          type="button"
          variant="outline"
          onClick={onUndo}
          disabled={(!hasChanges && !showSuggestion) || promptAndChatLocked}
        >
          Deshacer
        </Button>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button onClick={onSave} disabled={!canSave || isSaving || promptAndChatLocked}>
              {isSaving ? <Loader2Icon className="mr-2 h-4 w-4 animate-spin" /> : null}
              Guardar
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            Guarda los cambios en Testing para poder probarlos en &quot;Pruebas con kAI&quot;
          </TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              onClick={onOpenPushDialog}
              disabled={!canTransfer || promoting || promptAndChatLocked || loadingProductionPrompt}
              className={!canTransfer || loadingProductionPrompt ? "opacity-50" : ""}
              variant={canTransfer && !loadingProductionPrompt ? "default" : "outline"}
            >
              {promoting ? (
                <Loader2Icon className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <RocketIcon className="mr-2 h-4 w-4" />
              )}
              Subir a producción
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            {!canTransfer && canSave
              ? "Guarda primero para crear diferencia entre testing y producción."
              : !canTransfer
                ? "No hay diferencias entre testing y producción para subir."
                : hasLocalChanges
                  ? "Tienes cambios locales sin guardar; al subir se usará el snapshot guardado en testing."
                  : "Sube los cambios guardados en testing a producción. Esto los hará visibles para los usuarios."}
          </TooltipContent>
        </Tooltip>
      </div>
    </div>
  );
}
