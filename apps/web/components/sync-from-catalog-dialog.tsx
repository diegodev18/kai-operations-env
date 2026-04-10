"use client";

import { useCallback, useMemo, useState } from "react";
import { toast } from "sonner";
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
import { Loader2Icon, RefreshCwIcon } from "lucide-react";
import { updateAgentTool } from "@/hooks/agent-tools";
import type { AgentTool } from "@/types/agent-tool";
import type { ToolsCatalogItem } from "@/lib/agents-api";

type FieldSync = {
  key: string;
  label: string;
  currentValue: unknown;
  catalogValue: unknown;
  selected: boolean;
};

function deepSortKeys(obj: unknown): unknown {
  if (obj === null || typeof obj !== "object") return obj;
  if (Array.isArray(obj)) return obj.map(deepSortKeys);
  const sorted: Record<string, unknown> = {};
  Object.keys(obj as object).sort().forEach((key) => {
    sorted[key] = deepSortKeys((obj as Record<string, unknown>)[key]);
  });
  return sorted;
}

function valueEquals(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a === null || b === null) return a === b;
  if (typeof a !== typeof b) return false;

  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    return a.every((item, i) => valueEquals(item, b[i]));
  }

  if (typeof a === "object" && typeof b === "object") {
    if (a === null || b === null) return a === b;
    const keysA = Object.keys(a as object);
    const keysB = Object.keys(b as object);
    if (keysA.length !== keysB.length) return false;
    return keysA.every((key) =>
      valueEquals(
        (a as Record<string, unknown>)[key],
        (b as Record<string, unknown>)[key],
      ),
    );
  }

  return JSON.stringify(a) === JSON.stringify(b);
}

function valuesAreEqual(a: unknown, b: unknown): boolean {
  return valueEquals(deepSortKeys(a), deepSortKeys(b));
}

function formatValue(value: unknown): string {
  if (value === undefined || value === null) return "—";
  if (typeof value === "object") return JSON.stringify(value, null, 2);
  return String(value);
}

