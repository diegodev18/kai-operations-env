"use client";

import type { AgentTool, AgentToolType, CreateAgentToolBody } from "@/types/agent-tool";
import {
  createAgentTool,
  deleteAgentTool,
  updateAgentTool,
  useAgentTools,
} from "@/hooks/agent-tools";
import { useToolsCatalog } from "@/hooks/use-tools-catalog";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ParameterSchemaEditor } from "@/components/parameter-schema-editor";
import {
  Loader2Icon,
  PlusIcon,
  Trash2Icon,
  WrenchIcon,
  PencilIcon,
} from "lucide-react";

const TOOL_TYPES: { value: AgentToolType; label: string }[] = [
  { value: "custom", label: "Custom" },
  { value: "default", label: "Default" },
  { value: "preset", label: "Preset" },
];

type JsonRecord = Record<string, unknown>;

function normalizeObjectSchema(schema: unknown): JsonRecord | null {
  if (!schema || typeof schema !== "object" || Array.isArray(schema)) return null;
  const typed = schema as JsonRecord;
  const type = typeof typed.type === "string" ? typed.type.toUpperCase() : "OBJECT";
  if (type !== "OBJECT") return null;
  const properties = typed.properties;
  if (!properties || typeof properties !== "object" || Array.isArray(properties)) return null;
  return typed;
}

function getDocSchemasFromToolSchema(schema: unknown): Record<string, JsonRecord> {
  const normalized = normalizeObjectSchema(schema);
  if (!normalized) return {};
  const rootProps = normalized.properties as JsonRecord;
  const entries = Object.entries(rootProps).filter(([, value]) => {
    const item = normalizeObjectSchema(value);
    return !!item;
  });
  return Object.fromEntries(entries.map(([k, v]) => [k, v as JsonRecord]));
}

async function fetchAgentPropertiesMap(agentId: string): Promise<JsonRecord | null> {
  try {
    const res = await fetch(`/api/agents/${encodeURIComponent(agentId)}/properties`, {
      credentials: "include",
    });
    if (!res.ok) return null;
    const json = (await res.json()) as unknown;
    return json && typeof json === "object" && !Array.isArray(json)
      ? (json as JsonRecord)
      : null;
  } catch {
    return null;
  }
}

async function patchAgentPropertyDoc(
  agentId: string,
  docId: string,
  payload: JsonRecord
): Promise<boolean> {
  const res = await fetch(
    `/api/agents/${encodeURIComponent(agentId)}/properties/${encodeURIComponent(docId)}`,
    {
      method: "PATCH",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }
  );
  return res.ok;
}

function ToolListItem({
  tool,
  togglingToolId,
  onToggleEnabled,
  onEdit,
  onDelete,
}: {
  tool: AgentTool;
  togglingToolId: string | null;
  onToggleEnabled: (tool: AgentTool, enabled: boolean) => void;
  onEdit: (tool: AgentTool) => void;
  onDelete: (tool: AgentTool) => void;
}) {
  return (
    <li className="flex items-center justify-between gap-2 rounded-lg border p-3">
      <div className="min-w-0 flex-1">
        <span className="inline-block rounded-md bg-muted px-1.5 py-0.5 text-xs font-mono text-muted-foreground">
          {tool.name}
        </span>
        <p className="mt-1.5 font-medium">
          {tool.displayName ?? tool.name}
        </p>
        <p className="mt-0.5 text-sm text-muted-foreground whitespace-pre-wrap break-words">
          {tool.description}
        </p>
        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground/80">
          <span>Tipo: {tool.type}</span>
        </div>
      </div>
      <div className="flex items-center gap-1 shrink-0">
        <input
          type="checkbox"
          checked={tool.enabled !== false}
          disabled={togglingToolId === tool.id}
          onChange={(e) => onToggleEnabled(tool, e.target.checked)}
          aria-label={
            tool.enabled !== false ? "Deshabilitar tool" : "Habilitar tool"
          }
          className="h-4 w-4 rounded border-input"
        />
        <Button
          variant="ghost"
          size="icon"
          onClick={() => onEdit(tool)}
          aria-label="Editar tool"
        >
          <PencilIcon className="w-4 h-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => onDelete(tool)}
          aria-label="Eliminar tool"
        >
          <Trash2Icon className="w-4 h-4 text-destructive" />
        </Button>
      </div>
    </li>
  );
}

export function AgentToolsPanel({ agentId }: { agentId: string }) {
  return <ToolsPanel agentId={agentId} />;
}

