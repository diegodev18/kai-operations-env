"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  ChevronDownIcon,
  ChevronRightIcon,
  Loader2Icon,
} from "lucide-react";
import type { TestingDiffItem } from "@/hooks";
import { postAgentSyncFromProduction } from "@/services/agents-api";

function formatValue(value: unknown): string {
  if (value === undefined || value === null) return "—";
  if (typeof value === "object") return JSON.stringify(value, null, 2);
  return String(value);
}

function normalizeConfirmInput(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

type GroupedDiff = {
  collection: string;
  documentId: string;
  fields: {
    fieldKey: string;
    testingValue: unknown;
    productionValue: unknown;
  }[];
};

const groupKey = (collection: string, documentId: string) =>
  `${collection}:${documentId}`;

/**
 * Preview + confirm pull: full sync from production → testing (properties, tools, collaborators).
 * `diff` should be tools-only rows for display in the tools panel.
 */
export function ToolsPullFromProductionDialog({
  open,
  onOpenChange,
  diff,
  isLoading,
  agentId,
  syncing,
  onSyncingChange,
  onSuccess,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  diff: TestingDiffItem[];
  isLoading?: boolean;
  agentId: string;
  syncing: boolean;
  onSyncingChange: (syncing: boolean) => void;
  onSuccess?: () => void;
}) {
  const [confirmText, setConfirmText] = useState("");
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());

  const groupedData = useMemo(() => {
    const groups = new Map<string, GroupedDiff>();
    for (const item of diff) {
      const key = groupKey(item.collection, item.documentId);
      if (!groups.has(key)) {
        groups.set(key, {
          collection: item.collection,
          documentId: item.documentId,
          fields: [],
        });
      }
      groups.get(key)!.fields.push({
        fieldKey: item.fieldKey,
        testingValue: item.testingValue,
        productionValue: item.productionValue,
      });
    }
    return [...groups.values()];
  }, [diff]);

  useEffect(() => {
    if (open && groupedData.length > 0) {
      setExpandedGroups(
        new Set(groupedData.map((g) => groupKey(g.collection, g.documentId))),
      );
    }
  }, [open, groupedData]);

  const handleOpenChange = useCallback(
    (next: boolean) => {
      onOpenChange(next);
      if (!next) setConfirmText("");
    },
    [onOpenChange],
  );

  const toggleExpanded = useCallback((key: string) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const handlePull = useCallback(async () => {
    if (normalizeConfirmInput(confirmText) !== "confirmar") {
      toast.error("Escribe CONFIRMAR para continuar");
      return;
    }
    onSyncingChange(true);
    try {
      const r = await postAgentSyncFromProduction(agentId);
      if (r.ok) {
        toast.success("Testing actualizado desde producción");
        handleOpenChange(false);
        onSuccess?.();
      } else {
        toast.error(r.error);
      }
    } catch {
      toast.error("No se pudo bajar desde producción");
    } finally {
      onSyncingChange(false);
    }
  }, [agentId, confirmText, handleOpenChange, onSuccess, onSyncingChange]);

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        className="max-h-[min(90vh,48rem)] overflow-y-auto sm:max-w-2xl"
        showClose
      >
        <DialogHeader>
          <DialogTitle>Bajar cambios desde producción</DialogTitle>
          <DialogDescription>
            Se copiarán <span className="font-medium text-foreground">properties</span>,{" "}
            <span className="font-medium text-foreground">tools</span> y{" "}
            <span className="font-medium text-foreground">colaboradores</span> desde producción
            hacia testing (merge). Escribe{" "}
            <span className="font-medium text-foreground">CONFIRMAR</span> para continuar.
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="flex flex-col items-center justify-center gap-2 py-12">
            <Loader2Icon className="h-8 w-8 animate-spin text-muted-foreground" />
            <p className="text-sm text-muted-foreground">Calculando diferencias…</p>
          </div>
        ) : diff.length === 0 ? (
          <p className="py-4 text-center text-sm text-muted-foreground">
            No hay diferencias de tools entre testing y producción. No es necesario bajar cambios.
          </p>
        ) : (
          <div className="space-y-3 py-2">
            <p className="text-xs text-muted-foreground">
              Vista previa de diferencias en <span className="font-medium">tools</span> (origen:
              producción → destino: testing tras la sincronización).
            </p>
            <div className="max-h-80 space-y-2 overflow-y-auto pr-1">
              {groupedData.map((group) => {
                const key = groupKey(group.collection, group.documentId);
                const isExpanded = expandedGroups.has(key);
                return (
                  <div key={key} className="rounded-md border">
                    <div className="flex items-center gap-2 bg-muted/30 px-3 py-2">
                      <button
                        type="button"
                        className="shrink-0 text-muted-foreground hover:text-foreground"
                        onClick={() => toggleExpanded(key)}
                      >
                        {isExpanded ? (
                          <ChevronDownIcon className="h-4 w-4" />
                        ) : (
                          <ChevronRightIcon className="h-4 w-4" />
                        )}
                      </button>
                      <span className="truncate text-sm font-medium">
                        {group.collection} / {group.documentId}
                      </span>
                      <span className="ml-auto shrink-0 text-xs text-muted-foreground">
                        {group.fields.length} campo{group.fields.length === 1 ? "" : "s"}
                      </span>
                    </div>
                    {isExpanded && (
                      <div className="divide-y">
                        {group.fields.map((field, fi) => (
                          <div
                            key={fi}
                            className="grid grid-cols-12 items-start gap-2 px-3 py-2"
                          >
                            <div className="col-span-12 text-xs font-mono text-muted-foreground sm:col-span-2 sm:truncate">
                              {field.fieldKey}
                            </div>
                            <div className="col-span-12 text-xs sm:col-span-5">
                              <div className="mb-0.5 text-muted-foreground">Producción (origen)</div>
                              <div className="max-h-20 overflow-y-auto rounded bg-amber-50/50 px-1.5 py-0.5 font-mono text-xs break-words dark:bg-amber-950/20">
                                {formatValue(field.productionValue)}
                              </div>
                            </div>
                            <div className="col-span-12 text-xs sm:col-span-5">
                              <div className="mb-0.5 text-muted-foreground">Testing (ahora)</div>
                              <div className="max-h-20 overflow-y-auto rounded bg-green-50/50 px-1.5 py-0.5 font-mono text-xs break-words dark:bg-green-950/20">
                                {formatValue(field.testingValue)}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            <div className="space-y-2">
              <Label htmlFor="pull-tools-confirm">Confirmar</Label>
              <Input
                id="pull-tools-confirm"
                value={confirmText}
                onChange={(e) => setConfirmText(e.target.value)}
                placeholder="CONFIRMAR"
                autoComplete="off"
              />
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
            disabled={
              syncing ||
              isLoading ||
              diff.length === 0 ||
              normalizeConfirmInput(confirmText) !== "confirmar"
            }
            onClick={() => void handlePull()}
          >
            {syncing ? (
              <>
                <Loader2Icon className="mr-2 size-4 animate-spin" />
                Sincronizando…
              </>
            ) : (
              "Bajar a testing"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
