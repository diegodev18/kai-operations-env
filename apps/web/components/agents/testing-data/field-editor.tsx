import { PencilIcon, PlusIcon, Trash2Icon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { DocField } from "./types";
import { normalizeArrayRowKeys } from "./helpers";

export function FieldEditor({
  fields,
  onChange,
  onEditNested,
  mode = "object",
}: {
  fields: DocField[];
  onChange: (fields: DocField[]) => void;
  onEditNested: (key: string, value: unknown) => void;
  mode?: "object" | "array";
}) {
  const isArrayMode = mode === "array";

  const addField = () => {
    if (isArrayMode) {
      onChange(normalizeArrayRowKeys([...fields, { key: "", value: "", type: "string" }]));
      return;
    }
    onChange([...fields, { key: "", value: "", type: "string" }]);
  };

  const removeField = (index: number) => {
    const next = fields.filter((_, i) => i !== index);
    onChange(isArrayMode ? normalizeArrayRowKeys(next) : next);
  };

  const updateField = (index: number, updated: DocField) => {
    const newFields = [...fields];
    newFields[index] = isArrayMode ? { ...updated, key: String(index) } : updated;
    onChange(newFields);
  };

  const formatValue = (value: unknown, type: DocField["type"]): string => {
    if (type === "object") return `{${Object.keys(value as object).length} campos}`;
    if (type === "array") return `[${(value as unknown[]).length} items]`;
    if (value === null) return "null";
    return String(value);
  };

  return (
    <div className="space-y-2">
      {fields.map((field, index) => (
        <div key={index} className="flex items-start gap-2">
          {isArrayMode ? (
            <div
              className="flex w-10 shrink-0 items-center justify-center rounded-md border bg-muted/50 px-1 py-2 font-mono text-sm text-muted-foreground"
              aria-label={`Índice ${index}`}
            >
              {index}
            </div>
          ) : (
            <Input
              value={field.key}
              onChange={(e) => updateField(index, { ...field, key: e.target.value })}
              placeholder="Campo"
              className="w-40"
              aria-label="Nombre del campo"
            />
          )}
          <Select
            value={field.type}
            onValueChange={(type: DocField["type"]) => {
              let value: unknown = field.value;
              if (type === "null") value = null;
              else if (type === "boolean") value = true;
              else if (type === "number") value = 0;
              else if (type === "object") value = {};
              else if (type === "array") value = [];
              else value = "";
              updateField(index, { ...field, type, value });
            }}
          >
            <SelectTrigger className="w-28" aria-label="Tipo de campo">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="string">Texto</SelectItem>
              <SelectItem value="number">Número</SelectItem>
              <SelectItem value="boolean">Booleano</SelectItem>
              <SelectItem value="null">Nulo</SelectItem>
              <SelectItem value="object">Object</SelectItem>
              <SelectItem value="array">Array</SelectItem>
            </SelectContent>
          </Select>

          {field.type === "string" ? (
            <Input
              value={String(field.value ?? "")}
              onChange={(e) => updateField(index, { ...field, value: e.target.value })}
              placeholder="Valor"
              className="flex-1"
            />
          ) : field.type === "number" ? (
            <Input
              type="number"
              value={String(field.value ?? 0)}
              onChange={(e) => updateField(index, { ...field, value: parseFloat(e.target.value) || 0 })}
              placeholder="0"
              className="flex-1"
            />
          ) : field.type === "boolean" ? (
            <Select
              value={String(field.value ?? true)}
              onValueChange={(value) => updateField(index, { ...field, value: value === "true" })}
            >
              <SelectTrigger className="flex-1">
                <SelectValue placeholder="Seleccionar" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="true">true</SelectItem>
                <SelectItem value="false">false</SelectItem>
              </SelectContent>
            </Select>
          ) : field.type === "null" ? (
            <Input value="null" disabled className="flex-1 bg-muted" aria-label="Valor nulo" />
          ) : (
            <div className="flex flex-1 items-center gap-2">
              <Input
                value={formatValue(field.value, field.type)}
                disabled
                className="flex-1 bg-muted"
              />
              <Button
                variant="outline"
                size="icon"
                onClick={() => onEditNested(isArrayMode ? String(index) : field.key, field.value)}
                aria-label={`Editar ${field.type === "array" ? "array" : "objeto"}`}
              >
                <PencilIcon className="size-4" />
              </Button>
            </div>
          )}

          <Button
            variant="ghost"
            size="icon"
            className="size-9 shrink-0"
            onClick={() => removeField(index)}
            aria-label={`Eliminar ${isArrayMode ? `elemento ${index}` : `campo "${field.key}"`}`}
          >
            <Trash2Icon className="size-4 text-destructive" />
          </Button>
        </div>
      ))}
      <Button variant="outline" size="sm" onClick={addField}>
        <PlusIcon className="mr-1 size-4" />
        {isArrayMode ? "Agregar elemento" : "Agregar campo"}
      </Button>
    </div>
  );
}
