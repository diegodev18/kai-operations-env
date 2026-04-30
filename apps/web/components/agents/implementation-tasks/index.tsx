"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { PlusIcon } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import type {
  AgentGrowerRow,
  ImplementationTask,
  ImplementationTaskAttachment,
  WhatsappIntegrationStatusItem,
} from "@/types";
import type { AgentBilling } from "@/lib/agents/agent";
import {
  fetchAgentBilling,
  fetchAgentGrowers,
  fetchImplementationTasks,
  fetchWhatsappIntegrationStatus,
  patchAgentBillingConfig,
  patchImplementationTask,
} from "@/services/agents-api";
import { useUserRole } from "@/hooks";
import { PanelError, PanelLoading } from "@/components/agents/panel-states";

import {
  isOperationsRole,
  paymentDomiciliationShouldComplete,
  toDateInputValue,
  toIsoFromDateInput,
  MANDATORY_TASK_TYPES,
} from "./constants";
import { TaskList } from "./task-list";
import { CreateTaskDialog } from "./create-task-dialog";
import { TaskDetailSheet } from "./task-detail-sheet";

export function AgentImplementationTasksPanel({
  agentId,
}: {
  agentId: string;
}) {
  const { role: userRole } = useUserRole();
  const isOperations = isOperationsRole(userRole);

  // ── Data state ────────────────────────────────────────────────────────────
  const [tasks, setTasks] = useState<ImplementationTask[]>([]);
  const tasksRef = useRef<ImplementationTask[]>([]);
  tasksRef.current = tasks;
  const [growers, setGrowers] = useState<AgentGrowerRow[]>([]);
  const [agentBilling, setAgentBilling] = useState<AgentBilling | null>(null);
  const [waIntegrations, setWaIntegrations] = useState<
    WhatsappIntegrationStatusItem[]
  >([]);

  // ── UI state ─────────────────────────────────────────────────────────────
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [savingTaskId, setSavingTaskId] = useState<string | null>(null);
  const [billingLoading, setBillingLoading] = useState(false);
  const [billingSaving, setBillingSaving] = useState(false);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);

  // ── Per-task draft state ──────────────────────────────────────────────────
  const [taskDueDates, setTaskDueDates] = useState<Record<string, string>>({});
  const [taskAssignees, setTaskAssignees] = useState<Record<string, string[]>>({});
  const [repDraft, setRepDraft] = useState<
    Record<string, { email: string; phone: string }>
  >({});

  // ── Load data ─────────────────────────────────────────────────────────────
  const loadData = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const [tasksRes, growersRes] = await Promise.all([
        fetchImplementationTasks(agentId),
        fetchAgentGrowers(agentId),
      ]);
      if (tasksRes == null || growersRes == null) {
        setLoadError(
          "No se pudieron cargar las tareas. Verifica tu conexión e intenta de nuevo.",
        );
        return;
      }
      setTasks(Array.isArray(tasksRes.tasks) ? tasksRes.tasks : []);
      setGrowers(Array.isArray(growersRes.growers) ? growersRes.growers : []);
    } catch {
      setLoadError("Error inesperado al cargar las tareas.");
    } finally {
      setLoading(false);
    }
  }, [agentId]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  // Sync per-task drafts when tasks change
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

  useEffect(() => {
    setRepDraft((prev) => {
      const next = { ...prev };
      for (const t of tasks) {
        if (t.taskType !== "representative-contact") continue;
        if (next[t.id] === undefined) {
          next[t.id] = {
            email: t.representativeEmail ?? "",
            phone: t.representativePhone ?? "",
          };
        }
      }
      return next;
    });
  }, [tasks]);

  // Load billing for operations users
  useEffect(() => {
    if (!isOperations || !agentId) return;
    let cancelled = false;
    setBillingLoading(true);
    void (async () => {
      const res = await fetchAgentBilling(agentId);
      if (cancelled) return;
      setAgentBilling(res?.billing ?? null);
      setBillingLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [agentId, isOperations]);

  // Auto-sync payment-domiciliation task status from billing
  const paymentDomiciliationTask = useMemo(
    () => tasks.find((t) => t.id === "mandatory-payment-domiciliation"),
    [tasks],
  );

  useEffect(() => {
    if (!isOperations || !agentBilling || !paymentDomiciliationTask) return;
    const wantStatus = paymentDomiciliationShouldComplete(agentBilling)
      ? "completed"
      : "pending";
    if (paymentDomiciliationTask.status === wantStatus) return;
    let cancelled = false;
    const taskId = paymentDomiciliationTask.id;
    void (async () => {
      const r = await patchImplementationTask(agentId, taskId, {
        status: wantStatus,
      });
      if (!cancelled && r.ok) {
        setTasks((prev) => prev.map((t) => (t.id === taskId ? r.task : t)));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [
    agentId,
    isOperations,
    agentBilling,
    paymentDomiciliationTask?.id,
    paymentDomiciliationTask?.status,
  ]);

  // Poll WhatsApp integration status every 30s
  useEffect(() => {
    if (!agentId) return;
    let cancelled = false;
    const poll = async () => {
      const res = await fetchWhatsappIntegrationStatus(agentId);
      if (cancelled || !res) return;
      setWaIntegrations(res.items);
      const connectTask = tasksRef.current.find(
        (t) => t.taskType === "connect-number",
      );
      if (
        connectTask?.status === "pending" &&
        res.items.some((i) => i.setupStatus === "completed")
      ) {
        const r = await patchImplementationTask(agentId, connectTask.id, {
          status: "completed",
        });
        if (!cancelled && r.ok) {
          setTasks((prev) =>
            prev.map((t) => (t.id === connectTask.id ? r.task : t)),
          );
        }
      }
    };
    void poll();
    const id = window.setInterval(poll, 30_000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [agentId]);

  // ── Computed ──────────────────────────────────────────────────────────────
  const growersByEmail = useMemo(() => {
    const map = new Map<string, string>();
    for (const g of growers) {
      map.set(g.email.trim().toLowerCase(), g.name);
    }
    return map;
  }, [growers]);

  // All tasks in display order for prev/next navigation in the sheet
  const orderedTasks = useMemo(() => {
    const mandatory = tasks.filter(
      (t) => t.mandatory || (t.taskType && MANDATORY_TASK_TYPES.has(t.taskType ?? "")),
    );
    const customPending = tasks
      .filter(
        (t) =>
          !t.mandatory &&
          !(t.taskType && MANDATORY_TASK_TYPES.has(t.taskType ?? "")) &&
          t.status === "pending",
      )
      .sort((a, b) => {
        const aTime = a.dueDate ? new Date(a.dueDate).getTime() : Number.MAX_SAFE_INTEGER;
        const bTime = b.dueDate ? new Date(b.dueDate).getTime() : Number.MAX_SAFE_INTEGER;
        return aTime - bTime;
      });
    const customCompleted = tasks
      .filter(
        (t) =>
          !t.mandatory &&
          !(t.taskType && MANDATORY_TASK_TYPES.has(t.taskType ?? "")) &&
          t.status === "completed",
      )
      .sort((a, b) => {
        const aTime = a.updatedAt ? new Date(a.updatedAt).getTime() : 0;
        const bTime = b.updatedAt ? new Date(b.updatedAt).getTime() : 0;
        return bTime - aTime;
      });
    return [...mandatory, ...customPending, ...customCompleted];
  }, [tasks]);

  const selectedTask = useMemo(
    () => (selectedTaskId ? (tasks.find((t) => t.id === selectedTaskId) ?? null) : null),
    [selectedTaskId, tasks],
  );

  // ── Actions ───────────────────────────────────────────────────────────────
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
          return { ...t, attachments: [...(t.attachments ?? []), attachment] };
        }),
      );
      void patchImplementationTask(agentId, taskId, {
        attachments: [
          ...(tasksRef.current.find((t) => t.id === taskId)?.attachments ?? []),
          attachment,
        ],
      });
    },
    [agentId],
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
        attachments:
          tasksRef.current
            .find((t) => t.id === taskId)
            ?.attachments?.filter((_, i) => i !== index) ?? [],
      });
    },
    [agentId],
  );

  const onBillingDomiciliatedChange = useCallback(
    async (value: boolean | null) => {
      if (!isOperations) return;
      setBillingSaving(true);
      try {
        const r = await patchAgentBillingConfig(agentId, { domiciliated: value });
        if (!r.ok) {
          toast.error(r.error);
          return;
        }
        const fresh = await fetchAgentBilling(agentId);
        if (fresh?.billing) setAgentBilling(fresh.billing);
        toast.success("Cobranza actualizada");
      } finally {
        setBillingSaving(false);
      }
    },
    [agentId, isOperations],
  );

  const onSaveRepresentative = useCallback(
    async (taskId: string) => {
      const draft = repDraft[taskId];
      if (!draft) return;
      setSavingTaskId(taskId);
      try {
        const email = draft.email.trim().toLowerCase();
        const phone = draft.phone.trim();
        const result = await patchImplementationTask(agentId, taskId, {
          representativeEmail: email.length > 0 ? email : null,
          representativePhone: phone.length > 0 ? phone : null,
        });
        if (!result.ok) {
          toast.error(result.error);
          return;
        }
        setTasks((prev) => prev.map((t) => (t.id === taskId ? result.task : t)));
        setRepDraft((prev) => ({
          ...prev,
          [taskId]: {
            email: result.task.representativeEmail ?? "",
            phone: result.task.representativePhone ?? "",
          },
        }));
        toast.success("Datos guardados");
      } finally {
        setSavingTaskId(null);
      }
    },
    [agentId, repDraft],
  );

  const onTaskCreated = useCallback((task: ImplementationTask) => {
    setTasks((prev) => [task, ...prev]);
    setSelectedTaskId(task.id);
  }, []);

  // ── Render ────────────────────────────────────────────────────────────────
  if (loading) return <PanelLoading />;
  if (loadError) {
    return <PanelError message={loadError} onRetry={() => void loadData()} />;
  }

  return (
    <div className="space-y-4 p-4 sm:p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-foreground">Tareas</h2>
        <Button
          size="sm"
          variant="outline"
          className="h-7 gap-1.5 text-xs"
          onClick={() => setCreateDialogOpen(true)}
        >
          <PlusIcon className="size-3.5" />
          Nueva tarea
        </Button>
      </div>

      {/* Task list */}
      <TaskList
        tasks={tasks}
        selectedTaskId={selectedTaskId}
        savingTaskId={savingTaskId}
        growers={growers}
        onSelect={setSelectedTaskId}
        onToggleStatus={onToggleTaskStatus}
      />

      {/* Create task dialog */}
      <CreateTaskDialog
        open={createDialogOpen}
        onOpenChange={setCreateDialogOpen}
        agentId={agentId}
        growers={growers}
        onCreated={onTaskCreated}
      />

      {/* Task detail sheet */}
      <TaskDetailSheet
        task={selectedTask}
        allTasks={orderedTasks}
        agentId={agentId}
        growers={growers}
        growersByEmail={growersByEmail}
        taskDueDates={taskDueDates}
        taskAssignees={taskAssignees}
        repDraft={repDraft}
        agentBilling={agentBilling}
        billingLoading={billingLoading}
        billingSaving={billingSaving}
        waIntegrations={waIntegrations}
        isOperations={isOperations}
        savingTaskId={savingTaskId}
        onClose={() => setSelectedTaskId(null)}
        onNavigate={setSelectedTaskId}
        onToggleStatus={onToggleTaskStatus}
        onSaveDueDate={onSaveTaskDueDate}
        onToggleAssignee={onToggleTaskAssignee}
        onSaveAssignees={onSaveTaskAssignees}
        onFileUploaded={onFileUploaded}
        onRemoveAttachment={onRemoveAttachment}
        onSaveRepresentative={onSaveRepresentative}
        onBillingDomiciliatedChange={onBillingDomiciliatedChange}
        setTaskDueDates={setTaskDueDates}
        setRepDraft={setRepDraft}
      />
    </div>
  );
}
