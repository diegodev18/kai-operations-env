"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
import { cn } from "@/lib/utils";
import type { TestingDiffItem } from "@/hooks";
import { postPromoteToProduction } from "@/services/agents-api";
import { formatFirestoreValue } from "@/utils/firestore-value-format";

type GroupedDiff = {
  collection: string;
  documentId: string;
  fields: {
    fieldKey: string;
    testingValue: unknown;
    productionValue: unknown;
    selected: boolean;
  }[];
};


function normalizeConfirmInput(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

export function PromoteDiffDialog({
  open,
  onOpenChange,
  diff,
  isLoading,
  agentId,
  agentNameForConfirm,
  onSuccess,
  dialogTitle = "Subir cambios a producción",
  dialogDescription,
  contentClassName = "max-h-[min(90vh,48rem)] overflow-y-auto sm:max-w-2xl",
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  diff: TestingDiffItem[];
  isLoading?: boolean;
  agentId: string;
  /** Kept for API compatibility; confirmation uses CONFIRMAR. */
  agentNameForConfirm: string;
  onSuccess?: () => void;
  dialogTitle?: string;
  dialogDescription?: ReactNode;
  contentClassName?: string;
}) {
  void agentNameForConfirm;
  const [confirmName, setConfirmName] = useState("");
  const [promoting, setPromoting] = useState(false);
  const [groupedData, setGroupedData] = useState<GroupedDiff[]>([]);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());

  const groupKey = (collection: string, documentId: string) =>
    `${collection}:${documentId}`;

  const initializeGroupedData = useCallback(() => {
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
        selected: true,
      });
    }
    setGroupedData([...groups.values()]);
    setExpandedGroups(new Set([...groups.keys()]));
  }, [diff]);

  useEffect(() => {
    if (open) {
      initializeGroupedData();
    }
  }, [diff, open, initializeGroupedData]);

  const handleOpenChange = useCallback(
    (open: boolean) => {
      onOpenChange(open);
      if (open) {
        setConfirmName("");
      }
    },
    [onOpenChange],
  );

  const toggleField = useCallback(
    (gKey: string, fieldIndex: number) => {
      setGroupedData((prev) =>
        prev.map((g) =>
          groupKey(g.collection, g.documentId) === gKey
            ? {
                ...g,
                fields: g.fields.map((f, fi) =>
                  fi === fieldIndex ? { ...f, selected: !f.selected } : f,
                ),
              }
            : g,
        ),
      );
    },
    [],
  );

  const toggleGroup = useCallback(
    (key: string) => {
      setGroupedData((prev) => {
        const group = prev.find((g) => groupKey(g.collection, g.documentId) === key);
        if (!group) return prev;
        const allSelected = group.fields.every((f) => f.selected);
        return prev.map((g) =>
          groupKey(g.collection, g.documentId) === key
            ? {
                ...g,
                fields: g.fields.map((f) => ({ ...f, selected: !allSelected })),
              }
            : g,
        );
      });
    },
    [],
  );

  const toggleExpanded = useCallback((key: string) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const selectedFields = useMemo(() => {
    const fields: Array<{
      collection: string;
      documentId: string;
      fieldKey: string;
      value: unknown;
    }> = [];
    for (const group of groupedData) {
      for (const field of group.fields) {
        if (field.selected) {
          fields.push({
            collection: group.collection,
            documentId: group.documentId,
            fieldKey: field.fieldKey,
            value: field.testingValue,
          });
        }
      }
    }
    return fields;
  }, [groupedData]);

  const totalFields = useMemo(
    () => groupedData.reduce((sum, g) => sum + g.fields.length, 0),
    [groupedData],
  );

  const selectedCount = selectedFields.length;

  const handlePromote = useCallback(async () => {
    if (selectedFields.length === 0) {
      toast.error("Selecciona al menos un campo");
      return;
    }
    if (normalizeConfirmInput(confirmName) !== "confirmar") {
      toast.error("Escribe CONFIRMAR para continuar");
      return;
    }
    setPromoting(true);
    try {
      const r = await postPromoteToProduction(agentId, {
        fields: selectedFields,
        confirmation_agent_name: confirmName.trim(),
      });
      if (r.ok) {
        toast.success("Campos promovidos a producción");
        handleOpenChange(false);
        onSuccess?.();
      } else {
        toast.error(r.error);
      }
    } catch {
      toast.error("Error al promover a producción");
    } finally {
      setPromoting(false);
    }
  }, [agentId, selectedFields, confirmName, onSuccess, handleOpenChange]);

  const defaultDescription = (
    <>
      Selecciona los campos que deseas promover desde testing a producción. Escribe{" "}
      <span className="font-medium text-foreground">CONFIRMAR</span> para continuar.
    </>
  );

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className={contentClassName} showClose>
        <DialogHeader>
          <DialogTitle>{dialogTitle}</DialogTitle>
          <DialogDescription>
            {dialogDescription ?? defaultDescription}
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-12 gap-2">
            <Loader2Icon className="h-8 w-8 animate-spin text-muted-foreground" />
            <p className="text-sm text-muted-foreground">Calculando diferencias...</p>
          </div>
        ) : diff.length === 0 ? (
          <p className="py-4 text-center text-sm text-muted-foreground">
            No hay diferencias entre testing y producción.
          </p>
        ) : (
          <div className="space-y-3 py-2">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">
                {selectedCount} de {totalFields} campos seleccionados
              </span>
              <div className="flex gap-2">
                <button
                  type="button"
                  className="text-xs text-muted-foreground hover:text-foreground"
                  onClick={() =>
                    setGroupedData((prev) =>
                      prev.map((g) => ({
                        ...g,
                        fields: g.fields.map((f) => ({ ...f, selected: true })),
                      })),
                    )
                  }
                >
                  Seleccionar todos
                </button>
                <button
                  type="button"
                  className="text-xs text-muted-foreground hover:text-foreground"
                  onClick={() =>
                    setGroupedData((prev) =>
                      prev.map((g) => ({
                        ...g,
                        fields: g.fields.map((f) => ({ ...f, selected: false })),
                      })),
                    )
                  }
                >
                  Deseleccionar todos
                </button>
              </div>
            </div>

            <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
              {groupedData.map((group) => {
                const key = groupKey(group.collection, group.documentId);
                const isExpanded = expandedGroups.has(key);
                const allSelected = group.fields.every((f) => f.selected);
                const someSelected = group.fields.some((f) => f.selected);

                return (
                  <div key={key} className="rounded-md border">
                    <div className="flex items-center gap-2 px-3 py-2 bg-muted/30">
                      <button
                        type="button"
                        className="shrink-0 text-muted-foreground hover:text-foreground"
                        onClick={() => toggleExpanded(key)}
                      >
                        {isExpanded ? (
                          <ChevronDownIcon className="w-4 h-4" />
                        ) : (
                          <ChevronRightIcon className="w-4 h-4" />
                        )}
                      </button>
                      <Checkbox
                        checked={allSelected}
                        onCheckedChange={() => toggleGroup(key)}
                        className={cn(
                          !allSelected && someSelected && "opacity-50"
                        )}
                      />
                      <span className="text-sm font-medium truncate">
                        {group.collection} / {group.documentId}
                      </span>
                      <span className="text-xs text-muted-foreground ml-auto shrink-0">
                        {group.fields.filter((f) => f.selected).length}/
                        {group.fields.length}
                      </span>
                    </div>

                    {isExpanded && (
                      <div className="divide-y">
                        {group.fields.map((field, fi) => (
                          <div
                            key={fi}
                            className="px-3 py-2 grid grid-cols-12 gap-2 items-start"
                          >
                            <div className="col-span-1 flex items-center justify-center">
                              <Checkbox
                                checked={field.selected}
                                onCheckedChange={() =>
                                  toggleField(key, fi)
                                }
                              />
                            </div>
                            <div className="col-span-3 text-xs font-mono text-muted-foreground truncate">
                              {field.fieldKey}
                            </div>
                            <div className="col-span-4 text-xs">
                              <div className="text-muted-foreground mb-0.5">
                                Testing:
                              </div>
                              <div className="bg-green-50/50 dark:bg-green-950/20 rounded px-1.5 py-0.5 font-mono text-xs break-words max-h-16 overflow-y-auto">
                                {formatFirestoreValue(field.testingValue)}
                              </div>
                            </div>
                            <div className="col-span-4 text-xs">
                              <div className="text-muted-foreground mb-0.5">
                                Producción:
                              </div>
                              <div className="bg-amber-50/50 dark:bg-amber-950/20 rounded px-1.5 py-0.5 font-mono text-xs break-words max-h-16 overflow-y-auto">
                                {formatFirestoreValue(field.productionValue)}
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
              <Label htmlFor="promote-confirm-name">Confirmar</Label>
              <Input
                id="promote-confirm-name"
                value={confirmName}
                onChange={(e) => setConfirmName(e.target.value)}
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
            disabled={promoting}
          >
            Cancelar
          </Button>
          <Button
            type="button"
            disabled={
              promoting ||
              selectedCount === 0 ||
              normalizeConfirmInput(confirmName) !== "confirmar"
            }
            onClick={() => void handlePromote()}
          >
            {promoting ? (
              <>
                <Loader2Icon className="mr-2 size-4 animate-spin" />
                Promoviendo…
              </>
            ) : (
              `Promover ${selectedCount} campo${selectedCount === 1 ? "" : "s"}`
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