function ToolsPanel({ agentId }: { agentId: string }) {
  const { tools, isLoading, refetch } = useAgentTools(agentId);
  const [addOpen, setAddOpen] = useState(false);
  const [editTool, setEditTool] = useState<AgentTool | null>(null);
  const [deleteTool, setDeleteTool] = useState<AgentTool | null>(null);
  const [togglingToolId, setTogglingToolId] = useState<string | null>(null);

  const handleToggleEnabled = useCallback(
    async (tool: AgentTool, newEnabled: boolean) => {
      setTogglingToolId(tool.id);
      try {
        const updated = await updateAgentTool(
          agentId,
          tool.id,
          { enabled: newEnabled },
        );
        if (updated) {
          toast.success(
            newEnabled ? "Tool habilitada" : "Tool deshabilitada"
          );
          refetch();
        }
      } finally {
        setTogglingToolId(null);
      }
    },
    [agentId, refetch]
  );

  const mid = Math.ceil(tools.length / 2);
  const leftTools = tools.slice(0, mid);
  const rightTools = tools.slice(mid);

  return (
    <div className="min-h-0 space-y-4">
      <div className="min-h-0 w-full space-y-6 overflow-y-auto">
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm font-medium">Lista de tools</span>
          <Button size="sm" onClick={() => setAddOpen(true)}>
            <PlusIcon className="mr-1 h-4 w-4" />
            Agregar tool
          </Button>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2Icon className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : tools.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            Este agente no tiene tools. Haz clic en &quot;Agregar tool&quot; para
            añadir una.
          </p>
        ) : tools.length === 1 ? (
          <ul className="space-y-2">
            <ToolListItem
              tool={tools[0]}
              togglingToolId={togglingToolId}
              onToggleEnabled={handleToggleEnabled}
              onEdit={setEditTool}
              onDelete={setDeleteTool}
            />
          </ul>
        ) : (
          <div className="grid grid-cols-1 gap-12 lg:grid-cols-2 lg:gap-0 lg:items-start">
            <div className="min-w-0 space-y-2 lg:pr-8">
              <ul className="space-y-2">
                {leftTools.map((tool) => (
                  <ToolListItem
                    key={tool.id}
                    tool={tool}
                    togglingToolId={togglingToolId}
                    onToggleEnabled={handleToggleEnabled}
                    onEdit={setEditTool}
                    onDelete={setDeleteTool}
                  />
                ))}
              </ul>
            </div>
            <div className="min-w-0 space-y-2 border-t border-border pt-12 lg:border-t-0 lg:border-l lg:border-border lg:pt-0 lg:pl-8">
              <ul className="space-y-2">
                {rightTools.map((tool) => (
                  <ToolListItem
                    key={tool.id}
                    tool={tool}
                    togglingToolId={togglingToolId}
                    onToggleEnabled={handleToggleEnabled}
                    onEdit={setEditTool}
                    onDelete={setDeleteTool}
                  />
                ))}
              </ul>
            </div>
          </div>
        )}
      </div>

      <AddToolDialog
        agentId={agentId}
        open={addOpen}
        onOpenChange={setAddOpen}
        onSuccess={() => {
          setAddOpen(false);
          refetch();
        }}
      />

      {editTool && (
        <EditToolDialog
          agentId={agentId}
          tool={editTool}
          open={!!editTool}
          onOpenChange={(o) => !o && setEditTool(null)}
          onSuccess={() => {
            setEditTool(null);
            refetch();
          }}
        />
      )}

      {deleteTool && (
        <DeleteToolDialog
          agentId={agentId}
          tool={deleteTool}
          open={!!deleteTool}
          onOpenChange={(o) => !o && setDeleteTool(null)}
          onSuccess={() => {
            setDeleteTool(null);
            refetch();
          }}
        />
      )}
    </div>
  );
}

