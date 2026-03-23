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
import Link from "next/link";
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
  TriangleAlertIcon,
} from "lucide-react";

const TOOL_TYPES: { value: AgentToolType; label: string }[] = [
  { value: "custom", label: "Custom" },
  { value: "default", label: "Default" },
  { value: "preset", label: "Preset" },
];

function PropertiesNotice({ agentId }: { agentId?: string }) {
  const href = agentId
    ? `/agents/${encodeURIComponent(agentId)}/configuration`
    : "/";
  return (
    <div
      className="flex gap-3 rounded-lg border border-amber-500/50 bg-amber-500/10 p-3 text-sm text-amber-800 dark:text-amber-200"
      role="status"
    >
      <TriangleAlertIcon className="h-5 w-5 shrink-0 text-amber-600 dark:text-amber-400" />
      <div>
        <p className="font-medium">Propiedades del agente</p>
        <p className="mt-0.5 text-muted-foreground">
          Para que cada tool funcione correctamente, puede ser necesario configurar las
          propiedades del agente.{" "}
          <Link
            href={href}
            className="font-medium text-primary underline underline-offset-2 hover:no-underline"
          >
            Configúralas en Configuración
          </Link>
          .
        </p>
      </div>
    </div>
  );
}

export function AgentToolsPanel({
  agentId,
  agentName,
}: {
  agentId: string;
  agentName?: string;
}) {
  const agent = {
    id: agentId,
    name: agentName ?? agentId,
  };
  return <ToolsPanel agent={agent} />;
}

