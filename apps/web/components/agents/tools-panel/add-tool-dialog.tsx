"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2Icon, WrenchIcon } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { ParameterSchemaEditor } from "@/components/agents/parameter-schema-editor";
import { ToolsCatalogSearchList } from "@/components/agents/tools-catalog-search-list";
import { createAgentTool, useToolsCatalog } from "@/hooks";
import { parametersSchemaForApi } from "@/utils/parameter-schema-editor";
import type { AgentToolType, CreateAgentToolBody } from "@/types";

import { AgentPropertiesByToolSchemaForm } from "./agent-properties-form";
import { DialogSection } from "./dialog-section";
import {
  fetchAgentPropertiesMap,
  getDocSchemasFromToolSchema,
  patchAgentPropertyDocLocal,
} from "./helpers";
import { TOOL_TYPE_OPTIONS, type JsonRecord } from "./types";

export function AddToolDialog({
  agentId,
  open,
  onOpenChange,
  onSuccess,
}: {
  agentId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [type, setType] = useState<AgentToolType>("custom");
  const [parameters, setParameters] = useState<Record<string, unknown>>({});
  const [toolPropertiesSchema, setToolPropertiesSchema] = useState<Record<
    string,
    unknown
  > | null>(null);
  const [agentPropertiesValues, setAgentPropertiesValues] = useState<
    Record<string, JsonRecord>
  >({});
  const [loadingAgentProperties, setLoadingAgentProperties] = useState(false);
  const [saving, setSaving] = useState(false);
  const { tools: catalogTools, isLoading: catalogLoading } = useToolsCatalog();
  const [displayName, setDisplayName] = useState("");
  const [path, setPath] = useState("");

  const selectCatalogTool = useCallback(
    (tool: {
      name: string;
      description: string;
      displayName?: string;
      parameters?: Record<string, unknown>;
      properties?: Record<string, unknown>;
      path?: string;
    }) => {
      setName(tool.name);
      setDescription(tool.description);
      setDisplayName(tool.displayName ?? "");
      setPath(tool.path ?? "");
      setParameters(
        tool.parameters && typeof tool.parameters === "object"
          ? (tool.parameters as Record<string, unknown>)
          : {},
      );
      setToolPropertiesSchema(
        tool.properties && typeof tool.properties === "object"
          ? (tool.properties as Record<string, unknown>)
          : null,
      );
    },
    [],
  );

  const propertyDocSchemas = useMemo(
    () =>
      type === "default"
        ? getDocSchemasFromToolSchema(toolPropertiesSchema)
        : {},
    [toolPropertiesSchema, type],
  );

  useEffect(() => {
    if (!open) return;
    const docIds = Object.keys(propertyDocSchemas);
    if (docIds.length === 0) {
      setAgentPropertiesValues({});
      return;
    }
    let cancelled = false;
    setLoadingAgentProperties(true);
    void fetchAgentPropertiesMap(agentId)
      .then((current) => {
        if (cancelled) return;
        const next: Record<string, JsonRecord> = {};
        for (const docId of docIds) {
          const value = current?.[docId];
          next[docId] =
            value && typeof value === "object" && !Array.isArray(value)
              ? (value as JsonRecord)
              : {};
        }
        setAgentPropertiesValues(next);
      })
      .finally(() => {
        if (!cancelled) setLoadingAgentProperties(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, agentId, propertyDocSchemas]);

  const handleSubmit = useCallback(async () => {
    if (!name.trim()) {
      toast.error("El nombre es obligatorio");
      return;
    }
    if (!description.trim()) {
      toast.error("La descripción es obligatoria");
      return;
    }
    setSaving(true);
    try {
      const body: CreateAgentToolBody = {
        name: name.trim(),
        description: description.trim(),
        type,
      };
      const paramsForApi = parametersSchemaForApi(parameters);
      if (paramsForApi) body.parameters = paramsForApi;
      if (displayName.trim()) body.displayName = displayName.trim();
      if (path.trim()) body.path = path.trim();
      const created = await createAgentTool(agentId, body);
      if (created) {
        const docsToSave = Object.keys(propertyDocSchemas);
        if (docsToSave.length > 0) {
          for (const docId of docsToSave) {
            const ok = await patchAgentPropertyDocLocal(
              agentId,
              docId,
              agentPropertiesValues[docId] ?? {},
            );
            if (!ok) {
              toast.error(`No se pudo guardar la propiedad "${docId}"`);
              break;
            }
          }
        }
        toast.success("Tool creada");
        setName("");
        setDescription("");
        setDisplayName("");
        setPath("");
        setParameters({});
        setToolPropertiesSchema(null);
        setAgentPropertiesValues({});
        setType("custom");
        onSuccess();
      }
    } finally {
      setSaving(false);
    }
  }, [
    agentId,
    name,
    description,
    type,
    displayName,
    path,
    parameters,
    propertyDocSchemas,
    agentPropertiesValues,
    onSuccess,
  ]);

  const showPath = type === "default" || type === "preset";
  const hasPropertyDocs = Object.keys(propertyDocSchemas).length > 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="flex max-h-[90vh] w-[min(42rem,calc(100vw-2rem))] max-w-[42rem] flex-col overflow-hidden"
        showClose
      >
        <DialogHeader className="shrink-0">
          <DialogTitle className="flex items-center gap-2">
            <WrenchIcon className="size-4 text-muted-foreground" />
            Agregar tool
          </DialogTitle>
          <DialogDescription>
            Agrega una nueva tool al agente desde el catálogo o crea una
            personalizada.
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 space-y-5 overflow-y-auto overflow-x-hidden py-2 pr-1">
          <DialogSection
            title="Identificación"
            description="Define cómo se identifica la tool y de dónde proviene."
          >
            <div className="space-y-2">
              <Label htmlFor="add-tool-type">Tipo</Label>
              <Select
                value={type}
                onValueChange={(nextType: AgentToolType) => {
                  setType(nextType);
                  if (nextType !== "default") {
                    setToolPropertiesSchema(null);
                    setAgentPropertiesValues({});
                  }
                }}
              >
                <SelectTrigger id="add-tool-type" className="w-full">
                  <SelectValue placeholder="Selecciona un tipo" />
                </SelectTrigger>
                <SelectContent>
                  {TOOL_TYPE_OPTIONS.map((t) => (
                    <SelectItem key={t.value} value={t.value}>
                      {t.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label
                htmlFor={
                  type === "default" ? "add-tool-catalog-search" : "add-tool-name"
                }
              >
                Nombre
                {type === "default" ? " (buscar en catálogo)" : null}
              </Label>
              {type === "default" ? (
                <div className="space-y-1.5">
                  <p className="text-xs text-muted-foreground">
                    Elige una tool del catálogo para rellenar nombre, descripción
                    y parámetros; podrás editarlos después.
                  </p>
                  <ToolsCatalogSearchList
                    tools={catalogTools}
                    loading={catalogLoading}
                    maxItems={20}
                    value={name}
                    onValueChange={(next) => {
                      setName(next);
                      setToolPropertiesSchema(null);
                      setAgentPropertiesValues({});
                    }}
                    onSelect={(tool) =>
                      selectCatalogTool({
                        name: tool.name,
                        description: tool.description,
                        displayName: tool.displayName,
                        parameters: tool.parameters,
                        properties: tool.properties,
                        path: tool.path,
                      })
                    }
                    placeholder="Escribe para buscar (ej. kai_interest)"
                  />
                </div>
              ) : (
                <Input
                  id="add-tool-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="ej. kai_database_register_new_client"
                />
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="add-tool-display-name">
                Nombre para mostrar (opcional)
              </Label>
              <Input
                id="add-tool-display-name"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Ej. Ask For Knowledge Base"
              />
            </div>

            {showPath ? (
              <div className="space-y-2">
                <Label htmlFor="add-tool-path">Path</Label>
                <p className="text-xs text-muted-foreground">
                  Ruta para resolver el módulo (ej.{" "}
                  <code className="rounded bg-muted px-1">
                    kai/interest/register_interest_in_buying
                  </code>
                  ). Se rellena al elegir del catálogo; si falta, se deriva del
                  nombre.
                </p>
                <Input
                  id="add-tool-path"
                  value={path}
                  onChange={(e) => setPath(e.target.value)}
                  placeholder="kai/category/tool_name"
                />
              </div>
            ) : null}
          </DialogSection>

          <DialogSection
            title="Descripción"
            description="Lo que el LLM verá para decidir cuándo invocar esta tool."
          >
            <div className="space-y-2">
              <Label htmlFor="add-tool-description" className="sr-only">
                Descripción
              </Label>
              <Textarea
                id="add-tool-description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Descripción para el LLM"
                rows={3}
              />
            </div>
          </DialogSection>

          <DialogSection
            title="Parámetros"
            description="Schema JSON que define qué argumentos puede pasar el LLM."
            isLast={!hasPropertyDocs}
          >
            <div className="min-w-0">
              <ParameterSchemaEditor
                value={parameters}
                onChange={setParameters}
              />
            </div>
          </DialogSection>

          {hasPropertyDocs ? (
            <DialogSection
              title="Propiedades del agente"
              description="Configura los valores que esta tool necesita en las propiedades del agente."
              isLast
            >
              <AgentPropertiesByToolSchemaForm
                title="Documentos requeridos"
                description="Valores definidos según el schema declarado en toolsCatalog."
                docSchemas={propertyDocSchemas}
                values={agentPropertiesValues}
                onChange={setAgentPropertiesValues}
                isLoading={loadingAgentProperties}
              />
            </DialogSection>
          ) : null}
        </div>

        <DialogFooter className="shrink-0 border-t pt-4">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={handleSubmit} disabled={saving}>
            {saving ? (
              <Loader2Icon className="mr-2 size-4 animate-spin" />
            ) : (
              <WrenchIcon className="mr-2 size-4" />
            )}
            Crear tool
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
