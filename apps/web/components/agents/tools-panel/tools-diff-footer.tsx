"use client";

import { CloudDownloadIcon, InfoIcon, RocketIcon } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export function ToolsDiffFooter({
  diffCount,
  isDiffLoading,
  syncingFromProd,
  hasOpenDialog,
  onPullClick,
  onPromoteClick,
}: {
  diffCount: number;
  isDiffLoading: boolean;
  syncingFromProd: boolean;
  hasOpenDialog: boolean;
  onPullClick: () => void;
  onPromoteClick: () => void;
}) {
  const hasDiff = diffCount > 0;
  const canTransfer = hasDiff && !isDiffLoading;
  const showDialogWarning = hasOpenDialog && hasDiff;

  return (
    <div className="shrink-0 space-y-3 border-t bg-background/95 pt-4 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      {hasDiff ? (
        <div
          role="status"
          className="flex items-start gap-2 rounded-md border border-sky-500/30 bg-sky-500/5 px-3 py-2 text-xs text-muted-foreground"
        >
          <InfoIcon className="mt-0.5 size-3.5 shrink-0 text-sky-500" />
          <div className="space-y-1">
            <p>
              Hay{" "}
              <span className="font-semibold text-foreground">
                {diffCount} {diffCount === 1 ? "diferencia" : "diferencias"}
              </span>{" "}
              entre testing y producción para tools.
            </p>
            {showDialogWarning ? (
              <p>
                Tienes un diálogo de tool abierto.{" "}
                <strong className="text-foreground">Subir</strong> y{" "}
                <strong className="text-foreground">Bajar</strong> operan sobre
                el snapshot{" "}
                <strong className="text-foreground">ya guardado</strong> en
                testing, no sobre el borrador del diálogo.
              </p>
            ) : null}
          </div>
        </div>
      ) : null}

      <div className="flex flex-wrap justify-between gap-2">
        <Button
          type="button"
          variant="outline"
          title={
            canTransfer
              ? "Copiar properties, tools y colaboradores desde producción hacia testing"
              : "No hay diferencias de tools entre testing y producción"
          }
          onClick={onPullClick}
          disabled={!canTransfer || syncingFromProd}
        >
          <CloudDownloadIcon className="mr-2 size-4" />
          Bajar cambios
          {hasDiff ? (
            <Badge variant="secondary" className="ml-2">
              {diffCount}
            </Badge>
          ) : null}
        </Button>
        <Button
          type="button"
          title={
            canTransfer
              ? "Promover a producción solo los campos de tools que elijas (estado guardado en testing)"
              : "No hay diferencias de tools entre testing y producción"
          }
          onClick={onPromoteClick}
          disabled={!canTransfer || isDiffLoading}
        >
          <RocketIcon className="mr-2 size-4" />
          Subir cambios
          {hasDiff ? (
            <Badge
              variant="secondary"
              className="ml-2 bg-primary-foreground/15 text-primary-foreground"
            >
              {diffCount}
            </Badge>
          ) : null}
        </Button>
      </div>
    </div>
  );
}
