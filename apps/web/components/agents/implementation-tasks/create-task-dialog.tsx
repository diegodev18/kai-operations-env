"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { CalendarIcon, Loader2Icon, UsersIcon } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Checkbox } from "@/components/ui/checkbox";
import type {
  AgentGrowerRow,
  ImplementationTask,
  ImplementationTaskAttachment,
  ImplementationTaskPriority,
  ImplementationTaskStatus,
} from "@/types";
import { createImplementationTask } from "@/services/agents-api";
import { AttachmentList, FileUploadButton } from "@/components/shared";
import { cn } from "@/lib/utils";
import {
  PRIORITY_CONFIG,
  PRIORITY_ORDER,
  STATUS_CONFIG,
  STATUS_ORDER,
  toIsoFromDateInput,
} from "./constants";

interface CreateTaskDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  agentId: string;
  growers: AgentGrowerRow[];
  onCreated: (task: ImplementationTask) => void;
  parentTaskId?: string | null;
}

export function CreateTaskDialog({
  open,
  onOpenChange,
  agentId,
  growers,
  onCreated,
  parentTaskId,
}: CreateTaskDialogProps) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [assigneeEmails, setAssigneeEmails] = useState<string[]>([]);
  const [attachments, setAttachments] = useState<ImplementationTaskAttachment[]>([]);
  const [priority, setPriority] = useState<ImplementationTaskPriority>("none");
  const [status, setStatus] = useState<ImplementationTaskStatus>("todo");
  const [saving, setSaving] = useState(false);
  const [assigneesOpen, setAssigneesOpen] = useState(false);
  const [dateOpen, setDateOpen] = useState(false);
  const taskTempId = useRef(`create-task-${Date.now()}`);

  useEffect(() => {
    if (open) taskTempId.current = `create-task-${Date.now()}`;
  }, [open]);

  const reset = () => {
    setTitle("");
    setDescription("");
    setDueDate("");
    setAssigneeEmails([]);
    setAttachments([]);
    setPriority("none");
    setStatus("todo");
  };

  const handleClose = () => {
    reset();
    onOpenChange(false);
  };

  const toggleAssignee = useCallback((email: string, checked: boolean) => {
    const normalized = email.trim().toLowerCase();
    setAssigneeEmails((prev) => {
      if (checked) return prev.includes(normalized) ? prev : [...prev, normalized];
      return prev.filter((e) => e !== normalized);
    });
  }, []);

  const handleCreate = async () => {
    const taskTitle = title.trim();
    if (!taskTitle) {
      toast.error("El título es obligatorio");
      return;
    }
    setSaving(true);
    try {
      const result = await createImplementationTask(agentId, {
        title: taskTitle,
        description: description.trim() || undefined,
        dueDate: toIsoFromDateInput(dueDate),
        assigneeEmails,
        attachments: attachments.length > 0 ? attachments : undefined,
        priority,
        ...(parentTaskId ? { parentTaskId } : {}),
      });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      onCreated(result.task);
      toast.success(parentTaskId ? "Sub-tarea creada" : "Tarea creada");
      handleClose();
    } finally {
      setSaving(false);
    }
  };

  const dueDateLabel = dueDate
    ? new Date(`${dueDate}T00:00:00`).toLocaleDateString("es-MX", { dateStyle: "medium" })
    : "Vencimiento";

  const assigneesLabel =
    assigneeEmails.length > 0
      ? `${assigneeEmails.length} asignado${assigneeEmails.length > 1 ? "s" : ""}`
      : "Asignados";

  const priorityCfg = PRIORITY_CONFIG[priority];
  const PriorityIcon = priorityCfg.icon;
  const statusCfg = STATUS_CONFIG[status];
  const StatusIcon = statusCfg.icon;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-3xl gap-0 p-0">
        <DialogHeader className="border-b px-8 pb-5 pt-7">
          <DialogTitle className="text-lg">{parentTaskId ? "Nueva sub-tarea" : "Nueva tarea"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-2 px-8 py-6">
          <Input
            placeholder="Título"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            autoFocus
            onKeyDown={(e) => { if (e.key === "Enter") e.preventDefault(); }}
            className="border-0 px-0 text-lg font-medium shadow-none focus-visible:ring-0 placeholder:text-muted-foreground/60"
          />
          <Textarea
            placeholder="Descripción (markdown)"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={6}
            className="resize-none border-0 px-0 text-sm shadow-none focus-visible:ring-0 placeholder:text-muted-foreground/60"
          />
          {attachments.length > 0 && (
            <div className="pt-2">
              <AttachmentList
                attachments={attachments}
                onRemove={(i) => setAttachments((prev) => prev.filter((_, idx) => idx !== i))}
              />
            </div>
          )}
        </div>

        {/* Bottom metadata bar */}
        <div className="flex items-center justify-between gap-2 border-t px-8 py-4">
          <div className="flex flex-wrap items-center gap-2">
            {/* Status */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="h-7 gap-1.5 text-xs font-normal">
                  <StatusIcon className={cn("size-3.5", statusCfg.iconClassName)} />
                  {statusCfg.label}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-44">
                {STATUS_ORDER.map((s) => {
                  const cfg = STATUS_CONFIG[s];
                  const SIcon = cfg.icon;
                  return (
                    <DropdownMenuItem key={s} className="gap-2" onSelect={() => setStatus(s)}>
                      <SIcon className={cn("size-3.5 shrink-0", cfg.iconClassName)} />
                      <span className="text-sm">{cfg.label}</span>
                    </DropdownMenuItem>
                  );
                })}
              </DropdownMenuContent>
            </DropdownMenu>

            {/* Priority */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="h-7 gap-1.5 text-xs font-normal">
                  <PriorityIcon className={cn("size-3.5", priorityCfg.className)} />
                  {priorityCfg.label}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-44">
                {PRIORITY_ORDER.map((p) => {
                  const cfg = PRIORITY_CONFIG[p];
                  const PIcon = cfg.icon;
                  return (
                    <DropdownMenuItem key={p} className="gap-2" onSelect={() => setPriority(p)}>
                      <PIcon className={cn("size-3.5 shrink-0", cfg.className)} />
                      <span className="text-sm">{cfg.label}</span>
                    </DropdownMenuItem>
                  );
                })}
              </DropdownMenuContent>
            </DropdownMenu>

            {/* Due date */}
            <Popover open={dateOpen} onOpenChange={setDateOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className={cn("h-7 gap-1.5 text-xs font-normal", dueDate && "text-foreground")}
                >
                  <CalendarIcon className="size-3.5" />
                  {dueDateLabel}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-3" align="start">
                <input
                  type="date"
                  value={dueDate}
                  onChange={(e) => { setDueDate(e.target.value); setDateOpen(false); }}
                  className="block rounded-md border border-input bg-background px-2 py-1.5 text-sm"
                />
                {dueDate && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="mt-2 h-7 w-full text-xs text-muted-foreground"
                    onClick={() => { setDueDate(""); setDateOpen(false); }}
                  >
                    Quitar fecha
                  </Button>
                )}
              </PopoverContent>
            </Popover>

            {/* Assignees */}
            <Popover open={assigneesOpen} onOpenChange={setAssigneesOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className={cn("h-7 gap-1.5 text-xs font-normal", assigneeEmails.length > 0 && "text-foreground")}
                >
                  <UsersIcon className="size-3.5" />
                  {assigneesLabel}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-64 p-2" align="start">
                <p className="mb-2 px-1 text-xs font-medium text-muted-foreground">Asignar growers</p>
                {growers.length === 0 ? (
                  <p className="px-1 text-xs text-muted-foreground">Sin growers disponibles.</p>
                ) : (
                  <div className="space-y-0.5">
                    {growers.map((g) => {
                      const email = g.email.trim().toLowerCase();
                      const checked = assigneeEmails.includes(email);
                      return (
                        <label
                          key={email}
                          className="flex cursor-pointer items-center gap-2 rounded px-1 py-1.5 hover:bg-muted"
                        >
                          <Checkbox
                            checked={checked}
                            onCheckedChange={(v) => toggleAssignee(email, Boolean(v))}
                          />
                          <span className="text-sm">{g.name}</span>
                        </label>
                      );
                    })}
                  </div>
                )}
              </PopoverContent>
            </Popover>

            {/* File upload */}
            <FileUploadButton
              agentId={agentId}
              taskId={taskTempId.current}
              onUploaded={(att) => setAttachments((prev) => [...prev, att])}
              label="Archivo"
              size="sm"
              variant="outline"
            />
          </div>

          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={handleClose} disabled={saving}>
              Descartar
            </Button>
            <Button size="sm" onClick={() => void handleCreate()} disabled={saving}>
              {saving ? (
                <>
                  <Loader2Icon className="mr-1.5 size-3.5 animate-spin" />
                  Creando...
                </>
              ) : (
                "Crear tarea"
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
