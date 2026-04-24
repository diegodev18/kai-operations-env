import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { FieldEditor } from "./field-editor";
import type { DocField } from "./types";
import { docToFields, fieldsToDoc, getValueType, coerceNestedArrayFromSavePayload, arrayToFields } from "./helpers";

export function NestedDialog({
  isOpen,
  onClose,
  onSave,
  initialData,
  isArray = false,
}: {
  isOpen: boolean;
  onClose: () => void;
  onSave: (data: Record<string, unknown>) => void;
  initialData: Record<string, unknown>;
  isArray?: boolean;
}) {
  const [nestedFields, setNestedFields] = useState<DocField[]>(() => {
    if (isArray && "_array" in initialData) {
      return initialData._array as DocField[];
    }
    return initialData ? docToFields(initialData) : [{ key: "", value: "", type: "string" }];
  });

  const [innerNested, setInnerNested] = useState<{
    isOpen: boolean;
    parentKey: string;
    initialData: Record<string, unknown>;
    isArray: boolean;
  } | null>(null);

  const [viewMode, setViewMode] = useState<"fields" | "json">("fields");
  const [jsonText, setJsonText] = useState("");
  const [jsonParseError, setJsonParseError] = useState<string | null>(null);

  const fieldsToJsonValue = (): unknown =>
    isArray ? nestedFields.map((f) => f.value) : fieldsToDoc(nestedFields);

  const switchToJson = () => {
    setJsonText(JSON.stringify(fieldsToJsonValue(), null, 2));
    setJsonParseError(null);
    setViewMode("json");
  };

  const switchToFields = () => {
    try {
      const parsed = JSON.parse(jsonText);
      if (isArray) {
        if (!Array.isArray(parsed)) throw new Error("Se esperaba un array");
        setNestedFields(arrayToFields(parsed));
      } else {
        if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
          throw new Error("Se esperaba un objeto");
        }
        setNestedFields(docToFields(parsed as Record<string, unknown>));
      }
      setJsonParseError(null);
      setViewMode("fields");
    } catch (e) {
      setJsonParseError(e instanceof Error ? e.message : "JSON inválido");
    }
  };

  const handleEditNested = (key: string, value: unknown) => {
    if (typeof value !== "object" || value === null) return;
    if (Array.isArray(value)) {
      setInnerNested({
        isOpen: true,
        parentKey: key,
        initialData: { _array: value.map((v, i) => ({ key: String(i), value: v, type: getValueType(v) })) },
        isArray: true,
      });
    } else {
      setInnerNested({ isOpen: true, parentKey: key, initialData: value as Record<string, unknown>, isArray: false });
    }
  };

  const handleSave = () => {
    if (viewMode === "json") {
      try {
        const parsed = JSON.parse(jsonText);
        if (isArray) {
          if (!Array.isArray(parsed)) throw new Error("Se esperaba un array");
          onSave({ _array: parsed.map((v, i) => ({ key: String(i), value: v, type: getValueType(v) })).map((f) => f.value) });
        } else {
          if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
            throw new Error("Se esperaba un objeto");
          }
          onSave(parsed as Record<string, unknown>);
        }
        onClose();
      } catch (e) {
        setJsonParseError(e instanceof Error ? e.message : "JSON inválido");
      }
      return;
    }
    if (isArray) {
      onSave({ _array: nestedFields.map((f) => f.value) });
    } else {
      onSave(fieldsToDoc(nestedFields));
    }
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <DialogTitle>{isArray ? "Editar array" : "Editar objeto"}</DialogTitle>
            <div className="flex rounded-md border text-sm">
              <button
                type="button"
                onClick={() => viewMode === "json" ? switchToFields() : undefined}
                className={`px-3 py-1 rounded-l-md transition-colors ${viewMode === "fields" ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}
              >
                Fields
              </button>
              <button
                type="button"
                onClick={() => viewMode === "fields" ? switchToJson() : undefined}
                className={`px-3 py-1 rounded-r-md transition-colors ${viewMode === "json" ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}
              >
                JSON
              </button>
            </div>
          </div>
        </DialogHeader>

        {viewMode === "fields" ? (
          <div className="max-h-[60vh] space-y-2 overflow-y-auto">
            <FieldEditor
              fields={nestedFields}
              onChange={setNestedFields}
              onEditNested={handleEditNested}
              mode={isArray ? "array" : "object"}
            />
          </div>
        ) : (
          <div className="space-y-1">
            <Textarea
              value={jsonText}
              onChange={(e) => { setJsonText(e.target.value); setJsonParseError(null); }}
              className="min-h-[320px] font-mono text-sm"
              spellCheck={false}
            />
            {jsonParseError && (
              <p className="text-xs text-destructive">{jsonParseError}</p>
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={handleSave}>Guardar</Button>
        </DialogFooter>

        {innerNested && (
          <NestedDialog
            isOpen={innerNested.isOpen}
            onClose={() => setInnerNested(null)}
            onSave={(data) => {
              if (!innerNested) return;
              const isArrayEdit = "_array" in data;
              const newValue: unknown = isArrayEdit ? coerceNestedArrayFromSavePayload(data) : data;
              setNestedFields((prev) =>
                prev.map((f) => f.key === innerNested.parentKey ? { ...f, value: newValue } : f),
              );
              setInnerNested(null);
            }}
            initialData={innerNested.initialData}
            isArray={innerNested.isArray}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
