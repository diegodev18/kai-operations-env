import { Button } from "@/components/ui/button";
import { Loader2Icon } from "lucide-react";

export function PromptDesignerAlerts({
  systemPromptGenInProgress,
  systemPromptGenFailed,
  generationError,
  regenerateSystemPromptLoading,
  onRegenerate,
}: {
  systemPromptGenInProgress: boolean;
  systemPromptGenFailed: boolean;
  generationError: string | undefined;
  regenerateSystemPromptLoading: boolean;
  onRegenerate: () => void;
}) {
  return (
    <>
      {systemPromptGenInProgress && (
        <div
          className="mb-3 flex items-start gap-2 rounded-lg border border-primary/35 bg-primary/5 px-3 py-2.5 text-sm text-foreground"
          role="status"
        >
          <Loader2Icon className="mt-0.5 h-4 w-4 shrink-0 animate-spin text-primary" />
          <div>
            <p className="font-medium">Generando system prompt especializado…</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Esto ocurre en segundo plano. El editor y el asistente están en solo lectura hasta que
              termine. Esta página se actualiza sola cada pocos segundos.
            </p>
          </div>
        </div>
      )}
      {systemPromptGenFailed && (
        <div className="mb-3 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2.5 text-sm">
          <p className="font-medium text-destructive">No se pudo generar el system prompt</p>
          <p className="mt-1 break-words text-xs text-muted-foreground">
            {generationError?.trim() ||
              "Reintenta la generación o revisa la configuración del agente."}
          </p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="mt-2"
            disabled={regenerateSystemPromptLoading}
            onClick={onRegenerate}
          >
            {regenerateSystemPromptLoading ? (
              <Loader2Icon className="mr-1 h-3.5 w-3.5 animate-spin" />
            ) : null}
            Reintentar generación
          </Button>
        </div>
      )}
    </>
  );
}
