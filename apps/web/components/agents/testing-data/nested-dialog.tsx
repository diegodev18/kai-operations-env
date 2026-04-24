import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { FieldEditor } from "./field-editor";
import type { DocField } from "./types";
import { docToFields, fieldsToDoc, getValueType, coerceNestedArrayFromSavePayload } from "./helpers";

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
          <DialogTitle>{isArray ? "Editar array" : "Editar objeto"}</DialogTitle>
        </DialogHeader>
        <div className="max-h-[60vh] space-y-2 overflow-y-auto">
          <FieldEditor
            fields={nestedFields}
            onChange={setNestedFields}
            onEditNested={handleEditNested}
            mode={isArray ? "array" : "object"}
          />
        </div>
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