export function SyncFromCatalogDialog({
  open,
  onOpenChange,
  agentId,
  tool,
  catalogTool,
  onSuccess,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  agentId: string;
  tool: AgentTool;
  catalogTool: ToolsCatalogItem;
  onSuccess?: () => void;
}) {
  const [syncing, setSyncing] = useState(false);

  const fields = useMemo<FieldSync[]>(() => {
    const toolCrmConfig =
      (tool.properties as Record<string, unknown>)?.crmConfig ??
      (tool as unknown as Record<string, unknown>)?.crmConfig;
    const catalogCrmConfig =
      (catalogTool.properties as Record<string, unknown>)?.crmConfig;
    const toolParams = tool.parameters;
    const catalogParams = catalogTool.parameters;

    const hasDisplayNameChanged = !valuesAreEqual(tool.displayName ?? null, catalogTool.displayName);
    const hasDescriptionChanged = !valuesAreEqual(tool.description, catalogTool.description);
    const hasPathChanged = !valuesAreEqual(tool.path ?? null, catalogTool.path);
    const hasCrmConfigChanged = !valuesAreEqual(toolCrmConfig, catalogCrmConfig);
    const hasParamsChanged = !valuesAreEqual(toolParams, catalogParams);

    return [
      {
        key: "displayName",
        label: "Nombre para mostrar",
        currentValue: tool.displayName ?? null,
        catalogValue: catalogTool.displayName,
        selected: hasDisplayNameChanged,
      },
      {
        key: "description",
        label: "Descripción",
        currentValue: tool.description,
        catalogValue: catalogTool.description,
        selected: hasDescriptionChanged,
      },
      {
        key: "path",
        label: "Ruta (path)",
        currentValue: tool.path ?? null,
        catalogValue: catalogTool.path,
        selected: hasPathChanged,
      },
      {
        key: "crmConfig",
        label: "Configuración CRM",
        currentValue: toolCrmConfig,
        catalogValue: catalogCrmConfig,
        selected: hasCrmConfigChanged,
      },
      {
        key: "parameters",
        label: "Parámetros",
        currentValue: toolParams,
        catalogValue: catalogParams,
        selected: hasParamsChanged,
      },
    ];
  }, [tool, catalogTool]);

  const [fieldStates, setFieldStates] = useState<FieldSync[]>(fields);

  const handleOpenChange = useCallback(
    (isOpen: boolean) => {
      if (!isOpen) {
        setFieldStates(fields);
      }
      onOpenChange(isOpen);
    },
    [onOpenChange, fields],
  );

  const toggleField = useCallback((key: string) => {
    setFieldStates((prev) =>
      prev.map((f) => (f.key === key ? { ...f, selected: !f.selected } : f)),
    );
  }, []);

  const toggleAll = useCallback((selected: boolean) => {
    setFieldStates((prev) => prev.map((f) => ({ ...f, selected })));
  }, []);

  const selectedCount = useMemo(
    () => fieldStates.filter((f) => f.selected).length,
    [fieldStates],
  );

  const hasAnyChange = useMemo(
    () => fieldStates.some((f) => !valuesAreEqual(f.currentValue, f.catalogValue)),
    [fieldStates],
  );

  const handleSync = useCallback(async () => {
    if (selectedCount === 0) {
      toast.error("Selecciona al menos un campo");
      return;
    }

    setSyncing(true);
    try {
      const updateBody: Record<string, unknown> = {};
      let newCrmConfig: unknown = undefined;

      for (const field of fieldStates) {
        if (!field.selected) continue;
        if (field.key === "crmConfig") {
          newCrmConfig = field.catalogValue;
        } else if (field.key === "parameters") {
          updateBody.parameters = field.catalogValue;
        } else if (field.key === "displayName") {
          updateBody.displayName = field.catalogValue || null;
        } else if (field.key === "path") {
          updateBody.path = field.catalogValue || null;
        } else if (field.key === "description") {
          updateBody.description = String(field.catalogValue ?? "");
        }
      }

      if (newCrmConfig !== undefined) {
        updateBody.properties = {
          ...tool.properties,
          crmConfig: newCrmConfig,
        };
      }

      const updated = await updateAgentTool(agentId, tool.id, updateBody);
      if (updated) {
        toast.success("Tool sincronizada desde el catálogo");
        handleOpenChange(false);
        onSuccess?.();
      } else {
        toast.error("No se pudo actualizar la tool");
      }
    } catch (e) {
      toast.error("Error al sincronizar desde el catálogo");
    } finally {
      setSyncing(false);
    }
  }, [agentId, tool.id, fieldStates, selectedCount, onSuccess, handleOpenChange]);

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        className="max-h-[min(90vh,48rem)] overflow-y-auto sm:max-w-2xl"
        showClose
      >
        <DialogHeader>
<DialogTitle className="flex items-center gap-2">
            <RefreshCwIcon className="h-5 w-5" />
            Sincronizar desde catálogo
          </DialogTitle>
          <DialogDescription>
            Compara los valores actuales de la tool con los del catálogo y selecciona
            cuáles sincronizar.
          </DialogDescription>
        </DialogHeader>

        {!catalogTool ? (
          <div className="py-8 text-center text-sm text-muted-foreground">
            Esta tool no existe en el catálogo de herramientas.
          </div>
        ) : (
          <div className="space-y-3 py-2">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">
                {selectedCount} de {fieldStates.length} campos seleccionados
              </span>
              <div className="flex gap-2">
                <button
                  type="button"
                  className="text-xs text-muted-foreground hover:text-foreground"
                  onClick={() => toggleAll(true)}
                >
                  Seleccionar todos
                </button>
                <button
                  type="button"
                  className="text-xs text-muted-foreground hover:text-foreground"
                  onClick={() => toggleAll(false)}
                >
                  Deseleccionar todos
                </button>
              </div>
            </div>

            <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
              {fieldStates.map((field) => {
                const hasChanged = !valuesAreEqual(field.currentValue, field.catalogValue);

                return (
                  <div
                    key={field.key}
                    className="rounded-md border"
                  >
                    <div className="flex items-center gap-2 px-3 py-2 bg-muted/30">
                      <Checkbox
                        checked={field.selected}
                        onCheckedChange={() => toggleField(field.key)}
                        disabled={!hasChanged}
                      />
                      <span className="text-sm font-medium">{field.label}</span>
                      {!hasChanged && (
                        <span className="text-xs text-muted-foreground ml-auto">
                          (sin cambios)
                        </span>
                      )}
                    </div>

                    {hasChanged && (
                      <div className="divide-y">
                        <div className="px-3 py-2 grid grid-cols-2 gap-2 items-start text-xs">
                          <div>
                            <div className="text-muted-foreground mb-0.5">
                              Actual:
                            </div>
                            <div className="rounded bg-red-50/50 dark:bg-red-950/20 px-1.5 py-0.5 font-mono text-xs break-words max-h-16 overflow-y-auto">
                              {formatValue(field.currentValue)}
                            </div>
                          </div>
                          <div>
                            <div className="text-muted-foreground mb-0.5">
                              Catálogo:
                            </div>
                            <div className="rounded bg-green-50/50 dark:bg-green-950/20 px-1.5 py-0.5 font-mono text-xs break-words max-h-16 overflow-y-auto">
                              {formatValue(field.catalogValue)}
                            </div>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => handleOpenChange(false)}
            disabled={syncing}
          >
            Cancelar
          </Button>
          <Button
            type="button"
            disabled={syncing || selectedCount === 0 || !catalogTool}
            onClick={() => void handleSync()}
          >
            {syncing ? (
              <>
                <Loader2Icon className="mr-2 size-4 animate-spin" />
                Sincronizando…
              </>
            ) : (
              `Sincronizar ${selectedCount} campo${selectedCount === 1 ? "" : "s"}`
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}