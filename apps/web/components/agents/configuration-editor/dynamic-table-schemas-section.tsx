import { FunnelIcon, Loader2Icon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import type { DynamicTableSchemasSectionProps } from "@/types";
import { SettingsSection } from "./settings-section";

export function DynamicTableSchemasSection({
  schemaSearch,
  onSchemaSearchChange,
  showOnlySelectedSchemas,
  onToggleShowOnlySelectedSchemas,
  schemasListError,
  schemasLoading,
  availableSchemas,
  filteredSchemas,
  schemasToRender,
  hiddenSchemasCount,
  showAllSchemas,
  selectedAllowedSchemaIds,
  onToggleSchemaSelection,
  onToggleShowAllSchemas,
  onSave,
  savingAllowedSchemas,
}: DynamicTableSchemasSectionProps) {
  return (
    <SettingsSection
      id="dynamic-table-schemas"
      title="Esquemas de tablas dinámicas"
      description="Solo se pueden asignar esquemas existentes en la base productiva de KAI."
    >
      <div className="flex w-full flex-col gap-2 sm:flex-row sm:items-center">
        <Input
          placeholder="Buscar por nombre o ID…"
          value={schemaSearch}
          onChange={(e) => onSchemaSearchChange(e.target.value)}
          className="w-full flex-1"
        />
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                size="sm"
                variant={showOnlySelectedSchemas ? "default" : "outline"}
                className="h-8 w-8 shrink-0 px-0"
                onClick={onToggleShowOnlySelectedSchemas}
                aria-label="Alternar filtro de esquemas seleccionados"
              >
                <FunnelIcon className="size-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="top" sideOffset={8}>
              {showOnlySelectedSchemas
                ? "Mostrar todos los esquemas"
                : "Mostrar solo los esquemas seleccionados"}
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>

      {schemasListError ? (
        <p className="text-sm text-destructive">{schemasListError}</p>
      ) : schemasLoading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2Icon className="size-4 animate-spin" />
          Cargando esquemas…
        </div>
      ) : availableSchemas.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No hay esquemas en este ambiente. Créalos en Base de datos → Esquemas.
        </p>
      ) : filteredSchemas.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No hay esquemas que coincidan con el filtro actual.
        </p>
      ) : (
        <>
          <ul className="max-h-64 space-y-2 overflow-y-auto pr-1">
            {schemasToRender.map((schema) => {
              const checked = selectedAllowedSchemaIds.includes(schema.schemaId);
              return (
                <li key={schema.schemaId} className="flex items-start gap-2">
                  <input
                    type="checkbox"
                    id={`allowed-schema-${schema.schemaId}`}
                    checked={checked}
                    onChange={(e) => onToggleSchemaSelection(schema.schemaId, e.target.checked)}
                    className="mt-0.5 h-4 w-4 rounded border-input"
                  />
                  <label
                    htmlFor={`allowed-schema-${schema.schemaId}`}
                    className="cursor-pointer text-sm leading-snug"
                  >
                    <span className="font-medium">{schema.label}</span>
                    <span className="ml-2 font-mono text-xs text-muted-foreground">
                      {schema.schemaId}
                    </span>
                  </label>
                </li>
              );
            })}
          </ul>
          {hiddenSchemasCount > 0 && (
            <div className="pt-1">
              <Button type="button" size="sm" variant="outline" onClick={onToggleShowAllSchemas}>
                {showAllSchemas ? "Ver menos" : `Ver ${hiddenSchemasCount} más`}
              </Button>
            </div>
          )}
        </>
      )}

      <div className="border-t border-border pt-4">
        <div className="flex justify-end">
          <Button
            type="button"
            size="sm"
            onClick={onSave}
            disabled={savingAllowedSchemas || schemasLoading}
          >
            {savingAllowedSchemas ? (
              <>
                <Loader2Icon className="mr-2 size-4 animate-spin" />
                Guardando…
              </>
            ) : (
              "Guardar esquemas"
            )}
          </Button>
        </div>
      </div>
    </SettingsSection>
  );
}
