import { useCallback, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PlusIcon, Trash2Icon } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  EMPTY_SCHEMA,
  SCHEMA_TYPES,
  type EditorProperty,
  type EditorState,
  type SchemaType,
} from "@/types/parameter-schema";
import { editorStateToSchema, schemaToEditorState } from "@/utils/parameter-schema-editor";

const DEFAULT_PROPERTY = (): EditorProperty => ({
  id: crypto.randomUUID(),
  name: "",
  type: "string",
  description: "",
  required: false,
});

interface ParameterSchemaEditorProps {
  value: Record<string, unknown>;
  onChange: (schema: Record<string, unknown>) => void;
  className?: string;
}

export function ParameterSchemaEditor({ value, onChange, className }: ParameterSchemaEditorProps) {
  const state = useMemo(
    () => schemaToEditorState(value && Object.keys(value).length > 0 ? value : null),
    [value]
  );

  const emit = useCallback(
    (next: EditorState) => {
      const schema = editorStateToSchema(next);
      const hasContent =
        (schema.required as string[])?.length > 0 ||
        (schema.properties && Object.keys(schema.properties as object).length > 0);
      onChange(hasContent ? schema : EMPTY_SCHEMA);
    },
    [onChange]
  );

  const updateRootRequired = useCallback(
    (propName: string, required: boolean) => {
      const names = new Set(state.required);
      if (required) names.add(propName);
      else names.delete(propName);
      emit({ ...state, required: Array.from(names) });
    },
    [state, emit]
  );

  const addProperty = useCallback(() => {
    const next = DEFAULT_PROPERTY();
    emit({
      ...state,
      properties: [...state.properties, next],
    });
  }, [state, emit]);

  const updateProperty = useCallback(
    (index: number, patch: Partial<EditorProperty>) => {
      const list = [...state.properties];
      const prev = list[index];
      if (!prev) return;
      const updated = { ...prev, ...patch };
      list[index] = updated;
      if (patch.required !== undefined && prev.name.trim()) {
        const names = new Set(state.required);
        if (updated.required) names.add(updated.name.trim());
        else names.delete(updated.name.trim());
        emit({ ...state, properties: list, required: Array.from(names) });
      } else {
        emit({ ...state, properties: list });
      }
    },
    [state, emit]
  );

  const removeProperty = useCallback(
    (index: number) => {
      const list = state.properties.filter((_, i) => i !== index);
      const removed = state.properties[index];
      const names = new Set(state.required);
      if (removed?.name.trim()) names.delete(removed.name.trim());
      emit({ ...state, properties: list, required: Array.from(names) });
    },
    [state, emit]
  );

  return (
    <div className={cn("space-y-3", className)}>
      <div className="flex items-center justify-between gap-2">
        <Label className="text-sm">Parámetros del schema</Label>
        <Button type="button" variant="outline" size="sm" onClick={addProperty}>
          <PlusIcon className="w-4 h-4 mr-1" />
          Agregar parámetro
        </Button>
      </div>
      {state.properties.length === 0 ? (
        <p className="text-sm text-muted-foreground py-2">
          No hay parámetros. Añade uno con el botón anterior.
        </p>
      ) : (
        <ul className="space-y-3 max-h-[min(28rem,50vh)] overflow-y-auto pr-1">
          {state.properties.map((prop, index) => (
            <li key={prop.id}>
              <PropertyRow
                prop={prop}
                requiredSet={new Set(state.required)}
                onUpdate={(patch) => updateProperty(index, patch)}
                onRemove={() => removeProperty(index)}
                onRequiredChange={(req) => updateRootRequired(prop.name.trim() || prop.name, req)}
                depth={0}
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

interface PropertyRowProps {
  prop: EditorProperty;
  requiredSet: Set<string>;
  onUpdate: (patch: Partial<EditorProperty>) => void;
  onRemove: () => void;
  onRequiredChange: (required: boolean) => void;
  depth: number;
}

function PropertyRow({
  prop,
  requiredSet,
  onUpdate,
  onRemove,
  onRequiredChange,
  depth,
}: PropertyRowProps) {
  const isRoot = depth === 0;
  const required = isRoot ? requiredSet.has(prop.name.trim() || prop.name) : prop.required;

  const updateNested = useCallback(
    (properties: EditorProperty[]) => {
      onUpdate({ properties });
    },
    [onUpdate]
  );

  const updateItems = useCallback(
    (itemsType?: SchemaType, itemsProperties?: EditorProperty[]) => {
      onUpdate({ itemsType, itemsProperties });
    },
    [onUpdate]
  );

  return (
    <div
      className={cn(
        "rounded-lg border bg-muted/30 p-3 space-y-2",
        depth > 0 && "ml-4 pl-3 border-l-2 border-muted"
      )}
    >
      <div className="flex flex-wrap items-end gap-2">
        <div className="flex-1 min-w-[120px] space-y-1">
          <Label className="text-xs">Nombre</Label>
          <Input
            value={prop.name}
            onChange={(e) => onUpdate({ name: e.target.value })}
            placeholder="ej. name"
            className="h-8 text-sm"
          />
        </div>
        <div className="w-[130px] space-y-1">
          <Label className="text-xs">Tipo</Label>
          <Select
            value={prop.type}
            onValueChange={(v) => onUpdate({ type: v as SchemaType })}
          >
            <SelectTrigger className="h-8 text-sm" size="sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SCHEMA_TYPES.map((t) => (
                <SelectItem key={t} value={t}>
                  {t}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-1.5 text-xs cursor-pointer">
            <input
              type="checkbox"
              checked={required}
              onChange={(e) => {
                if (isRoot) onRequiredChange(e.target.checked);
                else onUpdate({ required: e.target.checked });
              }}
              className="rounded border-input"
            />
            Requerido
          </label>
        </div>
        <Button type="button" variant="ghost" size="icon" onClick={onRemove} aria-label="Eliminar">
          <Trash2Icon className="w-4 h-4 text-destructive" />
        </Button>
      </div>
      <div className="space-y-1">
        <Label className="text-xs">Descripción (opcional)</Label>
        <Input
          value={prop.description}
          onChange={(e) => onUpdate({ description: e.target.value })}
          placeholder="Descripción para el LLM"
          className="h-8 text-sm"
        />
      </div>
      {prop.type === "string" && (
        <EnumEditor enumValues={prop.enum ?? []} onChange={(enumValues) => onUpdate({ enum: enumValues })} />
      )}
      {prop.type === "object" && (
        <NestedProperties
          properties={prop.properties ?? []}
          onUpdate={updateNested}
          depth={depth + 1}
        />
      )}
      {prop.type === "array" && (
        <ArrayItemsEditor
          itemsType={prop.itemsType ?? "string"}
          itemsProperties={prop.itemsProperties ?? []}
          onUpdate={updateItems}
          depth={depth + 1}
        />
      )}
    </div>
  );
}

function EnumEditor({
  enumValues,
  onChange,
}: {
  enumValues: string[];
  onChange: (values: string[]) => void;
}) {
  const add = () => onChange([...enumValues, ""]);
  const remove = (i: number) => onChange(enumValues.filter((_, j) => j !== i));
  const update = (i: number, v: string) => {
    const next = [...enumValues];
    next[i] = v;
    onChange(next);
  };
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between gap-2">
        <Label className="text-xs">Valores fijos (enum)</Label>
        <Button type="button" variant="ghost" size="sm" onClick={add} className="h-7 text-xs">
          <PlusIcon className="w-3 h-3 mr-1" />
          Añadir valor
        </Button>
      </div>
      {enumValues.length === 0 ? (
        <p className="text-xs text-muted-foreground">Opcional. Añade valores para restringir opciones.</p>
      ) : (
        <ul className="space-y-1">
          {enumValues.map((v, i) => (
            <li key={i} className="flex gap-2">
              <Input
                value={v}
                onChange={(e) => update(i, e.target.value)}
                placeholder="valor"
                className="h-8 text-sm flex-1"
              />
              <Button type="button" variant="ghost" size="icon" onClick={() => remove(i)} aria-label="Quitar">
                <Trash2Icon className="w-4 h-4 text-destructive" />
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function NestedProperties({
  properties,
  onUpdate,
  depth,
}: {
  properties: EditorProperty[];
  onUpdate: (properties: EditorProperty[]) => void;
  depth: number;
}) {
  const add = () => {
    const next = DEFAULT_PROPERTY();
    onUpdate([...properties, next]);
  };
  const remove = (index: number) => {
    onUpdate(properties.filter((_, i) => i !== index));
  };
  const update = (index: number, patch: Partial<EditorProperty>) => {
    const list = [...properties];
    const prev = list[index];
    if (!prev) return;
    list[index] = { ...prev, ...patch };
    onUpdate(list);
  };
  return (
    <div className="space-y-2 mt-2">
      <div className="flex items-center justify-between gap-2">
        <Label className="text-xs">Propiedades del objeto</Label>
        <Button type="button" variant="outline" size="sm" onClick={add} className="h-7 text-xs">
          <PlusIcon className="w-3 h-3 mr-1" />
          Agregar propiedad
        </Button>
      </div>
      <ul className="space-y-2">
        {properties.map((p, i) => (
          <li key={p.id}>
            <PropertyRow
              prop={p}
              requiredSet={new Set()}
              onUpdate={(patch) => update(i, patch)}
              onRemove={() => remove(i)}
              onRequiredChange={() => {}}
              depth={depth}
            />
          </li>
        ))}
      </ul>
    </div>
  );
}

function ArrayItemsEditor({
  itemsType,
  itemsProperties,
  onUpdate,
  depth,
}: {
  itemsType: SchemaType;
  itemsProperties: EditorProperty[];
  onUpdate: (itemsType?: SchemaType, itemsProperties?: EditorProperty[]) => void;
  depth: number;
}) {
  const setItemsType = (t: SchemaType) => {
    if (t === "object") {
      onUpdate(t, itemsProperties.length ? itemsProperties : [DEFAULT_PROPERTY()]);
    } else {
      onUpdate(t, undefined);
    }
  };
  return (
    <div className="space-y-2 mt-2">
      <div className="space-y-1">
        <Label className="text-xs">Tipo de elementos del array</Label>
        <Select value={itemsType} onValueChange={(v) => setItemsType(v as SchemaType)}>
          <SelectTrigger className="h-8 text-sm w-[140px]" size="sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {SCHEMA_TYPES.map((t) => (
              <SelectItem key={t} value={t}>
                {t}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {itemsType === "object" && (
        <NestedProperties
          properties={itemsProperties}
          onUpdate={(props) => onUpdate("object", props)}
          depth={depth}
        />
      )}
    </div>
  );
}
