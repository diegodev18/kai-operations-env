"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2Icon, PencilIcon, RefreshCwIcon } from "lucide-react";
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
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { ParameterSchemaEditor } from "@/components/agents/parameter-schema-editor";
import { SyncFromCatalogDialog } from "@/components/agents/sync-from-catalog-dialog";
import { updateAgentTool, useToolsCatalog } from "@/hooks";
import { parametersSchemaForApi } from "@/utils/parameter-schema-editor";
import type { AgentTool, AgentToolType } from "@/types";

import { AgentPropertiesByToolSchemaForm } from "./agent-properties-form";
import { DialogSection } from "./dialog-section";
import {
  fetchAgentPropertiesMap,
  getDocSchemasFromToolSchema,
  patchAgentPropertyDocLocal,
} from "./helpers";
import { TOOL_TYPE_OPTIONS, type JsonRecord } from "./types";

export function EditToolDialog({
  agentId,
  tool,
  open,
  onOpenChange,
  onSuccess,
}: {
  agentId: string;
  tool: AgentTool;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}) {
  const { tools: catalogTools } = useToolsCatalog();
  const [name, setName] = useState(tool.name);
  const [displayName, setDisplayName] = useState(tool.displayName ?? "");
  const [description, setDescription] = useState(tool.description);
  const [type, setType] = useState<AgentToolType>(tool.type);
  const [path, setPath] = useState(tool.path ?? "");
  const [parameters, setParameters] = useState<Record<string, unknown>>(() =>
    tool.parameters && typeof tool.parameters === "object"
      ? (tool.parameters as Record<string, unknown>)
      : {},
  );
  const [agentPropertiesValues, setAgentPropertiesValues] = useState<
    Record<string, JsonRecord>
  >({});
  const [loadingAgentProperties, setLoadingAgentProperties] = useState(false);
  const [saving, setSaving] = useState(false);
  const [syncDialogOpen, setSyncDialogOpen] = useState(false);

  const catalogTool = useMemo(
    () =>
      catalogTools.find(
        (item) =>
          (path.trim() && item.path === path.trim()) ||
          item.name === name.trim(),
      ),
    [catalogTools, path, name],
  );
  const propertyDocSchemas = useMemo(
    () =>
      type === "default"
        ? getDocSchemasFromToolSchema(catalogTool?.properties)
        : {},
    [catalogTool?.properties, type],
  );

  useEffect(() => {
    if (tool) {
      setName(tool.name);
      setDisplayName(tool.displayName ?? "");
      setDescription(tool.description);
      setType(tool.type);
      setPath(tool.path ?? "");
      setParameters(
        tool.parameters && typeof tool.parameters === "object"
          ? (tool.parameters as Record<string, unknown>)
          : {},
      );
      setAgentPropertiesValues({});
    }
  }, [tool]);

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
      const updated = await updateAgentTool(agentId, tool.id, {
        name: name.trim(),
        description: description.trim(),
        type,
        parameters: parametersSchemaForApi(parameters) ?? null,
        displayName: displayName.trim() || null,
        path: path.trim() || null,
      });
      if (updated) {
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
        toast.success("Tool actualizada");
        onSuccess();
      }
    } finally {
      setSaving(false);
    }
  }, [
    agentId,
    tool.id,
    name,
    description,
    type,
    path,
    parameters,
    propertyDocSchemas,
    agentPropertiesValues,
    displayName,
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
            <PencilIcon className="size-4 text-muted-foreground" />
            Editar tool
          </DialogTitle>
          <DialogDescription>
            Edita la configuración de la tool del agente.
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 space-y-5 overflow-y-auto overflow-x-hidden py-2 pr-1">
          <DialogSection
            title="Identificación"
            description="Cómo se identifica la tool y de dónde proviene."
          >
            <div className="space-y-2">
              <Label htmlFor="edit-tool-type">Tipo</Label>
              <Select
                value={type}
                onValueChange={(nextType: AgentToolType) => setType(nextType)}
              >
                <SelectTrigger id="edit-tool-type" className="w-full">
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
              <Label htmlFor="edit-tool-name">Nombre</Label>
              <Input
                id="edit-tool-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="edit-tool-display-name">
                Nombre para mostrar (opcional)
              </Label>
              <Input
                id="edit-tool-display-name"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Ej. Ask For Knowledge Base"
              />
            </div>

            {showPath ? (
              <div className="space-y-2">
                <Label htmlFor="edit-tool-path">Path</Label>
                <p className="text-xs text-muted-foreground">
                  Ruta para resolver el módulo (ej.{" "}
                  <code className="rounded bg-muted px-1">
                    kai/interest/register_interest_in_buying
                  </code>
                  ). Requerido por MCP.
                </p>
                <Input
                  id="edit-tool-path"
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
              <Label htmlFor="edit-tool-description" className="sr-only">
                Descripción
              </Label>
              <Textarea
                id="edit-tool-description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
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

        <DialogFooter className="shrink-0 justify-start border-t pt-4">
          {catalogTool ? (
            <TooltipProvider delayDuration={150}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setSyncDialogOpen(true)}
                    disabled={saving}
                    aria-label="Sincronizar desde catálogo"
                  >
                    <RefreshCwIcon className="size-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="top">
                  Sincronizar desde catálogo
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          ) : null}
          <div className="flex-1" />
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={handleSubmit} disabled={saving}>
            {saving ? (
              <Loader2Icon className="mr-2 size-4 animate-spin" />
            ) : null}
            Guardar
          </Button>
        </DialogFooter>

        {catalogTool ? (
          <SyncFromCatalogDialog
            open={syncDialogOpen}
            onOpenChange={setSyncDialogOpen}
            agentId={agentId}
            tool={tool}
            catalogTool={catalogTool}
            onSuccess={onSuccess}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
