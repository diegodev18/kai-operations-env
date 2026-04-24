import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Loader2Icon,
  PowerIcon,
  PowerOffIcon,
  RotateCcwIcon,
} from "lucide-react";
import { SettingsSection } from "./settings-section";

export function StatusSection({
  isEnabled,
  agentVersion,
  pendingDocumentsCount,
  hasTestingProductionDiff,
  saving,
  canDiscard,
  onToggleEnabled,
  onDiscardChanges,
}: {
  isEnabled: boolean;
  agentVersion: string;
  pendingDocumentsCount: number;
  hasTestingProductionDiff: boolean;
  saving: boolean;
  canDiscard: boolean;
  onToggleEnabled: () => void;
  onDiscardChanges: () => void;
}) {
  return (
    <SettingsSection
      id="status"
      title="Estado del agente"
      description="Consulta si el agente está activo, si tiene cambios por guardar y si hay diferencias con la versión publicada."
      badge={
        <Badge variant={isEnabled ? "secondary" : "destructive"}>
          {isEnabled ? "Encendido" : "Apagado"}
        </Badge>
      }
    >
      <div className="grid gap-3 md:grid-cols-3">
        <div className="rounded-xl border bg-background/70 p-3">
          <p className="text-xs text-muted-foreground">Versión</p>
          <p className="mt-1 text-sm font-medium">{agentVersion}</p>
        </div>
        <div className="rounded-xl border bg-background/70 p-3">
          <p className="text-xs text-muted-foreground">Cambios locales</p>
          <p className="mt-1 text-sm font-medium">
            {pendingDocumentsCount === 0
              ? "Sin cambios"
              : `${pendingDocumentsCount} documento${
                  pendingDocumentsCount === 1 ? "" : "s"
                }`}
          </p>
        </div>
        <div className="rounded-xl border bg-background/70 p-3">
          <p className="text-xs text-muted-foreground">Pruebas vs producción</p>
          <p className="mt-1 text-sm font-medium">
            {hasTestingProductionDiff ? "Con diferencias" : "Sin diferencias"}
          </p>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2 border-t pt-3">
        <Button
          type="button"
          variant={isEnabled ? "outline" : "default"}
          size="sm"
          onClick={onToggleEnabled}
          disabled={saving}
          className="w-fit shrink-0"
        >
          {saving ? (
            <Loader2Icon className="h-4 w-4 animate-spin" />
          ) : isEnabled ? (
            <>
              <PowerOffIcon className="mr-1.5 h-4 w-4" />
              Apagar agente
            </>
          ) : (
            <>
              <PowerIcon className="mr-1.5 h-4 w-4" />
              Encender agente
            </>
          )}
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={onDiscardChanges}
          disabled={!canDiscard || saving}
        >
          <RotateCcwIcon className="mr-1.5 h-4 w-4" />
          Descartar cambios
        </Button>
      </div>
    </SettingsSection>
  );
}