function ToolsPanel({
  agent,
}: {
  agent: { id: string; name: string };
}) {
  const { tools, isLoading, refetch } = useAgentTools(agent.id);
  const [addOpen, setAddOpen] = useState(false);
  const [editTool, setEditTool] = useState<AgentTool | null>(null);
  const [deleteTool, setDeleteTool] = useState<AgentTool | null>(null);
  const [togglingToolId, setTogglingToolId] = useState<string | null>(null);

  const handleToggleEnabled = useCallback(
    async (tool: AgentTool, newEnabled: boolean) => {
      if (!agent) return;
      setTogglingToolId(tool.id);
      try {
        const updated = await updateAgentTool(
          agent.id,
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
    [agent, refetch]
  );

  return (
    <div className="space-y-4 min-h-0">
        <div className="space-y-1">
          <h3 className="text-base font-semibold">
            Tools de {agent.name || agent.id}
          </h3>
          <p className="text-sm text-muted-foreground">
            Gestiona las tools asignadas a este agente.
          </p>
        </div>

        <div className="min-h-0 overflow-y-auto space-y-4 max-w-3xl">
          <PropertiesNotice agentId={agent.id} />

          <div className="flex items-center justify-between gap-2">
            <span className="text-sm font-medium">Lista de tools</span>
            <Button size="sm" onClick={() => setAddOpen(true)}>
              <PlusIcon className="w-4 h-4 mr-1" />
              Agregar tool
            </Button>
          </div>

          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2Icon className="w-8 h-8 animate-spin text-muted-foreground" />
            </div>
          ) : tools.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center">
              Este agente no tiene tools. Haz clic en &quot;Agregar tool&quot; para añadir una.
            </p>
          ) : (
            <ul className="space-y-2">
              {tools.map((tool) => (
                <li
                  key={tool.id}
                  className="flex items-center justify-between gap-2 rounded-lg border p-3"
                >
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
                      {tool.required_agent_properties?.length ? (
                        <>
                          <span aria-hidden>·</span>
                          <span>
                            Requiere: {tool.required_agent_properties.join(", ")}
                          </span>
                        </>
                      ) : null}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <input
                      type="checkbox"
                      checked={tool.enabled !== false}
                      disabled={togglingToolId === tool.id}
                      onChange={(e) =>
                        handleToggleEnabled(tool, e.target.checked)
                      }
                      aria-label={
                        tool.enabled !== false
                          ? "Deshabilitar tool"
                          : "Habilitar tool"
                      }
                      className="h-4 w-4 rounded border-input"
                    />
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => setEditTool(tool)}
                      aria-label="Editar tool"
                    >
                      <PencilIcon className="w-4 h-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => setDeleteTool(tool)}
                      aria-label="Eliminar tool"
                    >
                      <Trash2Icon className="w-4 h-4 text-destructive" />
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

      <AddToolDialog
        agentId={agent.id}
        open={addOpen}
        onOpenChange={setAddOpen}
        onSuccess={() => {
          setAddOpen(false);
          refetch();
        }}
      />

      {editTool && (
        <EditToolDialog
          agentId={agent.id}
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
          agentId={agent.id}
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
  const [requiredPropertiesText, setRequiredPropertiesText] = useState("");
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
      setCatalogDropdownOpen(false);
    },
    []
  );

  const handleSubmit = useCallback(async () => {
    if (!name.trim()) {
      toast.error("El nombre es obligatorio");
      return;
    }
    if (!description.trim()) {
      toast.error("La descripción es obligatoria");
      return;
    }
    const required_agent_properties = requiredPropertiesText
      .split(/\n/)
      .map((s) => s.trim())
      .filter(Boolean);
    setSaving(true);
    try {
      const body: CreateAgentToolBody = {
        name: name.trim(),
        description: description.trim(),
        type,
      };
      if (parameters && Object.keys(parameters).length > 0) body.parameters = parameters;
      if (required_agent_properties.length) body.required_agent_properties = required_agent_properties;
      if (displayName.trim()) body.displayName = displayName.trim();
      if (path.trim()) body.path = path.trim();
      const created = await createAgentTool(agentId, body);
      if (created) {
        toast.success("Tool creada");
        setName("");
        setDescription("");
        setDisplayName("");
        setPath("");
        setParameters({});
        setRequiredPropertiesText("");
        setType("custom");
        onSuccess();
      }
    } finally {
      setSaving(false);
    }
  }, [agentId, name, description, type, displayName, path, parameters, requiredPropertiesText, onSuccess]);

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
          <PropertiesNotice agentId={agentId} />
          <div className="space-y-2">
            <Label htmlFor="add-tool-type">Tipo</Label>
            <select
              id="add-tool-type"
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
            <Label htmlFor="add-tool-required-props">
              Propiedades del agente requeridas
            </Label>
            <p className="text-xs text-muted-foreground">
              Documentos de properties que esta tool usa (uno por línea). Ej: prompt, agent,
              scheduling, notifications.
            </p>
            <Textarea
              id="add-tool-required-props"
              value={requiredPropertiesText}
              onChange={(e) => setRequiredPropertiesText(e.target.value)}
              placeholder="prompt&#10;scheduling&#10;notifications"
              rows={3}
              className="font-mono text-sm min-w-0 w-full"
            />
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
  const [name, setName] = useState(tool.name);
  const [displayName, setDisplayName] = useState(tool.displayName ?? "");
  const [description, setDescription] = useState(tool.description);
  const [type, setType] = useState<AgentToolType>(tool.type);
  const [path, setPath] = useState(tool.path ?? "");
  const [parameters, setParameters] = useState<Record<string, unknown>>(
    () => (tool.parameters && typeof tool.parameters === "object" ? (tool.parameters as Record<string, unknown>) : {})
  );
  const [requiredPropertiesText, setRequiredPropertiesText] = useState(
    () => (tool.required_agent_properties ?? []).join("\n")
  );
  const [saving, setSaving] = useState(false);

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
      setRequiredPropertiesText((tool.required_agent_properties ?? []).join("\n"));
    }
  }, [tool]);

  const handleSubmit = useCallback(async () => {
    if (!name.trim()) {
      toast.error("El nombre es obligatorio");
      return;
    }
    if (!description.trim()) {
      toast.error("La descripción es obligatoria");
      return;
    }
    const required_agent_properties = requiredPropertiesText
      .split(/\n/)
      .map((s) => s.trim())
      .filter(Boolean);
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
          required_agent_properties:
            required_agent_properties.length > 0 ? required_agent_properties : null,
        },
      );
      if (updated) {
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
    requiredPropertiesText,
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
            <Label htmlFor="edit-tool-required-props">
              Propiedades del agente requeridas
            </Label>
            <p className="text-xs text-muted-foreground">
              Documentos de properties que esta tool usa (uno por línea).
            </p>
            <Textarea
              id="edit-tool-required-props"
              value={requiredPropertiesText}
              onChange={(e) => setRequiredPropertiesText(e.target.value)}
              placeholder="prompt&#10;scheduling"
              rows={3}
              className="font-mono text-sm min-w-0 w-full"
            />
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
