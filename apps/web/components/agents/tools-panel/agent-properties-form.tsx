"use client";

import { useCallback } from "react";
import { Loader2Icon } from "lucide-react";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";

import {
  getNestedValue,
  getObjectProperties,
  getSchemaDescription,
  getSchemaType,
  setNestedValue,
} from "./helpers";
import type { JsonRecord } from "./types";

export function AgentPropertiesByToolSchemaForm({
  title,
  description,
  docSchemas,
  values,
  onChange,
  isLoading,
}: {
  title: string;
  description: string;
  docSchemas: Record<string, JsonRecord>;
  values: Record<string, JsonRecord>;
  onChange: (next: Record<string, JsonRecord>) => void;
  isLoading: boolean;
}) {
  const setDocValue = useCallback(
    (docId: string, path: string[], value: unknown) => {
      const currentDoc = values[docId] ?? {};
      const nextDoc = setNestedValue(currentDoc, path, value);
      onChange({ ...values, [docId]: nextDoc });
    },
    [values, onChange],
  );

  return (
    <div className="space-y-3 rounded-lg border bg-muted/20 p-4">
      <div className="space-y-1">
        <Label className="text-sm">{title}</Label>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
      {isLoading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2Icon className="h-4 w-4 animate-spin" />
          Cargando propiedades actuales del agente...
        </div>
      ) : (
        <div className="space-y-4">
          {Object.entries(docSchemas).map(([docId, schema]) => (
            <div
              key={docId}
              className="space-y-2 rounded-md border bg-background p-3"
            >
              <p className="text-sm font-medium">{docId}</p>
              <SchemaObjectFields
                schema={schema}
                docId={docId}
                docValue={values[docId] ?? {}}
                pathPrefix={[]}
                onValueChange={setDocValue}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function SchemaObjectFields({
  schema,
  docId,
  docValue,
  pathPrefix,
  onValueChange,
}: {
  schema: JsonRecord;
  docId: string;
  docValue: JsonRecord;
  pathPrefix: string[];
  onValueChange: (docId: string, path: string[], value: unknown) => void;
}) {
  const properties = getObjectProperties(schema);
  const entries = Object.entries(properties);
  if (entries.length === 0) {
    return (
      <p className="text-xs text-muted-foreground">Sin campos configurables.</p>
    );
  }

  return (
    <div className="space-y-3">
      {entries.map(([fieldName, fieldSchema]) => {
        const fieldType = getSchemaType(fieldSchema);
        const desc = getSchemaDescription(fieldSchema);
        const path = [...pathPrefix, fieldName];
        const current = getNestedValue(docValue, path);

        if (fieldType === "object") {
          const nestedSchema =
            fieldSchema &&
            typeof fieldSchema === "object" &&
            !Array.isArray(fieldSchema)
              ? (fieldSchema as JsonRecord)
              : { type: "object", properties: {} };
          return (
            <div
              key={path.join(".")}
              className="space-y-2 rounded-md border p-2"
            >
              <p className="text-xs font-medium">{path.join(".")}</p>
              {desc ? (
                <p className="text-xs text-muted-foreground">{desc}</p>
              ) : null}
              <SchemaObjectFields
                schema={nestedSchema}
                docId={docId}
                docValue={docValue}
                pathPrefix={path}
                onValueChange={onValueChange}
              />
            </div>
          );
        }

        return (
          <div key={path.join(".")} className="space-y-1.5">
            <Label className="text-xs">{path.join(".")}</Label>
            {desc ? (
              <p className="text-xs text-muted-foreground">{desc}</p>
            ) : null}
            {fieldType === "boolean" ? (
              <div className="flex items-center gap-2">
                <Switch
                  checked={Boolean(current)}
                  onCheckedChange={(checked) =>
                    onValueChange(docId, path, checked)
                  }
                  aria-label={`Activar ${path.join(".")}`}
                />
                <span className="text-sm text-muted-foreground">
                  {current ? "Activado" : "Desactivado"}
                </span>
              </div>
            ) : fieldType === "number" ? (
              <Input
                type="number"
                value={
                  typeof current === "number"
                    ? current
                    : current == null
                      ? ""
                      : String(current)
                }
                onChange={(e) => {
                  const next = e.target.value.trim();
                  onValueChange(docId, path, next === "" ? null : Number(next));
                }}
              />
            ) : (
              <Input
                value={
                  typeof current === "string"
                    ? current
                    : current == null
                      ? ""
                      : String(current)
                }
                onChange={(e) => onValueChange(docId, path, e.target.value)}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
