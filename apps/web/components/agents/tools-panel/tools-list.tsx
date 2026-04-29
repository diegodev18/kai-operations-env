"use client";

import { PlusIcon, SearchXIcon, WrenchIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import type { AgentTool } from "@/types";

import { ToolCard } from "./tool-card";

export function ToolsList({
  tools,
  togglingToolId,
  onToggleEnabled,
  onEdit,
  onDelete,
}: {
  tools: AgentTool[];
  togglingToolId: string | null;
  onToggleEnabled: (tool: AgentTool, enabled: boolean) => void;
  onEdit: (tool: AgentTool) => void;
  onDelete: (tool: AgentTool) => void;
}) {
  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
      {tools.map((tool) => (
        <ToolCard
          key={tool.id}
          tool={tool}
          togglingToolId={togglingToolId}
          onToggleEnabled={onToggleEnabled}
          onEdit={onEdit}
          onDelete={onDelete}
        />
      ))}
    </div>
  );
}

export function ToolsListSkeleton({ count = 6 }: { count?: number }) {
  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
      {Array.from({ length: count }).map((_, index) => (
        <Card key={index} className="gap-4 py-5">
          <div className="space-y-2 px-5">
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 space-y-2">
                <div className="h-5 w-16 animate-pulse rounded-full bg-muted" />
                <div className="h-4 w-3/4 animate-pulse rounded bg-muted" />
                <div className="h-3 w-1/2 animate-pulse rounded bg-muted/70" />
              </div>
              <div className="h-5 w-9 shrink-0 animate-pulse rounded-full bg-muted" />
            </div>
          </div>
          <CardContent className="space-y-2 px-5">
            <div className="h-3 w-full animate-pulse rounded bg-muted/70" />
            <div className="h-3 w-5/6 animate-pulse rounded bg-muted/70" />
            <div className="h-3 w-2/3 animate-pulse rounded bg-muted/70" />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

export function ToolsEmptyState({ onAddTool }: { onAddTool: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed bg-muted/20 px-6 py-16 text-center">
      <div className="flex size-14 items-center justify-center rounded-full bg-muted">
        <WrenchIcon className="size-7 text-muted-foreground" />
      </div>
      <h3 className="mt-4 text-base font-semibold">Aún no hay tools</h3>
      <p className="mt-1.5 max-w-sm text-sm text-muted-foreground">
        Las tools le permiten al agente ejecutar acciones reales: crear citas,
        consultar inventario, escalar a soporte, y más. Agrega la primera para
        empezar.
      </p>
      <Button onClick={onAddTool} className="mt-5">
        <PlusIcon className="mr-1 size-4" />
        Agregar tu primera tool
      </Button>
    </div>
  );
}

export function ToolsNoMatchesState({
  onClearFilters,
}: {
  onClearFilters: () => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed bg-muted/10 px-6 py-12 text-center">
      <div className="flex size-12 items-center justify-center rounded-full bg-muted">
        <SearchXIcon className="size-6 text-muted-foreground" />
      </div>
      <h3 className="mt-3 text-sm font-semibold">Sin resultados</h3>
      <p className="mt-1 max-w-xs text-xs text-muted-foreground">
        No hay tools que coincidan con tu búsqueda o filtros aplicados.
      </p>
      <Button
        variant="ghost"
        size="sm"
        className="mt-3"
        onClick={onClearFilters}
      >
        Limpiar filtros
      </Button>
    </div>
  );
}
