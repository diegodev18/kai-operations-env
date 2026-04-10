"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  CalendarIcon,
  Loader2Icon,
  UserPlus2Icon,
  PhoneIcon,
  FileTextIcon,
  CreditCardIcon,
  SendIcon,
  CheckIcon,
  ChevronDownIcon,
  ChevronRightIcon,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type {
  AgentGrowerRow,
  ImplementationTask,
  ImplementationTaskAttachment,
} from "@/types/agents-api";
import {
  createImplementationTask,
  fetchAgentGrowers,
  fetchImplementationTasks,
  patchImplementationTask,
} from "@/lib/agents-api";
import { FileUploadButton, AttachmentList } from "@/components/file-upload-button";

function toDateInputValue(value?: string | null): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString().slice(0, 10);
}

function toIsoFromDateInput(value: string): string | null {
  const v = value.trim();
  if (!v) return null;
  const date = new Date(`${v}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

const MANDATORY_TASK_TYPES = new Set([
  "connect-number",
  "csf-request",
  "payment-domiciliation",
  "quote-sent",
]);

const TASK_TYPE_CONFIG: Record<
  string,
  { icon: React.ElementType; badge?: string; badgeVariant?: "default" | "secondary" | "outline" }
> = {
  "connect-number": { icon: PhoneIcon },
  "csf-request": { icon: FileTextIcon, badge: "Necesaria", badgeVariant: "default" as const },
  "payment-domiciliation": {
    icon: CreditCardIcon,
    badge: "Pago manual",
    badgeVariant: "secondary" as const,
  },
  "quote-sent": { icon: SendIcon, badge: "Adjuntar doc", badgeVariant: "outline" as const },
};

export function AgentImplementationTasksPanel({ agentId }: { agentId: string }) {
  const [tasks, setTasks] = useState<ImplementationTask[]>([]);
  const [growers, setGrowers] = useState<AgentGrowerRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingCreate, setSavingCreate] = useState(false);
  const [savingTaskId, setSavingTaskId] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [assigneeEmails, setAssigneeEmails] = useState<string[]>([]);
  const [createAssigneesDialogOpen, setCreateAssigneesDialogOpen] =
    useState(false);
  const [createAttachments, setCreateAttachments] = useState<
    ImplementationTaskAttachment[]
  >([]);

  const [taskDueDates, setTaskDueDates] = useState<Record<string, string>>({});
  const [taskAssignees, setTaskAssignees] = useState<Record<string, string[]>>({});
  const [mandatoryCollapsed, setMandatoryCollapsed] = useState(true);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [tasksRes, growersRes] = await Promise.all([
        fetchImplementationTasks(agentId),
        fetchAgentGrowers(agentId),
      ]);
      if (tasksRes == null) {
        toast.error("No se pudieron cargar las tareas");
      } else {
        setTasks(Array.isArray(tasksRes.tasks) ? tasksRes.tasks : []);
      }
      if (growersRes == null) {
        toast.error("No se pudieron cargar los growers del agente");
        setGrowers([]);
      } else {
        setGrowers(Array.isArray(growersRes.growers) ? growersRes.growers : []);
      }
    } finally {
      setLoading(false);
    }
  }, [agentId]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  useEffect(() => {
    const nextDates: Record<string, string> = {};
    const nextAssignees: Record<string, string[]> = {};
    for (const task of tasks) {
      nextDates[task.id] = toDateInputValue(task.dueDate);
      nextAssignees[task.id] = task.assigneeEmails ?? [];
    }
    setTaskDueDates(nextDates);
    setTaskAssignees(nextAssignees);
  }, [tasks]);

  const growersByEmail = useMemo(() => {
    const map = new Map<string, string>();
    for (const g of growers) {
      map.set(g.email.trim().toLowerCase(), g.name);
    }
    return map;
  }, [growers]);

  const mandatoryTasks = useMemo(
    () => tasks.filter((t) => t.mandatory || (t.taskType && MANDATORY_TASK_TYPES.has(t.taskType))),
    [tasks],
  );

  const mandatoryProgress = useMemo(() => {
    const completed = mandatoryTasks.filter((t) => t.status === "completed").length;
    return { completed, total: mandatoryTasks.length };
  }, [mandatoryTasks]);

  const customTasks = useMemo(
    () =>
      tasks
        .filter((t) => !t.mandatory && !(t.taskType && MANDATORY_TASK_TYPES.has(t.taskType)))
        .sort((a, b) => {
          if (a.status !== b.status) return a.status === "pending" ? -1 : 1;
          const aTime = a.dueDate ? new Date(a.dueDate).getTime() : Number.MAX_SAFE_INTEGER;
          const bTime = b.dueDate ? new Date(b.dueDate).getTime() : Number.MAX_SAFE_INTEGER;
          return aTime - bTime;
        }),
    [tasks],
  );

  const toggleAssigneeForCreate = useCallback((email: string, checked: boolean) => {
    const normalized = email.trim().toLowerCase();
    setAssigneeEmails((prev) => {
      if (checked) return prev.includes(normalized) ? prev : [...prev, normalized];
      return prev.filter((e) => e !== normalized);
    });
  }, []);

  const onCreateTask = useCallback(async () => {
    const taskTitle = title.trim();
    if (!taskTitle) {
      toast.error("El título es obligatorio");
      return;
    }
    setSavingCreate(true);
    try {
      const result = await createImplementationTask(agentId, {
        title: taskTitle,
        description: description.trim() || undefined,
        dueDate: toIsoFromDateInput(dueDate),
        assigneeEmails,
        attachments: createAttachments.length > 0 ? createAttachments : undefined,
      });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      setTasks((prev) => [result.task, ...prev]);
      setTitle("");
      setDescription("");
      setDueDate("");
      setAssigneeEmails([]);
      setCreateAttachments([]);
      toast.success("Tarea creada");
    } finally {
      setSavingCreate(false);
    }
  }, [agentId, assigneeEmails, createAttachments, description, dueDate, title]);

  const onToggleTaskStatus = useCallback(
    async (task: ImplementationTask) => {
      setSavingTaskId(task.id);
      try {
        const result = await patchImplementationTask(agentId, task.id, {
          status: task.status === "completed" ? "pending" : "completed",
        });
        if (!result.ok) {
          toast.error(result.error);
          return;
        }
        setTasks((prev) => prev.map((t) => (t.id === task.id ? result.task : t)));
      } finally {
        setSavingTaskId(null);
      }
    },
    [agentId],
  );

  const onSaveTaskDueDate = useCallback(
    async (taskId: string) => {
      const dateInput = taskDueDates[taskId] ?? "";
      setSavingTaskId(taskId);
      try {
        const result = await patchImplementationTask(agentId, taskId, {
          dueDate: toIsoFromDateInput(dateInput),
        });
        if (!result.ok) {
          toast.error(result.error);
          return;
        }
        setTasks((prev) => prev.map((t) => (t.id === taskId ? result.task : t)));
        toast.success("Fecha de vencimiento actualizada");
      } finally {
        setSavingTaskId(null);
      }
    },
    [agentId, taskDueDates],
  );

  const onToggleTaskAssignee = useCallback(
    (taskId: string, email: string, checked: boolean) => {
      const normalized = email.trim().toLowerCase();
      setTaskAssignees((prev) => {
        const current = prev[taskId] ?? [];
        if (checked) {
          if (current.includes(normalized)) return prev;
          return { ...prev, [taskId]: [...current, normalized] };
        }
        return { ...prev, [taskId]: current.filter((e) => e !== normalized) };
      });
    },
    [],
  );

  const onSaveTaskAssignees = useCallback(
    async (taskId: string) => {
      setSavingTaskId(taskId);
      try {
        const result = await patchImplementationTask(agentId, taskId, {
          assigneeEmails: taskAssignees[taskId] ?? [],
        });
        if (!result.ok) {
          toast.error(result.error);
          return;
        }
        setTasks((prev) => prev.map((t) => (t.id === taskId ? result.task : t)));
        toast.success("Asignaciones actualizadas");
      } finally {
        setSavingTaskId(null);
      }
    },
    [agentId, taskAssignees],
  );

  const onFileUploaded = useCallback(
    (taskId: string) => (attachment: ImplementationTaskAttachment) => {
      setTasks((prev) =>
        prev.map((t) => {
          if (t.id !== taskId) return t;
          const existing = t.attachments ?? [];
          return { ...t, attachments: [...existing, attachment] };
        }),
      );
      void patchImplementationTask(agentId, taskId, {
        attachments: [...(tasks.find((t) => t.id === taskId)?.attachments ?? []), attachment],
      });
    },
    [agentId, tasks],
  );

  const onRemoveAttachment = useCallback(
    (taskId: string, index: number) => {
      setTasks((prev) =>
        prev.map((t) => {
          if (t.id !== taskId) return t;
          const next = [...(t.attachments ?? [])];
          next.splice(index, 1);
          return { ...t, attachments: next };
        }),
      );
      void patchImplementationTask(agentId, taskId, {
        attachments: tasks
          .find((t) => t.id === taskId)
          ?.attachments?.filter((_, i) => i !== index) ?? [],
      });
    },
    [agentId, tasks],
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2Icon className="size-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h2 className="text-sm font-semibold text-foreground">Tareas</h2>

      {/* Mandatory tasks checklist */}
      <section className="space-y-3">
        <button
          type="button"
          onClick={() => setMandatoryCollapsed((prev) => !prev)}
          className="flex w-full items-center gap-2 text-left"
        >
          {mandatoryCollapsed ? (
            <ChevronRightIcon className="size-4 shrink-0 text-muted-foreground" />
          ) : (
            <ChevronDownIcon className="size-4 shrink-0 text-muted-foreground" />
          )}
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Checklist obligatoria
          </h3>
          {mandatoryCollapsed && mandatoryProgress.total > 0 && (
            <span className="text-xs text-muted-foreground">
              ({mandatoryProgress.completed}/{mandatoryProgress.total})
            </span>
          )}
        </button>
        <div
          className={`space-y-2 transition-all duration-200 ${
            mandatoryCollapsed ? "hidden" : ""
          }`}
        >
          {mandatoryTasks.map((task) => {
            const isSaving = savingTaskId === task.id;
            const config = task.taskType ? TASK_TYPE_CONFIG[task.taskType] : null;
            const Icon = config?.icon ?? FileTextIcon;
            return (
              <div
                key={task.id}
                className="flex items-center gap-3 rounded-lg border px-3 py-2.5 transition-colors hover:bg-muted/50"
              >
                <button
                  type="button"
                  disabled={isSaving}
                  onClick={() => void onToggleTaskStatus(task)}
                  className={`flex size-6 shrink-0 items-center justify-center rounded border-2 transition-colors ${
                    task.status === "completed"
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-muted-foreground/30 hover:border-primary"
                  }`}
                >
                  {task.status === "completed" && <CheckIcon className="size-3.5" />}
                </button>

                <Icon className="size-4 shrink-0 text-muted-foreground" />

                <span
                  className={`min-w-0 flex-1 text-sm ${
                    task.status === "completed"
                      ? "text-muted-foreground line-through"
                      : "text-foreground"
                  }`}
                >
                  {task.title}
                </span>

                {config?.badge && (
                  <Badge variant={config.badgeVariant ?? "outline"} className="shrink-0 text-[10px]">
                    {config.badge}
                  </Badge>
                )}

                <AttachmentList
                  attachments={task.attachments ?? []}
                  onRemove={(i) => onRemoveAttachment(task.id, i)}
                />

                {(task.taskType === "quote-sent" || !config?.badge) && (
                  <FileUploadButton
                    agentId={agentId}
                    taskId={task.id}
                    onUploaded={onFileUploaded(task.id)}
                    label="Adjuntar"
                    size="sm"
                  />
                )}
              </div>
            );
          })}
        </div>
      </section>

      {/* Custom tasks */}
      <section className="space-y-3">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Tareas personalizadas
        </h3>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {customTasks.map((task) => {
            const isSaving = savingTaskId === task.id;
            const dueDateValue = taskDueDates[task.id] ?? "";
            const selectedAssignees = taskAssignees[task.id] ?? [];
            return (
              <Card key={task.id} className="h-full gap-4">
                <CardHeader className="gap-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="space-y-1">
                      <CardTitle className="line-clamp-2">{task.title}</CardTitle>
                      <CardDescription>
                        {task.description?.trim()
                          ? task.description
                          : "Sin descripción."}
                      </CardDescription>
                    </div>
                    <Badge
                      variant={task.status === "completed" ? "secondary" : "default"}
                    >
                      {task.status === "completed" ? "Completada" : "Pendiente"}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-muted-foreground">
                      Vencimiento
                    </label>
                    <div className="flex items-center gap-2">
                      <Input
                        type="date"
                        value={dueDateValue}
                        onChange={(e) =>
                          setTaskDueDates((prev) => ({
                            ...prev,
                            [task.id]: e.target.value,
                          }))
                        }
                      />
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={isSaving}
                        onClick={() => void onSaveTaskDueDate(task.id)}
                      >
                        Guardar
                      </Button>
                    </div>
                  </div>

                  <AttachmentList
                    attachments={task.attachments ?? []}
                    onRemove={(i) => onRemoveAttachment(task.id, i)}
                  />
                  <FileUploadButton
                    agentId={agentId}
                    taskId={task.id}
                    onUploaded={onFileUploaded(task.id)}
                    label="Adjuntar archivo"
                  />
                </CardContent>
                <CardFooter className="mt-auto flex-col items-stretch gap-3">
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-muted-foreground">
                      Asignados
                    </label>
                    <div className="max-h-24 overflow-y-auto rounded-md border p-2">
                      {growers.length === 0 ? (
                        <p className="text-xs text-muted-foreground">
                          Sin growers disponibles.
                        </p>
                      ) : (
                        <TooltipProvider>
                          <div className="space-y-1.5">
                            {growers.map((g) => {
                              const email = g.email.trim().toLowerCase();
                              const checked = selectedAssignees.includes(email);
                              return (
                                <label
                                  key={`${task.id}-${email}`}
                                  className="flex items-center gap-2 text-sm"
                                >
                                  <input
                                    type="checkbox"
                                    checked={checked}
                                    onChange={(e) =>
                                      onToggleTaskAssignee(task.id, email, e.target.checked)
                                    }
                                    className="h-4 w-4 rounded border-input"
                                  />
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <span className="truncate cursor-default">
                                        {g.name}
                                      </span>
                                    </TooltipTrigger>
                                    <TooltipContent sideOffset={6}>
                                      {email}
                                    </TooltipContent>
                                  </Tooltip>
                                </label>
                              );
                            })}
                          </div>
                        </TooltipProvider>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center justify-start gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={isSaving}
                      onClick={() => void onSaveTaskAssignees(task.id)}
                    >
                      Guardar asignación
                    </Button>
                  </div>
                  <div className="flex items-center justify-end">
                    <Button
                      type="button"
                      variant={task.status === "completed" ? "outline" : "default"}
                      size="sm"
                      disabled={isSaving}
                      onClick={() => void onToggleTaskStatus(task)}
                    >
                      {task.status === "completed" ? "Reabrir" : "Completar"}
                    </Button>
                  </div>
                </CardFooter>
              </Card>
            );
          })}

          <Card className="gap-4 border-dashed">
            <CardHeader>
              <CardTitle>Nueva task</CardTitle>
              <CardDescription>
                Crea una tarea de implementación y asígnala a growers.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-2">
                <label htmlFor="task-title" className="text-sm font-medium">
                  Título
                </label>
                <Input
                  id="task-title"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Ej. Publicar flujo de bienvenida"
                />
              </div>
              <div className="space-y-2">
                <label htmlFor="task-description" className="text-sm font-medium">
                  Descripción
                </label>
                <Textarea
                  id="task-description"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={3}
                  placeholder="Detalles de implementación"
                />
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                <div className="space-y-2">
                  <label htmlFor="task-dueDate" className="text-sm font-medium">
                    Fecha de vencimiento
                  </label>
                  <div className="flex items-center gap-2">
                    <CalendarIcon className="size-4 text-muted-foreground" />
                    <Input
                      id="task-dueDate"
                      type="date"
                      value={dueDate}
                      onChange={(e) => setDueDate(e.target.value)}
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Growers</label>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setCreateAssigneesDialogOpen(true)}
                    className="w-full justify-start gap-2"
                  >
                    <UserPlus2Icon className="size-4" />
                    Asignar growers
                  </Button>
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                {assigneeEmails.length > 0
                  ? `Seleccionados: ${assigneeEmails
                      .map((email) => growersByEmail.get(email) ?? email)
                      .join(", ")}`
                  : "Sin growers seleccionados"}
              </p>
              {createAttachments.length > 0 && (
                <AttachmentList
                  attachments={createAttachments}
                  onRemove={(i) =>
                    setCreateAttachments((prev) => prev.filter((_, idx) => idx !== i))
                  }
                />
              )}
              <FileUploadButton
                agentId={agentId}
                taskId={`create-task-${Date.now()}`}
                onUploaded={(attachment) =>
                  setCreateAttachments((prev) => [...prev, attachment])
                }
                label="Adjuntar archivo"
              />
            </CardContent>
            <CardFooter>
              <Button
                type="button"
                className="w-full"
                disabled={savingCreate}
                onClick={() => void onCreateTask()}
              >
                {savingCreate ? (
                  <>
                    <Loader2Icon className="mr-2 h-4 w-4 animate-spin" />
                    Creando...
                  </>
                ) : (
                  "Crear task"
                )}
              </Button>
            </CardFooter>
          </Card>
        </div>
      </section>

      <Dialog
        open={createAssigneesDialogOpen}
        onOpenChange={setCreateAssigneesDialogOpen}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Asignar growers</DialogTitle>
            <DialogDescription>
              Selecciona una o varias personas para la nueva task.
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-64 space-y-2 overflow-y-auto rounded-md border p-3">
            {growers.length === 0 ? (
              <p className="text-sm text-muted-foreground">Sin growers disponibles.</p>
            ) : (
              growers.map((g) => {
                const email = g.email.trim().toLowerCase();
                const checked = assigneeEmails.includes(email);
                return (
                  <label key={email} className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={(e) =>
                        toggleAssigneeForCreate(email, e.target.checked)
                      }
                      className="h-4 w-4 rounded border-input"
                    />
                    <span className="font-medium">{g.name}</span>
                    <span className="text-xs text-muted-foreground">({email})</span>
                  </label>
                );
              })
            )}
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setCreateAssigneesDialogOpen(false)}
            >
              Listo
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
