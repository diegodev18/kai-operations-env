"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  CalendarClockIcon,
  CheckCircle2Icon,
  ExternalLinkIcon,
  Loader2Icon,
  SearchIcon,
  UsersIcon,
} from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { AttachmentList } from "@/components/shared";
import { TaskComments } from "@/components/agents/implementation-tasks/task-comments";
import {
  PRIORITY_CONFIG,
  PRIORITY_ORDER,
  STATUS_CONFIG,
  STATUS_ORDER,
  formatDate,
  formatDateTime,
  normalizeStatus,
  toDateInputValue,
  toIsoFromDateInput,
} from "@/components/agents/implementation-tasks/constants";
import { cn } from "@/lib/utils";
import {
  fetchGlobalImplementationTasks,
  patchImplementationTask,
} from "@/services/agents-api";
import type {
  AgentGrowerRow,
  GlobalImplementationTask,
  ImplementationTask,
  ImplementationTaskPriority,
  ImplementationTaskStatus,
} from "@/types";

type DueFilter = "all" | "overdue" | "today" | "week" | "none";
type DashboardView = "daily" | "agents" | "table";

function isClosed(task: GlobalImplementationTask): boolean {
  const status = normalizeStatus(task.status);
  return status === "completed" || status === "cancelled";
}

function isOverdue(task: GlobalImplementationTask): boolean {
  if (!task.dueDate || isClosed(task)) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const due = new Date(task.dueDate);
  due.setHours(0, 0, 0, 0);
  return due < today;
}

function mergeTask(
  current: GlobalImplementationTask,
  updated: ImplementationTask,
): GlobalImplementationTask {
  return {
    ...current,
    ...updated,
    taskKey: current.taskKey,
    agentId: current.agentId,
    agentName: current.agentName,
    businessName: current.businessName,
    agentStatus: current.agentStatus,
    growers: current.growers,
    lifecycleSummary: current.lifecycleSummary,
  };
}

function assigneeLabel(email: string, growers: AgentGrowerRow[]): string {
  const normalized = email.trim().toLowerCase();
  return growers.find((grower) => grower.email.trim().toLowerCase() === normalized)?.name ?? email;
}

function KpiCard(props: {
  label: string;
  value: number;
  tone?: "default" | "danger" | "warning" | "success";
  featured?: boolean;
}) {
  return (
    <div
      className={cn(
        "rounded-2xl border bg-card px-4 py-3 shadow-sm",
        props.featured && "px-5 py-4",
        props.tone === "danger" && "border-red-200 bg-red-50/50 dark:border-red-950 dark:bg-red-950/15",
        props.tone === "warning" && "border-amber-200 bg-amber-50/50 dark:border-amber-950 dark:bg-amber-950/15",
        props.tone === "success" && "border-emerald-200 bg-emerald-50/50 dark:border-emerald-950 dark:bg-emerald-950/15",
      )}
    >
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{props.label}</p>
      <p className={cn("mt-1 font-semibold tabular-nums", props.featured ? "text-3xl" : "text-2xl")}>
        {props.value}
      </p>
    </div>
  );
}

function TaskStatusBadge({ task }: { task: GlobalImplementationTask }) {
  const status = normalizeStatus(task.status);
  const cfg = STATUS_CONFIG[status];
  const Icon = cfg.icon;
  return (
    <Badge variant="outline" className={cn("gap-1.5", cfg.badgeClassName)}>
      <Icon className={cn("size-3", cfg.iconClassName)} />
      {cfg.label}
    </Badge>
  );
}

function TaskPriorityBadge({ task }: { task: GlobalImplementationTask }) {
  const priority = task.priority ?? "none";
  const cfg = PRIORITY_CONFIG[priority];
  const Icon = cfg.icon;
  return (
    <Badge variant="outline" className="gap-1.5">
      <Icon className={cn("size-3", cfg.className)} />
      {cfg.label}
    </Badge>
  );
}

