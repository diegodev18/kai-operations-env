"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  ArrowDownIcon,
  ArrowUpIcon,
  ChevronLeftIcon,
  Loader2Icon,
  PlusIcon,
  Trash2Icon,
} from "lucide-react";

import { DatabaseOperationsChrome } from "@/components/database/database-operations-chrome";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useAuth, useDynamicTableSchemaDetail, useUserRole } from "@/hooks";
import { useEnvironment } from "@/contexts/EnvironmentContext";
import {
  deleteDynamicTableSchema,
  patchDynamicTableSchema,
} from "@/services/dynamic-table-schemas-api";
import {
  DYNAMIC_TABLE_FIELD_TYPES,
  type DynamicTableField,
  type DynamicTableFieldType,
} from "@/types/dynamic-table-schema";

type EditorFieldRow = { stableId: string; field: DynamicTableField };

function newEditorFieldRowId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `f_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
}

function fieldsToEditorRows(fields: DynamicTableField[]): EditorFieldRow[] {
  return fields.map((field) => ({ stableId: newEditorFieldRowId(), field }));
}

function editorRowsToFields(rows: EditorFieldRow[]): DynamicTableField[] {
  return rows.map((r) => r.field);
}

function fieldWithType(prev: DynamicTableField, type: DynamicTableFieldType): DynamicTableField {
  const key = prev.key;
  const label = prev.label;
  const sortable = "sortable" in prev && prev.sortable ? { sortable: true } : {};
  const filterable = "filterable" in prev && prev.filterable ? { filterable: true } : {};
  const common = { ...sortable, ...filterable };
  switch (type) {
    case "string":
      return { key, label, type: "string", ...common };
    case "number":
      return { key, label, type: "number", ...common };
    case "email":
      return { key, label, type: "email", ...common };
    case "timestamp":
      return { key, label, type: "timestamp", ...common };
    case "enum":
      return {
        key,
        label,
        type: "enum",
        options: prev.type === "enum" ? prev.options : [{ value: "pending", label: "Pendiente" }],
        ...common,
      };
    case "reference":
      return {
        key,
        label,
        type: "reference",
        reference:
          prev.type === "reference"
            ? prev.reference
            : { targetCollection: "collaborators", labelFields: ["name"] },
        ...common,
      };
    default:
      return { key, label, type: "string", ...common };
  }
}

export default function DynamicTableSchemaEditorPage() {
  const params = useParams();
  const router = useRouter();
  const rawId = params.schemaId;
  const schemaId = typeof rawId === "string" ? decodeURIComponent(rawId) : "";

  const { session, signOut } = useAuth();
  const { isAdmin } = useUserRole();
  const { environment, setEnvironment, allowedEnvironments } = useEnvironment();
  const { schema, isLoading, error, refetch, setSchema } = useDynamicTableSchemaDetail(
    schemaId || null,
    environment,
  );

  const [label, setLabel] = useState("");
  const [description, setDescription] = useState("");
  const [version, setVersion] = useState(1);
  const [targetCollection, setTargetCollection] = useState("");
  const [fieldRows, setFieldRows] = useState<EditorFieldRow[]>([]);
  const [jsonText, setJsonText] = useState("");
  const [saving, setSaving] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [panel, setPanel] = useState<"form" | "json">("form");

  const envOptions = allowedEnvironments.length > 0 ? allowedEnvironments : (["testing", "production"] as const);

  useEffect(() => {
    if (!schema) return;
    queueMicrotask(() => {
      setLabel(schema.label);
      setDescription(schema.description ?? "");
      setVersion(schema.version);
      setTargetCollection(schema.targetCollection);
      setFieldRows(fieldsToEditorRows(schema.fields));
      setJsonText(JSON.stringify({ ...schema, createdAt: undefined, updatedAt: undefined }, null, 2));
    });
  }, [schema]);

  const payloadFromForm = useMemo(
    () => ({
      label: label.trim(),
      description: description.trim() || undefined,
      version,
      targetCollection: targetCollection.trim(),
      fields: editorRowsToFields(fieldRows),
    }),
    [label, description, version, targetCollection, fieldRows],
  );

  const handleSave = async () => {
    if (!schemaId) return;
    if (!payloadFromForm.label || !payloadFromForm.targetCollection) {
      toast.error("Etiqueta y colección destino son obligatorias");
      return;
    }
    setSaving(true);
    const result = await patchDynamicTableSchema(environment, schemaId, payloadFromForm);
    setSaving(false);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success("Guardado");
    setSchema(result.schema);
    void refetch();
  };

  const applyJson = async () => {
    if (!schemaId) return;
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(jsonText) as Record<string, unknown>;
    } catch {
      toast.error("JSON inválido");
      return;
    }
    const body: Parameters<typeof patchDynamicTableSchema>[2] = {};
    if (typeof parsed.label === "string") body.label = parsed.label;
    if (parsed.description === null) body.description = undefined;
    else if (typeof parsed.description === "string") body.description = parsed.description;
    if (typeof parsed.version === "number") body.version = parsed.version;
    if (typeof parsed.targetCollection === "string") body.targetCollection = parsed.targetCollection;
    if (Array.isArray(parsed.fields)) body.fields = parsed.fields as DynamicTableField[];
    if (Object.keys(body).length === 0) {
      toast.error("El JSON no contiene campos reconocidos para actualizar");
      return;
    }
    setSaving(true);
    const result = await patchDynamicTableSchema(environment, schemaId, body);
    setSaving(false);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success("JSON aplicado");
    setSchema(result.schema);
    void refetch();
  };

  const handleDelete = async () => {
    if (!schemaId) return;
    setDeleting(true);
    const result = await deleteDynamicTableSchema(environment, schemaId);
    setDeleting(false);
    setDeleteOpen(false);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success("Eliminado");
    router.push("/dynamic-tables");
  };

  const addField = useCallback(() => {
    setFieldRows((prev) => [
      ...prev,
      {
        stableId: newEditorFieldRowId(),
        field: { key: `field_${prev.length + 1}`, label: "Nuevo campo", type: "string" },
      },
    ]);
  }, []);

  const removeField = useCallback((index: number) => {
    setFieldRows((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const moveField = useCallback((index: number, dir: -1 | 1) => {
    setFieldRows((prev) => {
      const j = index + dir;
      if (j < 0 || j >= prev.length) return prev;
      const next = [...prev];
      const t = next[index];
      next[index] = next[j];
      next[j] = t;
      return next;
    });
  }, []);

  const updateField = useCallback((index: number, next: DynamicTableField) => {
    setFieldRows((prev) =>
      prev.map((row, i) => (i === index ? { ...row, field: next } : row)),
    );
  }, []);

  if (!isAdmin) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center">
        <p className="text-muted-foreground">No tienes acceso a esta página.</p>
      </div>
    );
  }

  return (
    <DatabaseOperationsChrome
      breadcrumbLast="Tablas dinámicas"
      userName={session?.user?.name}
      userEmail={session?.user?.email}
      userImage={(session?.user as { image?: string | null })?.image}
      onSignOut={() => void signOut()}
    >
      <main className="mx-auto w-full max-w-4xl flex-1 space-y-6 p-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <Button type="button" variant="ghost" size="icon" asChild>
              <Link href="/dynamic-tables" aria-label="Volver al listado">
                <ChevronLeftIcon className="size-5" />
              </Link>
            </Button>
            <div>
              <h1 className="text-2xl font-semibold tracking-tight">
                {schema?.label ?? (schemaId || "Esquema")}
              </h1>
              <p className="text-sm text-muted-foreground">
                <code className="text-xs">{schemaId}</code>
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Select value={environment} onValueChange={(v) => setEnvironment(v as typeof environment)}>
              <SelectTrigger className="w-[140px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {envOptions.map((env) => (
                  <SelectItem key={env} value={env}>
                    {env === "production" ? "Production" : "Testing"}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button type="button" variant="destructive" onClick={() => setDeleteOpen(true)}>
              Eliminar
            </Button>
            <Button type="button" disabled={saving || isLoading} onClick={() => void handleSave()}>
              {saving ? <Loader2Icon className="size-4 animate-spin" /> : "Guardar"}
            </Button>
          </div>
        </div>

        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        {isLoading && !schema ? (
          <div className="flex items-center gap-2 text-muted-foreground">
            <Loader2Icon className="size-5 animate-spin" />
            Cargando…
          </div>
        ) : !schema && !isLoading ? (
          <p className="text-muted-foreground">No se encontró el esquema.</p>
        ) : (
          <>
            <div className="flex gap-1 border-b pb-2">
              <Button
                type="button"
                variant={panel === "form" ? "secondary" : "ghost"}
                size="sm"
                onClick={() => setPanel("form")}
              >
                Formulario
              </Button>
              <Button
                type="button"
                variant={panel === "json" ? "secondary" : "ghost"}
                size="sm"
                onClick={() => setPanel("json")}
              >
                JSON avanzado
              </Button>
            </div>
            {panel === "form" ? (
            <div className="space-y-6 pt-4">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Metadatos</CardTitle>
                  <CardDescription>schemaId es fijo: {schemaId}</CardDescription>
                </CardHeader>
                <CardContent className="grid gap-4 sm:grid-cols-2">
                  <div className="grid gap-1 sm:col-span-2">
                    <Label htmlFor="lbl">Etiqueta</Label>
                    <Input id="lbl" value={label} onChange={(e) => setLabel(e.target.value)} />
                  </div>
                  <div className="grid gap-1 sm:col-span-2">
                    <Label htmlFor="desc">Descripción</Label>
                    <Input
                      id="desc"
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      placeholder="Opcional"
                    />
                  </div>
                  <div className="grid gap-1">
                    <Label htmlFor="ver">Versión</Label>
                    <Input
                      id="ver"
                      type="number"
                      min={1}
                      value={version}
                      onChange={(e) => setVersion(Math.max(1, Number(e.target.value) || 1))}
                    />
                  </div>
                  <div className="grid gap-1">
                    <Label htmlFor="tgt">Colección destino</Label>
                    <Input id="tgt" value={targetCollection} onChange={(e) => setTargetCollection(e.target.value)} />
                  </div>
                </CardContent>
              </Card>

              <div className="flex items-center justify-between">
                <h2 className="text-lg font-medium">Campos</h2>
                <Button type="button" variant="outline" size="sm" className="gap-1" onClick={addField}>
                  <PlusIcon className="size-4" />
                  Añadir campo
                </Button>
              </div>

              <div className="space-y-4">
                {fieldRows.map((row, index) => (
                  <FieldEditorCard
                    key={row.stableId}
                    field={row.field}
                    index={index}
                    total={fieldRows.length}
                    onChange={(f) => updateField(index, f)}
                    onRemove={() => removeField(index)}
                    onMove={(dir) => moveField(index, dir)}
                    onTypeChange={(t) => updateField(index, fieldWithType(row.field, t))}
                  />
                ))}
              </div>
            </div>
          ) : (
            <div className="space-y-4 pt-4">
              <p className="text-sm text-muted-foreground">
                Pega o edita el documento (sin <code className="text-xs">createdAt</code> /{" "}
                <code className="text-xs">updatedAt</code>); se envía como PATCH parcial.
              </p>
              <Textarea
                className="min-h-[320px] font-mono text-sm"
                value={jsonText}
                onChange={(e) => setJsonText(e.target.value)}
              />
              <Button type="button" variant="secondary" disabled={saving} onClick={() => void applyJson()}>
                Aplicar JSON
              </Button>
            </div>
            )}
          </>
        )}

        <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>¿Eliminar este esquema?</AlertDialogTitle>
              <AlertDialogDescription>
                Se eliminará <code className="text-xs">{schemaId}</code> de Firestore.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={deleting}>Cancelar</AlertDialogCancel>
              <AlertDialogAction
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                disabled={deleting}
                onClick={(e) => {
                  e.preventDefault();
                  void handleDelete();
                }}
              >
                {deleting ? "Eliminando…" : "Eliminar"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </main>
    </DatabaseOperationsChrome>
  );
}

type FieldEditorCardProps = {
  field: DynamicTableField;
  index: number;
  total: number;
  onChange: (f: DynamicTableField) => void;
  onRemove: () => void;
  onMove: (dir: -1 | 1) => void;
  onTypeChange: (t: DynamicTableFieldType) => void;
};

function FieldEditorCard(props: FieldEditorCardProps) {
  const { field, index, total, onChange, onRemove, onMove, onTypeChange } = props;

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">Campo {index + 1}</CardTitle>
        <div className="flex flex-wrap gap-1">
          <Button type="button" variant="ghost" size="icon" disabled={index === 0} onClick={() => onMove(-1)}>
            <ArrowUpIcon className="size-4" />
          </Button>
          <Button type="button" variant="ghost" size="icon" disabled={index >= total - 1} onClick={() => onMove(1)}>
            <ArrowDownIcon className="size-4" />
          </Button>
          <Button type="button" variant="ghost" size="icon" onClick={onRemove}>
            <Trash2Icon className="size-4 text-destructive" />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="grid gap-3 sm:grid-cols-2">
        <div className="grid gap-1">
          <Label>key</Label>
          <Input
            value={field.key}
            onChange={(e) => onChange({ ...field, key: e.target.value } as DynamicTableField)}
          />
        </div>
        <div className="grid gap-1">
          <Label>Etiqueta</Label>
          <Input
            value={field.label}
            onChange={(e) => onChange({ ...field, label: e.target.value } as DynamicTableField)}
          />
        </div>
        <div className="grid gap-1">
          <Label>Tipo</Label>
          <Select value={field.type} onValueChange={(v) => onTypeChange(v as DynamicTableFieldType)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {DYNAMIC_TABLE_FIELD_TYPES.map((t) => (
                <SelectItem key={t} value={t}>
                  {t}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-wrap items-center gap-4 pt-6">
          <label className="flex items-center gap-2 text-sm">
            <Checkbox
              checked={Boolean("sortable" in field && field.sortable)}
              onCheckedChange={(c) =>
                onChange({ ...field, sortable: c === true } as DynamicTableField)
              }
            />
            Ordenable
          </label>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox
              checked={Boolean("filterable" in field && field.filterable)}
              onCheckedChange={(c) =>
                onChange({ ...field, filterable: c === true } as DynamicTableField)
              }
            />
            Filtrable
          </label>
        </div>

        {field.type === "enum" ? (
          <div className="sm:col-span-2 space-y-2">
            <Label>Opciones</Label>
            {field.options.map((opt, oi) => (
              <div key={oi} className="flex flex-wrap gap-2">
                <Input
                  className="max-w-[140px]"
                  placeholder="value"
                  value={opt.value}
                  onChange={(e) => {
                    const options = field.options.map((o, j) =>
                      j === oi ? { ...o, value: e.target.value } : o,
                    );
                    onChange({ ...field, options });
                  }}
                />
                <Input
                  className="max-w-[160px]"
                  placeholder="label"
                  value={opt.label}
                  onChange={(e) => {
                    const options = field.options.map((o, j) =>
                      j === oi ? { ...o, label: e.target.value } : o,
                    );
                    onChange({ ...field, options });
                  }}
                />
                <Input
                  className="max-w-[120px]"
                  placeholder="#hex color"
                  value={opt.color ?? ""}
                  onChange={(e) => {
                    const options = field.options.map((o, j) =>
                      j === oi ? { ...o, color: e.target.value || undefined } : o,
                    );
                    onChange({ ...field, options });
                  }}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() =>
                    onChange({
                      ...field,
                      options: field.options.filter((_, j) => j !== oi),
                    })
                  }
                >
                  Quitar
                </Button>
              </div>
            ))}
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() =>
                onChange({
                  ...field,
                  options: [...field.options, { value: "new", label: "Nuevo" }],
                })
              }
            >
              Añadir opción
            </Button>
          </div>
        ) : null}

        {field.type === "reference" ? (
          <div className="sm:col-span-2 grid gap-2">
            <div className="grid gap-1">
              <Label>Colección referenciada</Label>
              <Input
                value={field.reference.targetCollection}
                onChange={(e) =>
                  onChange({
                    ...field,
                    reference: { ...field.reference, targetCollection: e.target.value },
                  })
                }
              />
            </div>
            <div className="grid gap-1">
              <Label>labelFields (coma)</Label>
              <Input
                value={field.reference.labelFields.join(", ")}
                onChange={(e) =>
                  onChange({
                    ...field,
                    reference: {
                      ...field.reference,
                      labelFields: e.target.value
                        .split(",")
                        .map((s) => s.trim())
                        .filter(Boolean),
                    },
                  })
                }
              />
            </div>
            <div className="grid gap-1">
              <Label>labelTemplate (opcional)</Label>
              <Input
                placeholder="{name} — {phone}"
                value={field.reference.labelTemplate ?? ""}
                onChange={(e) =>
                  onChange({
                    ...field,
                    reference: {
                      ...field.reference,
                      labelTemplate: e.target.value.trim() || undefined,
                    },
                  })
                }
              />
            </div>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
