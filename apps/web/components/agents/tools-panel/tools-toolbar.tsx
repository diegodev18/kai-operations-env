"use client";

import { PlusIcon, SearchIcon, WrenchIcon, XIcon } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";

import {
  TOOL_TYPE_FILTERS,
  type ToolEnabledFilter,
  type ToolTypeFilter,
} from "./types";

export function ToolsToolbar({
  totalCount,
  enabledCount,
  filteredCount,
  query,
  onQueryChange,
  typeFilter,
  onTypeFilterChange,
  enabledFilter,
  onEnabledFilterChange,
  onAddTool,
}: {
  totalCount: number;
  enabledCount: number;
  filteredCount: number;
  query: string;
  onQueryChange: (next: string) => void;
  typeFilter: ToolTypeFilter;
  onTypeFilterChange: (next: ToolTypeFilter) => void;
  enabledFilter: ToolEnabledFilter;
  onEnabledFilterChange: (next: ToolEnabledFilter) => void;
  onAddTool: () => void;
}) {
  const showOnlyEnabled = enabledFilter === "enabled";
  const isFiltered =
    query.trim() !== "" ||
    typeFilter !== "all" ||
    enabledFilter !== "all";
  const showCountBadge = isFiltered && filteredCount !== totalCount;

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-center gap-2">
          <div className="flex size-8 shrink-0 items-center justify-center rounded-md border bg-muted/40">
            <WrenchIcon className="size-4 text-muted-foreground" />
          </div>
          <div className="min-w-0">
            <h2 className="text-sm font-semibold leading-tight">Tools</h2>
            <p className="text-xs text-muted-foreground">
              {totalCount === 0
                ? "Sin herramientas configuradas"
                : `${totalCount} ${totalCount === 1 ? "herramienta" : "herramientas"} · ${enabledCount} habilitadas`}
              {showCountBadge ? (
                <>
                  {" · "}
                  <span className="text-foreground">
                    Mostrando {filteredCount}
                  </span>
                </>
              ) : null}
            </p>
          </div>
        </div>
        <Button size="sm" onClick={onAddTool} className="shrink-0">
          <PlusIcon className="mr-1 size-4" />
          Agregar tool
        </Button>
      </div>

      <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:gap-3">
        <div className="relative min-w-0 flex-1">
          <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
            placeholder="Buscar por nombre o descripción..."
            className="pr-9 pl-9"
            aria-label="Buscar tools"
          />
          {query ? (
            <button
              type="button"
              onClick={() => onQueryChange("")}
              aria-label="Limpiar búsqueda"
              className="absolute top-1/2 right-2.5 -translate-y-1/2 rounded-sm p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <XIcon className="size-3.5" />
            </button>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div
            className="flex items-center gap-1 rounded-md border bg-muted/30 p-0.5"
            role="group"
            aria-label="Filtrar por tipo"
          >
            {TOOL_TYPE_FILTERS.map((option) => {
              const isActive = typeFilter === option.value;
              return (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => onTypeFilterChange(option.value)}
                  className={cn(
                    "rounded-sm px-2.5 py-1 text-xs font-medium transition-colors",
                    isActive
                      ? "bg-background text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {option.label}
                </button>
              );
            })}
          </div>
          <label className="flex items-center gap-2 rounded-md border px-3 py-1.5 text-xs font-medium">
            <Switch
              checked={showOnlyEnabled}
              onCheckedChange={(checked) =>
                onEnabledFilterChange(checked ? "enabled" : "all")
              }
              aria-label="Mostrar solo tools habilitadas"
            />
            Solo habilitadas
          </label>
          {isFiltered ? (
            <Badge variant="secondary" className="gap-1">
              <button
                type="button"
                onClick={() => {
                  onQueryChange("");
                  onTypeFilterChange("all");
                  onEnabledFilterChange("all");
                }}
                className="inline-flex items-center gap-1"
                aria-label="Limpiar filtros"
              >
                <XIcon className="size-3" />
                Limpiar
              </button>
            </Badge>
          ) : null}
        </div>
      </div>
    </div>
  );
}