function AddToolDialog({
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
  const [toolPropertiesSchema, setToolPropertiesSchema] = useState<Record<string, unknown> | null>(null);
  const [agentPropertiesValues, setAgentPropertiesValues] = useState<Record<string, JsonRecord>>({});
  const [loadingAgentProperties, setLoadingAgentProperties] = useState(false);
  const [saving, setSaving] = useState(false);
  const [catalogDropdownOpen, setCatalogDropdownOpen] = useState(false);
  const catalogDropdownRef = useRef<HTMLDivElement>(null);

  const { tools: catalogTools, isLoading: catalogLoading } = useToolsCatalog();
  const catalogFiltered = useMemo(() => {
    if (type !== "default" || !catalogTools.length) return [];
    const q = name.trim().toLowerCase();
    if (!q) return catalogTools.slice(0, 20);
    return catalogTools
      .filter((t) => t.name.toLowerCase().includes(q))
      .slice(0, 20);
  }, [type, name, catalogTools]);
  useEffect(() => {
    if (!open) setCatalogDropdownOpen(false);
  }, [open]);
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
          : {}
      );
      setToolPropertiesSchema(
        tool.properties && typeof tool.properties === "object"
          ? (tool.properties as Record<string, unknown>)
          : null
      );
      setCatalogDropdownOpen(false);
    },
    []
  );

  const propertyDocSchemas = useMemo(
    () => (type === "default" ? getDocSchemasFromToolSchema(toolPropertiesSchema) : {}),
    [toolPropertiesSchema, type]
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
      if (parameters && Object.keys(parameters).length > 0) body.parameters = parameters;
      if (displayName.trim()) body.displayName = displayName.trim();
      if (path.trim()) body.path = path.trim();
      const created = await createAgentTool(agentId, body);
      if (created) {
        const docsToSave = Object.keys(propertyDocSchemas);
        if (docsToSave.length > 0) {
          for (const docId of docsToSave) {
            const ok = await patchAgentPropertyDoc(
              agentId,
              docId,
              agentPropertiesValues[docId] ?? {}
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-h-[90vh] w-[min(42rem,calc(100vw-2rem))] max-w-[42rem] flex flex-col overflow-hidden"
        showClose
      >
        <DialogHeader className="shrink-0">
          <DialogTitle>Agregar tool</DialogTitle>
        </DialogHeader>
        <div className="min-h-0 overflow-y-auto overflow-x-hidden space-y-4 py-2">
          <div className="space-y-2">
            <Label htmlFor="add-tool-type">Tipo</Label>
            <select
              id="add-tool-type"
              value={type}
              onChange={(e) => {
                const nextType = e.target.value as AgentToolType;
                setType(nextType);
                if (nextType !== "default") {
                  setToolPropertiesSchema(null);
                  setAgentPropertiesValues({});
                }
              }}
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm"
            >
              {TOOL_TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <Label htmlFor={type === "default" ? "add-tool-catalog-search" : "add-tool-name"}>
              Nombre
              {type === "default" && " (buscar en catálogo)"}
            </Label>
            {type === "default" ? (
              <div className="space-y-1" ref={catalogDropdownRef}>
                <p className="text-xs text-muted-foreground">
                  Elige una tool del catálogo para rellenar nombre, descripción y parámetros; podrás editarlos después.
                </p>
                <div className="relative">
                  <Input
                    id="add-tool-catalog-search"
                    value={name}
                    onChange={(e) => {
                      setName(e.target.value);
                      setToolPropertiesSchema(null);
                      setAgentPropertiesValues({});
                      setCatalogDropdownOpen(true);
                    }}
                    onFocus={() => setCatalogDropdownOpen(true)}
                    onBlur={() =>
                      setTimeout(() => setCatalogDropdownOpen(false), 200)
                    }
                    placeholder={
                      catalogLoading
                        ? "Cargando catálogo..."
                        : "Escribe para buscar (ej. kai_interest)"
                    }
                    autoComplete="off"
                  />
                  {catalogDropdownOpen && catalogFiltered.length > 0 && (
                    <ul
                      className="absolute z-10 mt-1 max-h-48 w-full overflow-auto rounded-md border bg-popover py-1 shadow-md"
                      role="listbox"
                    >
                      {catalogFiltered.map((tool) => (
                        <li
                          key={tool.id}
                          role="option"
                          aria-selected={false}
                          className="cursor-pointer px-3 py-2 text-sm hover:bg-accent focus:bg-accent focus:outline-none"
                          onMouseDown={(e) => {
                            e.preventDefault();
                            selectCatalogTool({
                              name: tool.name,
                              description: tool.description,
                              displayName: tool.displayName,
                              parameters: tool.parameters,
                              properties: tool.properties,
                              path: tool.path,
                            });
                          }}
                        >
                          <span className="font-medium">{tool.name}</span>
                          {tool.description && (
                            <p className="text-xs text-muted-foreground truncate mt-0.5">
                              {tool.description}
                            </p>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
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
          {(type === "default" || type === "preset") && (
            <div className="space-y-2">
              <Label htmlFor="add-tool-path">Path</Label>
              <p className="text-xs text-muted-foreground">
                Ruta para resolver el módulo (ej. kai/interest/register_interest_in_buying). Se rellena al elegir del catálogo; si falta, se deriva del nombre.
              </p>
              <Input
                id="add-tool-path"
                value={path}
                onChange={(e) => setPath(e.target.value)}
                placeholder="kai/category/tool_name"
              />
            </div>
          )}
          <div className="space-y-2">
            <Label htmlFor="add-tool-description">Descripción</Label>
            <Textarea
              id="add-tool-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Descripción para el LLM"
              rows={3}
            />
          </div>
          <div className="space-y-2 min-w-0">
            <ParameterSchemaEditor
              value={parameters}
              onChange={setParameters}
            />
          </div>
          <div className="space-y-2">
            {Object.keys(propertyDocSchemas).length > 0 ? (
              <AgentPropertiesByToolSchemaForm
                title="Propiedades del agente"
                description="Configura valores para los documentos requeridos por esta tool, usando el schema definido en toolsCatalog."
                docSchemas={propertyDocSchemas}
                values={agentPropertiesValues}
                onChange={setAgentPropertiesValues}
                isLoading={loadingAgentProperties}
              />
            ) : null}
          </div>
        </div>
        <DialogFooter className="shrink-0">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={handleSubmit} disabled={saving}>
            {saving ? (
              <Loader2Icon className="w-4 h-4 animate-spin mr-2" />
            ) : (
              <WrenchIcon className="w-4 h-4 mr-2" />
            )}
            Crear tool
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function EditToolDialog({
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
  const [parameters, setParameters] = useState<Record<string, unknown>>(
    () => (tool.parameters && typeof tool.parameters === "object" ? (tool.parameters as Record<string, unknown>) : {})
  );
  const [agentPropertiesValues, setAgentPropertiesValues] = useState<Record<string, JsonRecord>>({});
  const [loadingAgentProperties, setLoadingAgentProperties] = useState(false);
  const [saving, setSaving] = useState(false);

  const catalogTool = useMemo(
    () =>
      catalogTools.find((item) =>
        (path.trim() && item.path === path.trim()) || item.name === name.trim()
      ),
    [catalogTools, path, name]
  );
  const propertyDocSchemas = useMemo(
    () => (type === "default" ? getDocSchemasFromToolSchema(catalogTool?.properties) : {}),
    [catalogTool?.properties, type]
  );

  // Sync form when tool changes
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
          : {}
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
      const updated = await updateAgentTool(
        agentId,
        tool.id,
        {
          name: name.trim(),
          description: description.trim(),
          type,
          parameters: parameters && Object.keys(parameters).length > 0 ? parameters : null,
          displayName: displayName.trim() || null,
          path: path.trim() || null,
        },
      );
      if (updated) {
        const docsToSave = Object.keys(propertyDocSchemas);
        if (docsToSave.length > 0) {
          for (const docId of docsToSave) {
            const ok = await patchAgentPropertyDoc(
              agentId,
              docId,
              agentPropertiesValues[docId] ?? {}
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-h-[90vh] w-[min(42rem,calc(100vw-2rem))] max-w-[42rem] flex flex-col overflow-hidden"
        showClose
      >
        <DialogHeader className="shrink-0">
          <DialogTitle>Editar tool</DialogTitle>
        </DialogHeader>
        <div className="min-h-0 overflow-y-auto overflow-x-hidden space-y-4 py-2">
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
          <div className="space-y-2">
            <Label htmlFor="edit-tool-description">Descripción</Label>
            <Textarea
              id="edit-tool-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="edit-tool-type">Tipo</Label>
            <select
              id="edit-tool-type"
              value={type}
              onChange={(e) => setType(e.target.value as AgentToolType)}
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm"
            >
              {TOOL_TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>
          {(type === "default" || type === "preset") && (
            <div className="space-y-2">
              <Label htmlFor="edit-tool-path">Path</Label>
              <p className="text-xs text-muted-foreground">
                Ruta para resolver el módulo (ej. kai/interest/register_interest_in_buying). Requerido por MCP.
              </p>
              <Input
                id="edit-tool-path"
                value={path}
                onChange={(e) => setPath(e.target.value)}
                placeholder="kai/category/tool_name"
              />
            </div>
          )}
          <div className="space-y-2 min-w-0">
            <ParameterSchemaEditor
              value={parameters}
              onChange={setParameters}
            />
          </div>
          <div className="space-y-2">
            {Object.keys(propertyDocSchemas).length > 0 ? (
              <AgentPropertiesByToolSchemaForm
                title="Propiedades del agente"
                description="Configura valores para los documentos requeridos por esta tool, usando el schema definido en toolsCatalog."
                docSchemas={propertyDocSchemas}
                values={agentPropertiesValues}
                onChange={setAgentPropertiesValues}
                isLoading={loadingAgentProperties}
              />
            ) : null}
          </div>
        </div>
        <DialogFooter className="shrink-0">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={handleSubmit} disabled={saving}>
            {saving ? (
              <Loader2Icon className="w-4 h-4 animate-spin mr-2" />
            ) : null}
            Guardar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function getSchemaType(schema: unknown): string {
  if (!schema || typeof schema !== "object" || Array.isArray(schema)) return "string";
  const type = (schema as JsonRecord).type;
  return typeof type === "string" ? type.toLowerCase() : "string";
}

function getSchemaDescription(schema: unknown): string {
  if (!schema || typeof schema !== "object" || Array.isArray(schema)) return "";
  const raw = (schema as JsonRecord).description;
  if (typeof raw === "string") return raw;
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    const es = (raw as JsonRecord).es;
    return typeof es === "string" ? es : "";
  }
  return "";
}

function getObjectProperties(schema: unknown): JsonRecord {
  if (!schema || typeof schema !== "object" || Array.isArray(schema)) return {};
  const props = (schema as JsonRecord).properties;
  if (!props || typeof props !== "object" || Array.isArray(props)) return {};
  return props as JsonRecord;
}

function getNestedValue(obj: JsonRecord, path: string[]): unknown {
  let current: unknown = obj;
  for (const key of path) {
    if (!current || typeof current !== "object" || Array.isArray(current)) return undefined;
    current = (current as JsonRecord)[key];
  }
  return current;
}

function setNestedValue(obj: JsonRecord, path: string[], value: unknown): JsonRecord {
  if (path.length === 0) return obj;
  const [head, ...rest] = path;
  const next = { ...obj };
  if (rest.length === 0) {
    next[head] = value;
    return next;
  }
  const currentChild =
    next[head] && typeof next[head] === "object" && !Array.isArray(next[head])
      ? (next[head] as JsonRecord)
      : {};
  next[head] = setNestedValue(currentChild, rest, value);
  return next;
}

function AgentPropertiesByToolSchemaForm({
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
    [values, onChange]
  );

  return (
    <div className="space-y-3 rounded-lg border p-3">
      <div className="space-y-1">
        <Label>{title}</Label>
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
            <div key={docId} className="space-y-2 rounded-md border bg-muted/20 p-3">
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
    return <p className="text-xs text-muted-foreground">Sin campos configurables.</p>;
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
            fieldSchema && typeof fieldSchema === "object" && !Array.isArray(fieldSchema)
              ? (fieldSchema as JsonRecord)
              : { type: "object", properties: {} };
          return (
            <div key={path.join(".")} className="space-y-2 rounded-md border p-2">
              <p className="text-xs font-medium">{path.join(".")}</p>
              {desc ? <p className="text-xs text-muted-foreground">{desc}</p> : null}
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
          <div key={path.join(".")} className="space-y-1">
            <Label className="text-xs">{path.join(".")}</Label>
            {desc ? <p className="text-xs text-muted-foreground">{desc}</p> : null}
            {fieldType === "boolean" ? (
              <label className="inline-flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={Boolean(current)}
                  onChange={(e) => onValueChange(docId, path, e.target.checked)}
                  className="h-4 w-4 rounded border-input"
                />
                Activado
              </label>
            ) : fieldType === "number" ? (
              <Input
                type="number"
                value={typeof current === "number" ? current : current == null ? "" : String(current)}
                onChange={(e) => {
                  const next = e.target.value.trim();
                  onValueChange(docId, path, next === "" ? null : Number(next));
                }}
              />
            ) : (
              <Input
                value={typeof current === "string" ? current : current == null ? "" : String(current)}
                onChange={(e) => onValueChange(docId, path, e.target.value)}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

function DeleteToolDialog({
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
  const [deleting, setDeleting] = useState(false);

  const handleDelete = useCallback(async () => {
    setDeleting(true);
    try {
      const ok = await deleteAgentTool(agentId, tool.id);
      if (ok) {
        toast.success("Tool eliminada");
        onSuccess();
      }
    } finally {
      setDeleting(false);
    }
  }, [agentId, tool.id, onSuccess]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm" showClose>
        <DialogHeader>
          <DialogTitle>¿Eliminar tool?</DialogTitle>
          <p className="text-sm text-muted-foreground">
            Se eliminará la tool &quot;{tool.name}&quot;. Esta acción no se puede deshacer.
          </p>
        </DialogHeader>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button variant="destructive" onClick={handleDelete} disabled={deleting}>
            {deleting ? (
              <Loader2Icon className="w-4 h-4 animate-spin mr-2" />
            ) : (
              <Trash2Icon className="w-4 h-4 mr-2" />
            )}
            Eliminar
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
