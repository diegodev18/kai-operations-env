import { Button } from "@/components/ui/button";
import { CloudDownloadIcon, RocketIcon } from "lucide-react";

export function ConfigurationActionsBar({
  hasLocalChanges,
  pendingDocumentsCount,
  canTransfer,
  saving,
  syncingFromProd,
  hasData,
  onOpenPull,
  onOpenPromote,
  onOpenLocalChanges,
}: {
  hasLocalChanges: boolean;
  pendingDocumentsCount: number;
  canTransfer: boolean;
  saving: boolean;
  syncingFromProd: boolean;
  hasData: boolean;
  onOpenPull: () => void;
  onOpenPromote: () => void;
  onOpenLocalChanges: () => void;
}) {
  return (
    <div
      className="shrink-0 flex flex-col gap-4 border-t border-border bg-background/95 py-4 backdrop-blur supports-[backdrop-filter]:bg-background/80 sm:flex-row sm:items-end sm:justify-between"
      role="toolbar"
      aria-label="Acciones de configuración"
    >
      <div className="min-w-0 flex-1 space-y-1">
        <p className="text-sm font-medium">Cambios de configuración</p>
        <p className="text-xs text-muted-foreground">
          {hasLocalChanges
            ? `${pendingDocumentsCount} documento${
                pendingDocumentsCount === 1 ? "" : "s"
              } con cambios locales`
            : "No hay cambios locales pendientes."}
        </p>
      </div>
      <div className="flex w-full shrink-0 flex-col gap-2 sm:w-auto sm:flex-row sm:items-center sm:justify-end">
        <Button
          type="button"
          variant="outline"
          size="sm"
          title={
            canTransfer
              ? "Traer la configuración publicada a pruebas"
              : "No hay diferencias entre pruebas y producción"
          }
          className="gap-1.5 w-full sm:w-auto"
          onClick={onOpenPull}
          disabled={!canTransfer || saving || syncingFromProd}
        >
          <CloudDownloadIcon className="size-4" />
          Bajar cambios
        </Button>
        <Button
          type="button"
          variant="default"
          size="sm"
          className="gap-1.5 w-full sm:w-auto"
          onClick={onOpenPromote}
          disabled={saving || !canTransfer || !hasData}
          title={
            canTransfer
              ? "Publicar los cambios guardados en pruebas"
              : "No hay diferencias entre pruebas y producción"
          }
        >
          <RocketIcon className="size-4" />
          Subir cambios
        </Button>
        <Button
          type="button"
          variant="default"
          size="sm"
          onClick={onOpenLocalChanges}
          disabled={saving || !hasData || !hasLocalChanges}
          title="Ver el detalle de cambios pendientes y guardar en pruebas"
          className="w-full shrink-0 sm:w-auto"
        >
          Guardar cambios
        </Button>
      </div>
    </div>
  );
}
