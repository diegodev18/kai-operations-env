"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2Icon } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { AgentGrowerRow, ImplementationTask } from "@/types/agents-api";
import {
  createImplementationTask,
  fetchAgentGrowers,
  fetchImplementationTasks,
  patchImplementationTask,
} from "@/lib/agents-api";

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

  const [taskDueDates, setTaskDueDates] = useState<Record<string, string>>({});
  const [taskAssignees, setTaskAssignees] = useState<Record<string, string[]>>({});

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

  const sortedTasks = useMemo(() => {
    return [...tasks].sort((a, b) => {
      if (a.status !== b.status) return a.status === "pending" ? -1 : 1;
      const aTime = a.dueDate ? new Date(a.dueDate).getTime() : Number.MAX_SAFE_INTEGER;
      const bTime = b.dueDate ? new Date(b.dueDate).getTime() : Number.MAX_SAFE_INTEGER;
      return aTime - bTime;
    });
  }, [tasks]);

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
      toast.success("Tarea creada");
    } finally {
      setSavingCreate(false);
    }
  }, [agentId, assigneeEmails, description, dueDate, title]);

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

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2Icon className="size-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <section className="space-y-4 rounded-md border p-4">
        <h2 className="text-sm font-semibold text-foreground">Crear tarea</h2>
        <div className="grid gap-3 md:grid-cols-2">
          <div className="space-y-2 md:col-span-2">
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
          <div className="space-y-2 md:col-span-2">
            <label htmlFor="task-description" className="text-sm font-medium">
              Descripción (opcional)
            </label>
            <Textarea
              id="task-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              placeholder="Detalles de implementación"
            />
          </div>
          <div className="space-y-2">
            <label htmlFor="task-dueDate" className="text-sm font-medium">
              Fecha de vencimiento
            </label>
            <Input
              id="task-dueDate"
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <p className="text-sm font-medium">Asignar growers</p>
            <div className="max-h-28 overflow-y-auto rounded-md border p-2">
              {growers.length === 0 ? (
                <p className="text-xs text-muted-foreground">Sin growers disponibles.</p>
              ) : (
                <div className="space-y-1.5">
                  {growers.map((g) => {
                    const email = g.email.trim().toLowerCase();
                    const checked = assigneeEmails.includes(email);
                    return (
                      <label key={email} className="flex items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={(e) => toggleAssigneeForCreate(email, e.target.checked)}
                          className="h-4 w-4 rounded border-input"
                        />
                        <span>{g.name}</span>
                        <span className="text-xs text-muted-foreground">({email})</span>
                      </label>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
        <Button type="button" disabled={savingCreate} onClick={() => void onCreateTask()}>
          {savingCreate ? (
            <>
              <Loader2Icon className="mr-2 h-4 w-4 animate-spin" />
              Creando...
            </>
          ) : (
            "Crear tarea"
          )}
        </Button>
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-foreground">Tareas</h2>
        {sortedTasks.length === 0 ? (
          <p className="rounded-md border p-4 text-sm text-muted-foreground">
            No hay tareas todavía.
          </p>
        ) : (
          <div className="space-y-3">
            {sortedTasks.map((task) => {
              const isSaving = savingTaskId === task.id;
              const dueDateValue = taskDueDates[task.id] ?? "";
              const selectedAssignees = taskAssignees[task.id] ?? [];
              return (
                <article key={task.id} className="space-y-3 rounded-md border p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 space-y-1">
                      <h3 className="font-medium text-foreground">{task.title}</h3>
                      {task.description ? (
                        <p className="text-sm text-muted-foreground">{task.description}</p>
                      ) : null}
                      <p className="text-xs text-muted-foreground">
                        Estado: {task.status === "completed" ? "Completada" : "Pendiente"}
                      </p>
                    </div>
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

                  <div className="grid gap-3 md:grid-cols-2">
                    <div className="space-y-2">
                      <label className="text-xs font-medium text-muted-foreground">
                        Fecha de vencimiento
                      </label>
                      <div className="flex gap-2">
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

                    <div className="space-y-2">
                      <label className="text-xs font-medium text-muted-foreground">
                        Asignados
                      </label>
                      <div className="max-h-28 overflow-y-auto rounded-md border p-2">
                        {growers.length === 0 ? (
                          <p className="text-xs text-muted-foreground">
                            Sin growers disponibles.
                          </p>
                        ) : (
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
                                  <span>{g.name}</span>
                                  <span className="text-xs text-muted-foreground">
                                    ({email})
                                  </span>
                                </label>
                              );
                            })}
                          </div>
                        )}
                      </div>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={isSaving}
                        onClick={() => void onSaveTaskAssignees(task.id)}
                      >
                        Guardar asignaciones
                      </Button>
                    </div>
                  </div>

                  {selectedAssignees.length > 0 ? (
                    <p className="text-xs text-muted-foreground">
                      Asignados actuales:{" "}
                      {selectedAssignees
                        .map((email) => growersByEmail.get(email) ?? email)
                        .join(", ")}
                    </p>
                  ) : null}
                </article>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