export function TasksDashboard() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [tasks, setTasks] = useState<GlobalImplementationTask[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [savingTaskKey, setSavingTaskKey] = useState<string | null>(null);
  const [bulkSaving, setBulkSaving] = useState(false);
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
  const [selectedTaskKey, setSelectedTaskKey] = useState<string | null>(null);
  const [activeView, setActiveView] = useState<DashboardView>("daily");

  const [search, setSearch] = useState(() => searchParams.get("q") ?? "");
  const [statusFilter, setStatusFilter] = useState(() => searchParams.get("status") ?? "all");
  const [priorityFilter, setPriorityFilter] = useState(() => searchParams.get("priority") ?? "all");
  const [dueFilter, setDueFilter] = useState<DueFilter>(
    () => (searchParams.get("due") as DueFilter | null) ?? "all",
  );
  const [assigneeFilter, setAssigneeFilter] = useState(() => searchParams.get("assignee") ?? "all");

  const loadTasks = useCallback(async () => {
    setLoading(true);
    const response = await fetchGlobalImplementationTasks({
      q: search,
      status: statusFilter,
      priority: priorityFilter,
      due: dueFilter,
      assignee: assigneeFilter,
      limit: 200,
    });
    if (!response) {
      toast.error("No se pudieron cargar las tareas globales");
      setLoading(false);
      return;
    }
    setTasks(response.tasks);
    setTotal(response.total);
    setSelectedKeys((prev) => {
      const available = new Set(response.tasks.map((task) => task.taskKey));
      return new Set([...prev].filter((key) => available.has(key)));
    });
    setLoading(false);
  }, [assigneeFilter, dueFilter, priorityFilter, search, statusFilter]);

  useEffect(() => {
    const params = new URLSearchParams();
    if (search.trim()) params.set("q", search.trim());
    if (statusFilter !== "all") params.set("status", statusFilter);
    if (priorityFilter !== "all") params.set("priority", priorityFilter);
    if (dueFilter !== "all") params.set("due", dueFilter);
    if (assigneeFilter !== "all") params.set("assignee", assigneeFilter);
    const next = params.toString();
    router.replace(`/tasks${next ? `?${next}` : ""}`, { scroll: false });
  }, [assigneeFilter, dueFilter, priorityFilter, router, search, statusFilter]);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      void loadTasks();
    }, 200);
    return () => window.clearTimeout(timeout);
  }, [loadTasks]);

  const selectedTask = useMemo(
    () => tasks.find((task) => task.taskKey === selectedTaskKey) ?? null,
    [selectedTaskKey, tasks],
  );

  const allAssignees = useMemo(() => {
    const map = new Map<string, string>();
    for (const task of tasks) {
      for (const grower of task.growers) {
        const email = grower.email.trim().toLowerCase();
        if (email) map.set(email, grower.name || email);
      }
      for (const email of task.assigneeEmails) {
        if (!map.has(email)) map.set(email, email);
      }
    }
    return [...map.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [tasks]);

  const selectedTasks = useMemo(
    () => tasks.filter((task) => selectedKeys.has(task.taskKey)),
    [selectedKeys, tasks],
  );

  const metrics = useMemo(() => {
    const open = tasks.filter((task) => !isClosed(task)).length;
    const overdue = tasks.filter(isOverdue).length;
    const blocked = tasks.filter((task) => task.status === "blocked").length;
    const unassigned = tasks.filter((task) => !isClosed(task) && task.assigneeEmails.length === 0).length;
    const urgent = tasks.filter((task) => !isClosed(task) && task.priority === "urgent").length;
    const criticalAgents = new Set(
      tasks
        .filter((task) => !isClosed(task) && (isOverdue(task) || task.status === "blocked" || task.priority === "urgent"))
        .map((task) => task.agentId),
    ).size;
    const criticalToday = tasks.filter(
      (task) =>
        !isClosed(task) &&
        (isOverdue(task) ||
          task.status === "blocked" ||
          task.priority === "urgent" ||
          task.assigneeEmails.length === 0),
    ).length;
    return { open, overdue, blocked, unassigned, urgent, criticalAgents, criticalToday };
  }, [tasks]);

  const focusTasks = useMemo(
    () =>
      tasks
        .filter((task) => !isClosed(task))
        .filter(
          (task) =>
            isOverdue(task) ||
            task.status === "blocked" ||
            task.priority === "urgent" ||
            task.assigneeEmails.length === 0,
        )
        .slice(0, 8),
    [tasks],
  );

  const dailyGroups = useMemo(
    () => [
      {
        id: "overdue",
        title: "Vencidas",
        description: "Ya pasaron su fecha comprometida.",
        tone: "danger" as const,
        tasks: tasks.filter(isOverdue).slice(0, 6),
      },
      {
        id: "blocked",
        title: "Bloqueadas",
        description: "Requieren destrabe antes de avanzar.",
        tone: "warning" as const,
        tasks: tasks.filter((task) => !isClosed(task) && task.status === "blocked").slice(0, 6),
      },
      {
        id: "unassigned",
        title: "Sin responsable",
        description: "Necesitan dueño para evitar pérdida de seguimiento.",
        tone: "default" as const,
        tasks: tasks.filter((task) => !isClosed(task) && task.assigneeEmails.length === 0).slice(0, 6),
      },
      {
        id: "urgent",
        title: "Alta prioridad",
        description: "Urgentes o altas aunque no estén vencidas.",
        tone: "success" as const,
        tasks: tasks
          .filter((task) => !isClosed(task) && (task.priority === "urgent" || task.priority === "high"))
          .slice(0, 6),
      },
    ],
    [tasks],
  );

  const agentSummaries = useMemo(() => {
    const map = new Map<
      string,
      {
        agentId: string;
        agentName: string;
        businessName: string;
        tasks: GlobalImplementationTask[];
        open: number;
        overdue: number;
        blocked: number;
        unassigned: number;
        completed: number;
        risk: number;
      }
    >();

    for (const task of tasks) {
      const current =
        map.get(task.agentId) ??
        {
          agentId: task.agentId,
          agentName: task.agentName,
          businessName: task.businessName,
          tasks: [],
          open: 0,
          overdue: 0,
          blocked: 0,
          unassigned: 0,
          completed: 0,
          risk: 0,
        };
      current.tasks.push(task);
      if (!isClosed(task)) current.open += 1;
      if (isOverdue(task)) current.overdue += 1;
      if (task.status === "blocked") current.blocked += 1;
      if (!isClosed(task) && task.assigneeEmails.length === 0) current.unassigned += 1;
      if (normalizeStatus(task.status) === "completed") current.completed += 1;
      current.risk = current.overdue * 4 + current.blocked * 3 + current.unassigned + current.open * 0.25;
      map.set(task.agentId, current);
    }

    return [...map.values()].sort((a, b) => b.risk - a.risk);
  }, [tasks]);

  const updateTask = useCallback(
    async (
      task: GlobalImplementationTask,
      patch: Parameters<typeof patchImplementationTask>[2],
    ) => {
      setSavingTaskKey(task.taskKey);
      try {
        const result = await patchImplementationTask(task.agentId, task.id, patch);
        if (!result.ok) {
          toast.error(result.error);
          return false;
        }
        setTasks((prev) =>
          prev.map((item) =>
            item.taskKey === task.taskKey ? mergeTask(item, result.task) : item,
          ),
        );
        return true;
      } finally {
        setSavingTaskKey(null);
      }
    },
    [],
  );

  const bulkPatch = useCallback(
    async (patch: Parameters<typeof patchImplementationTask>[2], successLabel: string) => {
      if (selectedTasks.length === 0) return;
      setBulkSaving(true);
      try {
        const results = await Promise.all(
          selectedTasks.map((task) => patchImplementationTask(task.agentId, task.id, patch)),
        );
        const failures = results.filter((result) => !result.ok);
        const updates = new Map<string, ImplementationTask>();
        results.forEach((result, index) => {
          if (result.ok) updates.set(selectedTasks[index]!.taskKey, result.task);
        });
        setTasks((prev) =>
          prev.map((task) => {
            const updated = updates.get(task.taskKey);
            return updated ? mergeTask(task, updated) : task;
          }),
        );
        if (failures.length > 0) {
          toast.error(`${failures.length} tarea(s) no se pudieron actualizar`);
        } else {
          toast.success(successLabel);
          setSelectedKeys(new Set());
        }
      } finally {
        setBulkSaving(false);
      }
    },
    [selectedTasks],
  );

  const toggleAll = (checked: boolean) => {
    setSelectedKeys(checked ? new Set(tasks.map((task) => task.taskKey)) : new Set());
  };

  const selectedGrowersByEmail = useMemo(() => {
    const map = new Map<string, string>();
    if (!selectedTask) return map;
    for (const grower of selectedTask.growers) {
      map.set(grower.email.trim().toLowerCase(), grower.name);
    }
    return map;
  }, [selectedTask]);

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="truncate text-xl font-semibold tracking-tight">Tareas de implementación</h1>
          <p className="text-xs text-muted-foreground">
            {metrics.criticalToday} críticas hoy · {metrics.open} abiertas · {metrics.criticalAgents} agentes críticos
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => void loadTasks()} disabled={loading}>
          {loading ? <Loader2Icon className="mr-2 size-4 animate-spin" /> : null}
          Actualizar
        </Button>
      </div>

      <div className="rounded-2xl border bg-card p-2.5 shadow-sm">
        <div className="grid gap-3 lg:grid-cols-[minmax(220px,1fr)_repeat(4,180px)]">
          <div className="relative">
            <SearchIcon className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Buscar tarea, agente, responsable o AGT..."
              className="pl-9"
            />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Estado" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos los estados</SelectItem>
              {STATUS_ORDER.map((status) => (
                <SelectItem key={status} value={status}>
                  {STATUS_CONFIG[status].label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={priorityFilter} onValueChange={setPriorityFilter}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Prioridad" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas las prioridades</SelectItem>
              {PRIORITY_ORDER.map((priority) => (
                <SelectItem key={priority} value={priority}>
                  {PRIORITY_CONFIG[priority].label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={dueFilter} onValueChange={(value) => setDueFilter(value as DueFilter)}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Vencimiento" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Cualquier fecha</SelectItem>
              <SelectItem value="overdue">Vencidas</SelectItem>
              <SelectItem value="today">Vencen hoy</SelectItem>
              <SelectItem value="week">Vencen esta semana</SelectItem>
              <SelectItem value="none">Sin fecha</SelectItem>
            </SelectContent>
          </Select>
          <Select value={assigneeFilter} onValueChange={setAssigneeFilter}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Responsable" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              <SelectItem value="unassigned">Sin asignar</SelectItem>
              {allAssignees.map(([email, name]) => (
                <SelectItem key={email} value={email}>
                  {name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {[
          { id: "daily" as const, label: "Seguimiento diario", count: metrics.criticalToday },
          { id: "agents" as const, label: "Por agente", count: agentSummaries.length },
          { id: "table" as const, label: "Todas las tareas", count: total },
        ].map((view) => (
          <button
            key={view.id}
            type="button"
            onClick={() => setActiveView(view.id)}
            className={cn(
              "rounded-full border px-4 py-2 text-sm font-medium transition",
              activeView === view.id
                ? "border-primary bg-primary text-primary-foreground shadow-sm"
                : "bg-card text-muted-foreground hover:bg-muted/60 hover:text-foreground",
            )}
          >
            {view.label}
            <span className="ml-2 rounded-full bg-background/20 px-2 py-0.5 text-xs tabular-nums">
              {view.count}
            </span>
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex min-h-[420px] items-center justify-center gap-2 rounded-3xl border bg-card text-sm text-muted-foreground">
          <Loader2Icon className="size-4 animate-spin" />
          Cargando tareas...
        </div>
      ) : tasks.length === 0 ? (
        <div className="flex min-h-[420px] flex-col items-center justify-center gap-2 rounded-3xl border bg-card text-center">
          <CheckCircle2Icon className="size-8 text-muted-foreground/50" />
          <p className="text-sm font-medium">No hay tareas para esta vista</p>
          <p className="text-xs text-muted-foreground">Ajusta filtros o vuelve a cargar.</p>
        </div>
      ) : activeView === "daily" ? (
        <div className="grid min-h-0 gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
          <section className="rounded-3xl border bg-card p-4 shadow-sm">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold">Atender primero</p>
                <p className="text-xs text-muted-foreground">
                  Las tareas que más probablemente bloquean entrega o seguimiento.
                </p>
              </div>
              <Badge variant="outline">{focusTasks.length} visibles</Badge>
            </div>

            <div className="grid gap-3 lg:grid-cols-2">
              {focusTasks.length === 0 ? (
                <p className="rounded-2xl border border-dashed p-6 text-sm text-muted-foreground">
                  Sin tareas críticas con los filtros actuales.
                </p>
              ) : (
                focusTasks.map((task) => (
                  <button
                    key={task.taskKey}
                    type="button"
                    onClick={() => setSelectedTaskKey(task.taskKey)}
                    className="group rounded-2xl border bg-background p-4 text-left transition hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="line-clamp-2 text-base font-semibold leading-snug">{task.title}</p>
                        <p className="mt-1 truncate text-sm text-muted-foreground">{task.businessName}</p>
                      </div>
                      {isOverdue(task) ? <Badge variant="destructive">Vencida</Badge> : <TaskPriorityBadge task={task} />}
                    </div>
                    <div className="mt-4 flex flex-wrap items-center gap-2">
                      <TaskStatusBadge task={task} />
                      <Badge variant="secondary">
                        {task.assigneeEmails.length > 0
                          ? assigneeLabel(task.assigneeEmails[0]!, task.growers)
                          : "Sin asignar"}
                      </Badge>
                      <Badge variant="outline">
                        {task.dueDate ? formatDate(task.dueDate) : "Sin fecha"}
                      </Badge>
                    </div>
                  </button>
                ))
              )}
            </div>
          </section>

          <aside className="space-y-2">
            {dailyGroups.map((group) => (
              <div
                key={group.id}
                className={cn(
                  "rounded-2xl border bg-card p-3 shadow-sm",
                  group.tone === "danger" && "border-red-200 dark:border-red-950",
                  group.tone === "warning" && "border-amber-200 dark:border-amber-950",
                  group.tone === "success" && "border-emerald-200 dark:border-emerald-950",
                )}
              >
                <div className="mb-2 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold">{group.title}</p>
                    <p className="truncate text-xs text-muted-foreground">{group.description}</p>
                  </div>
                  <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold tabular-nums text-muted-foreground">
                    {group.tasks.length}
                  </span>
                </div>
                <div className="space-y-2">
                  {group.tasks.length === 0 ? (
                    <p className="text-xs text-muted-foreground">Sin tareas.</p>
                  ) : (
                    group.tasks.slice(0, 3).map((task) => (
                      <button
                        key={task.taskKey}
                        type="button"
                        onClick={() => setSelectedTaskKey(task.taskKey)}
                        className="w-full rounded-xl bg-muted/40 px-3 py-2 text-left transition hover:bg-muted"
                      >
                        <p className="truncate text-sm font-medium">{task.title}</p>
                        <p className="truncate text-xs text-muted-foreground">{task.businessName}</p>
                      </button>
                    ))
                  )}
                </div>
              </div>
            ))}
          </aside>
        </div>
      ) : activeView === "agents" ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {agentSummaries.map((agent) => {
            const totalAgentTasks = agent.tasks.length;
            const progress = totalAgentTasks > 0 ? Math.round((agent.completed / totalAgentTasks) * 100) : 0;
            return (
              <div key={agent.agentId} className="rounded-3xl border bg-card p-4 shadow-sm">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-base font-semibold">{agent.businessName}</p>
                    <p className="truncate text-sm text-muted-foreground">{agent.agentName}</p>
                  </div>
                  <Button variant="outline" size="sm" asChild>
                    <Link href={`/agents/${encodeURIComponent(agent.agentId)}/tasks`}>
                      Abrir
                    </Link>
                  </Button>
                </div>
                <div className="mt-4 h-2 overflow-hidden rounded-full bg-muted">
                  <div className="h-full rounded-full bg-primary" style={{ width: `${progress}%` }} />
                </div>
                <div className="mt-4 grid grid-cols-4 gap-2 text-center">
                  <div className="rounded-xl bg-muted/50 p-2">
                    <p className="text-lg font-semibold tabular-nums">{agent.open}</p>
                    <p className="text-[10px] uppercase text-muted-foreground">Abiertas</p>
                  </div>
                  <div className="rounded-xl bg-red-500/10 p-2">
                    <p className="text-lg font-semibold tabular-nums">{agent.overdue}</p>
                    <p className="text-[10px] uppercase text-muted-foreground">Vencidas</p>
                  </div>
                  <div className="rounded-xl bg-amber-500/10 p-2">
                    <p className="text-lg font-semibold tabular-nums">{agent.blocked}</p>
                    <p className="text-[10px] uppercase text-muted-foreground">Bloq.</p>
                  </div>
                  <div className="rounded-xl bg-muted/50 p-2">
                    <p className="text-lg font-semibold tabular-nums">{agent.unassigned}</p>
                    <p className="text-[10px] uppercase text-muted-foreground">Sin resp.</p>
                  </div>
                </div>
                <div className="mt-4 space-y-2">
                  {agent.tasks.filter((task) => !isClosed(task)).slice(0, 3).map((task) => (
                    <button
                      key={task.taskKey}
                      type="button"
                      onClick={() => setSelectedTaskKey(task.taskKey)}
                      className="flex w-full items-center justify-between gap-2 rounded-xl border px-3 py-2 text-left text-sm hover:bg-muted/50"
                    >
                      <span className="truncate">{task.title}</span>
                      <TaskStatusBadge task={task} />
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <section className="flex min-h-0 flex-col rounded-3xl border bg-card shadow-sm">
          <div className="flex flex-col gap-3 border-b p-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-sm font-semibold">Todas las tareas</p>
              <p className="text-xs text-muted-foreground">
                Mostrando {tasks.length} de {total} tarea(s). Usa esta vista para cambios en lote.
              </p>
            </div>

            {selectedKeys.size > 0 && (
              <div className="flex flex-wrap items-center gap-2 rounded-2xl border bg-muted/40 px-3 py-2">
                <span className="text-xs font-medium">{selectedKeys.size} seleccionada(s)</span>
                <Select
                  onValueChange={(value) =>
                    void bulkPatch({ status: value as ImplementationTaskStatus }, "Estados actualizados")
                  }
                  disabled={bulkSaving}
                >
                  <SelectTrigger size="sm" className="h-7 w-[150px] bg-background">
                    <SelectValue placeholder="Estado" />
                  </SelectTrigger>
                  <SelectContent>
                    {STATUS_ORDER.map((status) => (
                      <SelectItem key={status} value={status}>
                        {STATUS_CONFIG[status].label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select
                  onValueChange={(value) =>
                    void bulkPatch({ priority: value as ImplementationTaskPriority }, "Prioridades actualizadas")
                  }
                  disabled={bulkSaving}
                >
                  <SelectTrigger size="sm" className="h-7 w-[150px] bg-background">
                    <SelectValue placeholder="Prioridad" />
                  </SelectTrigger>
                  <SelectContent>
                    {PRIORITY_ORDER.map((priority) => (
                      <SelectItem key={priority} value={priority}>
                        {PRIORITY_CONFIG[priority].label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select
                  onValueChange={(value) =>
                    void bulkPatch({ assigneeEmails: value === "unassigned" ? [] : [value] }, "Responsables actualizados")
                  }
                  disabled={bulkSaving}
                >
                  <SelectTrigger size="sm" className="h-7 w-[170px] bg-background">
                    <SelectValue placeholder="Reasignar" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="unassigned">Quitar asignados</SelectItem>
                    {allAssignees.map(([email, name]) => (
                      <SelectItem key={email} value={email}>
                        {name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7"
                  onClick={() => setSelectedKeys(new Set())}
                >
                  Limpiar
                </Button>
              </div>
            )}
          </div>

          <div className="min-h-0 flex-1 overflow-auto">
            <Table>
                <TableHeader className="sticky top-0 z-10 bg-card">
                  <TableRow>
                    <TableHead className="w-10">
                      <Checkbox
                        checked={selectedKeys.size === tasks.length && tasks.length > 0}
                        onCheckedChange={(value) => toggleAll(Boolean(value))}
                        aria-label="Seleccionar todas"
                      />
                    </TableHead>
                    <TableHead>Tarea</TableHead>
                    <TableHead>Agente</TableHead>
                    <TableHead>Responsable</TableHead>
                    <TableHead>Estado</TableHead>
                    <TableHead>Prioridad</TableHead>
                    <TableHead>Vence</TableHead>
                    <TableHead className="w-20" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {tasks.map((task) => {
                    const status = normalizeStatus(task.status);
                    const priority = task.priority ?? "none";
                    const isSaving = savingTaskKey === task.taskKey;
                    return (
                      <TableRow key={task.taskKey} data-state={selectedKeys.has(task.taskKey) ? "selected" : undefined}>
                        <TableCell>
                          <Checkbox
                            checked={selectedKeys.has(task.taskKey)}
                            onCheckedChange={(value) => {
                              setSelectedKeys((prev) => {
                                const next = new Set(prev);
                                if (value) next.add(task.taskKey);
                                else next.delete(task.taskKey);
                                return next;
                              });
                            }}
                            aria-label={`Seleccionar ${task.title}`}
                          />
                        </TableCell>
                        <TableCell className="min-w-[260px]">
                          <button
                            type="button"
                            className="text-left"
                            onClick={() => setSelectedTaskKey(task.taskKey)}
                          >
                            <span className="block text-sm font-medium leading-snug">{task.title}</span>
                            <span className="mt-0.5 block text-xs text-muted-foreground">
                              {task.publicId != null ? `AGT-${task.publicId}` : task.id}
                            </span>
                          </button>
                        </TableCell>
                        <TableCell className="min-w-[190px]">
                          <div className="space-y-0.5">
                            <Link
                              href={`/agents/${encodeURIComponent(task.agentId)}/tasks`}
                              className="inline-flex items-center gap-1 text-sm font-medium hover:underline"
                            >
                              {task.businessName}
                              <ExternalLinkIcon className="size-3" />
                            </Link>
                            <p className="text-xs text-muted-foreground">{task.agentName}</p>
                          </div>
                        </TableCell>
                        <TableCell className="min-w-[170px]">
                          <Select
                            value={task.assigneeEmails[0] ?? "unassigned"}
                            disabled={isSaving}
                            onValueChange={(value) =>
                              void updateTask(task, {
                                assigneeEmails: value === "unassigned" ? [] : [value],
                              })
                            }
                          >
                            <SelectTrigger size="sm" className="h-8 w-[160px]">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="unassigned">Sin asignar</SelectItem>
                              {task.growers.map((grower) => (
                                <SelectItem key={grower.email} value={grower.email}>
                                  {grower.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </TableCell>
                        <TableCell>
                          <Select
                            value={status}
                            disabled={isSaving}
                            onValueChange={(value) =>
                              void updateTask(task, { status: value as ImplementationTaskStatus })
                            }
                          >
                            <SelectTrigger size="sm" className="h-8 w-[140px]">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {STATUS_ORDER.map((item) => (
                                <SelectItem key={item} value={item}>
                                  {STATUS_CONFIG[item].label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </TableCell>
                        <TableCell>
                          <Select
                            value={priority}
                            disabled={isSaving}
                            onValueChange={(value) =>
                              void updateTask(task, { priority: value as ImplementationTaskPriority })
                            }
                          >
                            <SelectTrigger size="sm" className="h-8 w-[130px]">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {PRIORITY_ORDER.map((item) => (
                                <SelectItem key={item} value={item}>
                                  {PRIORITY_CONFIG[item].label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </TableCell>
                        <TableCell className="min-w-[140px]">
                          <input
                            type="date"
                            defaultValue={toDateInputValue(task.dueDate)}
                            onBlur={(event) =>
                              void updateTask(task, {
                                dueDate: toIsoFromDateInput(event.currentTarget.value),
                              })
                            }
                            className={cn(
                              "h-8 rounded-md border border-input bg-background px-2 text-xs",
                              isOverdue(task) && "border-red-300 text-red-600",
                            )}
                          />
                        </TableCell>
                        <TableCell>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8"
                            onClick={() => setSelectedTaskKey(task.taskKey)}
                          >
                            Abrir
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
          </div>
        </section>
      )}

      <Sheet open={selectedTask !== null} onOpenChange={(open) => { if (!open) setSelectedTaskKey(null); }}>
        <SheetContent side="right" className="flex w-full flex-col gap-0 p-0 sm:max-w-2xl">
          {selectedTask && (
            <>
              <SheetTitle className="sr-only">{selectedTask.title}</SheetTitle>
              <SheetDescription className="sr-only">Detalle global de tarea</SheetDescription>
              <div className="border-b px-6 py-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-xs font-mono text-muted-foreground">
                      {selectedTask.publicId != null ? `AGT-${selectedTask.publicId}` : selectedTask.id}
                    </p>
                    <h2 className="mt-1 text-xl font-semibold leading-tight">{selectedTask.title}</h2>
                    <Link
                      href={`/agents/${encodeURIComponent(selectedTask.agentId)}/tasks`}
                      className="mt-1 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground hover:underline"
                    >
                      {selectedTask.businessName}
                      <ExternalLinkIcon className="size-3.5" />
                    </Link>
                  </div>
                </div>
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
                <div className="space-y-5">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="rounded-xl border p-3">
                      <p className="mb-2 text-xs font-medium text-muted-foreground">Estado</p>
                      <Select
                        value={normalizeStatus(selectedTask.status)}
                        onValueChange={(value) =>
                          void updateTask(selectedTask, { status: value as ImplementationTaskStatus })
                        }
                      >
                        <SelectTrigger className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {STATUS_ORDER.map((status) => (
                            <SelectItem key={status} value={status}>
                              {STATUS_CONFIG[status].label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="rounded-xl border p-3">
                      <p className="mb-2 text-xs font-medium text-muted-foreground">Prioridad</p>
                      <Select
                        value={selectedTask.priority ?? "none"}
                        onValueChange={(value) =>
                          void updateTask(selectedTask, { priority: value as ImplementationTaskPriority })
                        }
                      >
                        <SelectTrigger className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {PRIORITY_ORDER.map((priority) => (
                            <SelectItem key={priority} value={priority}>
                              {PRIORITY_CONFIG[priority].label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="rounded-xl border p-3">
                      <p className="mb-2 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                        <CalendarClockIcon className="size-3.5" />
                        Vencimiento
                      </p>
                      <input
                        type="date"
                        defaultValue={toDateInputValue(selectedTask.dueDate)}
                        onBlur={(event) =>
                          void updateTask(selectedTask, {
                            dueDate: toIsoFromDateInput(event.currentTarget.value),
                          })
                        }
                        className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
                      />
                    </div>
                    <div className="rounded-xl border p-3">
                      <p className="mb-2 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                        <UsersIcon className="size-3.5" />
                        Responsable
                      </p>
                      <Select
                        value={selectedTask.assigneeEmails[0] ?? "unassigned"}
                        onValueChange={(value) =>
                          void updateTask(selectedTask, {
                            assigneeEmails: value === "unassigned" ? [] : [value],
                          })
                        }
                      >
                        <SelectTrigger className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="unassigned">Sin asignar</SelectItem>
                          {selectedTask.growers.map((grower) => (
                            <SelectItem key={grower.email} value={grower.email}>
                              {grower.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="rounded-xl border p-4">
                    <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Descripción
                    </p>
                    <p className="whitespace-pre-wrap text-sm text-foreground">
                      {selectedTask.description?.trim() || "Sin descripción."}
                    </p>
                  </div>

                  {(selectedTask.attachments?.length ?? 0) > 0 && (
                    <div className="rounded-xl border p-4">
                      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        Archivos
                      </p>
                      <AttachmentList attachments={selectedTask.attachments ?? []} />
                    </div>
                  )}

                  <div className="rounded-xl border p-4">
                    <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Subtareas cargadas
                    </p>
                    {tasks.filter((task) => task.agentId === selectedTask.agentId && task.parentTaskId === selectedTask.id).length === 0 ? (
                      <p className="text-sm text-muted-foreground">Sin subtareas en la vista actual.</p>
                    ) : (
                      <div className="space-y-1">
                        {tasks
                          .filter((task) => task.agentId === selectedTask.agentId && task.parentTaskId === selectedTask.id)
                          .map((subtask) => (
                            <button
                              key={subtask.taskKey}
                              type="button"
                              onClick={() => setSelectedTaskKey(subtask.taskKey)}
                              className="flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted"
                            >
                              <span>{subtask.title}</span>
                              <Badge variant="outline">{STATUS_CONFIG[normalizeStatus(subtask.status)].label}</Badge>
                            </button>
                          ))}
                      </div>
                    )}
                  </div>

                  <div className="rounded-xl border p-4">
                    <TaskComments
                      agentId={selectedTask.agentId}
                      taskId={selectedTask.id}
                      growers={selectedTask.growers}
                      growersByEmail={selectedGrowersByEmail}
                    />
                  </div>

                  <p className="text-xs text-muted-foreground">
                    Actualizada {formatDateTime(selectedTask.updatedAt)} · Responsable:{" "}
                    {selectedTask.assigneeEmails.length > 0
                      ? selectedTask.assigneeEmails.map((email) => assigneeLabel(email, selectedTask.growers)).join(", ")
                      : "Sin asignar"}
                  </p>
                </div>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
