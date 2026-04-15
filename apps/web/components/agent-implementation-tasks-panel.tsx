"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
  UserCircleIcon,
  MessageSquareIcon,
  Settings2Icon,
  ArrowDownWideNarrowIcon,
  ArrowUpWideNarrowIcon,
  FilterIcon,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
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
  ImplementationActivityEntry,
  ImplementationTask,
  ImplementationTaskAttachment,
  WhatsappIntegrationStatusItem,
} from "@/types/agents-api";
import type { AgentBilling } from "@/lib/agent";
import {
  createImplementationActivityComment,
  createImplementationTask,
  fetchAgentBilling,
  fetchAgentGrowers,
  fetchImplementationActivity,
  fetchImplementationTasks,
  fetchWhatsappIntegrationStatus,
  patchAgentBillingConfig,
  patchImplementationTask,
} from "@/lib/agents-api";
import {
  FileUploadButton,
  AttachmentList,
} from "@/components/file-upload-button";
import { ImplementationActivityCommentEditor } from "@/components/implementation-activity-comment-editor";
import { useUserRole } from "@/hooks/useUserRole";

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
  "representative-contact",
]);

/** Tareas donde el entregable es un archivo adjunto. */
const TASK_TYPES_WITH_ATTACHMENTS = new Set(["quote-sent", "csf-request"]);

const TASK_TYPE_CONFIG: Record<
  string,
  {
    icon: React.ElementType;
    badge?: string;
    badgeVariant?: "default" | "secondary" | "outline";
  }
> = {
  "connect-number": { icon: PhoneIcon },
  "csf-request": {
    icon: FileTextIcon,
    badge: "CSF",
    badgeVariant: "default" as const,
  },
  "payment-domiciliation": {
    icon: CreditCardIcon,
    badge: "Cobranza",
    badgeVariant: "secondary" as const,
  },
  "quote-sent": {
    icon: SendIcon,
    badge: "Cotización",
    badgeVariant: "outline" as const,
  },
  "representative-contact": {
    icon: UserCircleIcon,
    badge: "Contacto",
    badgeVariant: "outline" as const,
  },
};

function paymentDomiciliationShouldComplete(billing: AgentBilling): boolean {
  if (billing.domiciliated) return true;
  return Boolean(billing.paymentDueDate);
}

function isOperationsRole(role: string): boolean {
  const r = role.toLowerCase();
  return r === "admin" || r === "commercial";
}

function formatDateTime(iso?: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("es-MX", {
    dateStyle: "short",
    timeStyle: "short",
  });
}

function actorLabel(
  email: string | null | undefined,
  growersByEmail: Map<string, string>,
): string {
  if (!email) return "Sistema";
  const norm = email.trim().toLowerCase();
  return growersByEmail.get(norm) ?? norm;
}

export function AgentImplementationTasksPanel({
  agentId,
}: {
  agentId: string;
}) {
  const { role: userRole } = useUserRole();
  const isOperations = isOperationsRole(userRole);

  const [tasks, setTasks] = useState<ImplementationTask[]>([]);
  const tasksRef = useRef<ImplementationTask[]>([]);
  tasksRef.current = tasks;
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
  const [taskAssignees, setTaskAssignees] = useState<Record<string, string[]>>(
    {},
  );
  const [mandatoryCollapsed, setMandatoryCollapsed] = useState(true);
  const [agentBilling, setAgentBilling] = useState<AgentBilling | null>(null);
  const [billingLoading, setBillingLoading] = useState(false);
  const [billingSaving, setBillingSaving] = useState(false);
  const [waIntegrations, setWaIntegrations] = useState<
    WhatsappIntegrationStatusItem[]
  >([]);
  const [repDraft, setRepDraft] = useState<
    Record<string, { email: string; phone: string }>
  >({});
  const [activity, setActivity] = useState<ImplementationActivityEntry[]>([]);
  const [activityFilter, setActivityFilter] = useState<
    "all" | "comment" | "system"
  >("all");
  const [activitySortDesc, setActivitySortDesc] = useState(true);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [tasksRes, growersRes, activityRes] = await Promise.all([
        fetchImplementationTasks(agentId),
        fetchAgentGrowers(agentId),
        fetchImplementationActivity(agentId),
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
      if (activityRes == null) {
        toast.error("No se pudo cargar la bitácora");
        setActivity([]);
      } else {
        setActivity(
          Array.isArray(activityRes.entries) ? activityRes.entries : [],
        );
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

  useEffect(() => {
    if (!isOperations || !agentId) return;
    let cancelled = false;
    setBillingLoading(true);
    void (async () => {
      const res = await fetchAgentBilling(agentId);
      if (cancelled) return;
      if (res?.billing) {
        setAgentBilling(res.billing);
      } else {
        setAgentBilling(null);
      }
      setBillingLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [agentId, isOperations]);

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

  const growersByEmail = useMemo(() => {
    const map = new Map<string, string>();
    for (const g of growers) {
      map.set(g.email.trim().toLowerCase(), g.name);
    }
    return map;
  }, [growers]);

  const mandatoryTasks = useMemo(
    () =>
      tasks.filter(
        (t) =>
          t.mandatory || (t.taskType && MANDATORY_TASK_TYPES.has(t.taskType)),
      ),
    [tasks],
  );

  const mandatoryProgress = useMemo(() => {
    const completed = mandatoryTasks.filter(
      (t) => t.status === "completed",
    ).length;
    return { completed, total: mandatoryTasks.length };
  }, [mandatoryTasks]);

  const customTasks = useMemo(
    () =>
      tasks
        .filter(
          (t) =>
            !t.mandatory &&
            !(t.taskType && MANDATORY_TASK_TYPES.has(t.taskType)),
        )
        .sort((a, b) => {
          if (a.status !== b.status) return a.status === "pending" ? -1 : 1;
          const aTime = a.dueDate
            ? new Date(a.dueDate).getTime()
            : Number.MAX_SAFE_INTEGER;
          const bTime = b.dueDate
            ? new Date(b.dueDate).getTime()
            : Number.MAX_SAFE_INTEGER;
          return aTime - bTime;
        }),
    [tasks],
  );

  const filteredActivity = useMemo(() => {
    const list =
      activityFilter === "all"
        ? [...activity]
        : activity.filter((e) => e.kind === activityFilter);
    list.sort((a, b) => {
      const ta = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const tb = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      return activitySortDesc ? tb - ta : ta - tb;
    });
    return list;
  }, [activity, activityFilter, activitySortDesc]);

  const toggleAssigneeForCreate = useCallback(
    (email: string, checked: boolean) => {
      const normalized = email.trim().toLowerCase();
      setAssigneeEmails((prev) => {
        if (checked)
          return prev.includes(normalized) ? prev : [...prev, normalized];
        return prev.filter((e) => e !== normalized);
      });
    },
    [],
  );

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
        attachments:
          createAttachments.length > 0 ? createAttachments : undefined,
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
        setTasks((prev) =>
          prev.map((t) => (t.id === task.id ? result.task : t)),
        );
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
        setTasks((prev) =>
          prev.map((t) => (t.id === taskId ? result.task : t)),
        );
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
        setTasks((prev) =>
          prev.map((t) => (t.id === taskId ? result.task : t)),
        );
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
        attachments: [
          ...(tasks.find((t) => t.id === taskId)?.attachments ?? []),
          attachment,
        ],
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
        attachments:
          tasks
            .find((t) => t.id === taskId)
            ?.attachments?.filter((_, i) => i !== index) ?? [],
      });
    },
    [agentId, tasks],
  );

  const onBillingDomiciliatedChange = useCallback(
    async (checked: boolean) => {
      if (!isOperations) return;
      setBillingSaving(true);
      try {
        const r = await patchAgentBillingConfig(agentId, {
          domiciliated: checked,
        });
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

  const onPublishComment = useCallback(
    async (bodyHtml: string) => {
      const result = await createImplementationActivityComment(
        agentId,
        bodyHtml,
      );
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      setActivity((prev) => [result.entry, ...prev]);
      toast.success("Comentario publicado");
    },
    [agentId],
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
        setTasks((prev) =>
          prev.map((t) => (t.id === taskId ? result.task : t)),
        );
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
            Checklist obligatorios
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
            const config = task.taskType
              ? TASK_TYPE_CONFIG[task.taskType]
              : null;
            const Icon = config?.icon ?? FileTextIcon;
            const showUpload =
              Boolean(task.taskType) &&
              TASK_TYPES_WITH_ATTACHMENTS.has(task.taskType!);
            const checkboxDisabled =
              isSaving || task.taskType === "payment-domiciliation";
            const primaryWa = waIntegrations[0];
            const draft = repDraft[task.id] ?? { email: "", phone: "" };

            if (task.taskType === "representative-contact") {
              return (
                <div
                  key={task.id}
                  className="flex flex-col gap-3 rounded-lg border px-3 py-2.5 transition-colors hover:bg-muted/50"
                >
                  <div className="flex flex-wrap items-start gap-3">
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
                      {task.status === "completed" && (
                        <CheckIcon className="size-3.5" />
                      )}
                    </button>
                    <Icon className="size-4 shrink-0 text-muted-foreground" />
                    <div className="min-w-0 flex-1 space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-medium text-foreground">
                          {task.title}
                        </span>
                        {config?.badge ? (
                          <Badge
                            variant={config.badgeVariant ?? "outline"}
                            className="shrink-0 text-[10px]"
                          >
                            {config.badge}
                          </Badge>
                        ) : null}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Indica al menos un medio de contacto y guarda antes de
                        marcar como hecha.
                      </p>
                      <div className="grid gap-2 sm:grid-cols-2">
                        <Input
                          type="email"
                          autoComplete="email"
                          placeholder="Correo del representante"
                          value={draft.email}
                          onChange={(e) =>
                            setRepDraft((prev) => ({
                              ...prev,
                              [task.id]: {
                                email: e.target.value,
                                phone: prev[task.id]?.phone ?? "",
                              },
                            }))
                          }
                        />
                        <Input
                          type="tel"
                          autoComplete="tel"
                          placeholder="WhatsApp o teléfono"
                          value={draft.phone}
                          onChange={(e) =>
                            setRepDraft((prev) => ({
                              ...prev,
                              [task.id]: {
                                email: prev[task.id]?.email ?? "",
                                phone: e.target.value,
                              },
                            }))
                          }
                        />
                      </div>
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        disabled={isSaving}
                        onClick={() => void onSaveRepresentative(task.id)}
                      >
                        Guardar datos
                      </Button>
                    </div>
                  </div>
                </div>
              );
            }

            return (
              <div
                key={task.id}
                className="flex flex-col gap-2 rounded-lg border px-3 py-2.5 transition-colors hover:bg-muted/50"
              >
                <div className="flex flex-wrap items-start gap-3">
                  <button
                    type="button"
                    disabled={checkboxDisabled}
                    title={
                      task.taskType === "payment-domiciliation"
                        ? "El estado se sincroniza con la cobranza (Home)"
                        : undefined
                    }
                    onClick={() => void onToggleTaskStatus(task)}
                    className={`flex size-6 shrink-0 items-center justify-center rounded border-2 transition-colors ${
                      task.status === "completed"
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-muted-foreground/30 hover:border-primary"
                    } ${checkboxDisabled ? "cursor-not-allowed opacity-60" : ""}`}
                  >
                    {task.status === "completed" && (
                      <CheckIcon className="size-3.5" />
                    )}
                  </button>

                  <Icon className="size-4 shrink-0 text-muted-foreground" />

                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={`text-sm ${
                          task.status === "completed"
                            ? "text-muted-foreground line-through"
                            : "text-foreground"
                        }`}
                      >
                        {task.title}
                      </span>
                      {config?.badge ? (
                        <Badge
                          variant={config.badgeVariant ?? "outline"}
                          className="shrink-0 text-[10px]"
                        >
                          {config.badge}
                        </Badge>
                      ) : null}
                    </div>
                    {task.taskType === "connect-number" && primaryWa ? (
                      <p className="text-xs text-muted-foreground">
                        Detectado:{" "}
                        <span className="font-medium text-foreground">
                          {primaryWa.formattedPhoneNumber ??
                            primaryWa.phoneNumber ??
                            "—"}
                        </span>
                        {primaryWa.setupStatus ? (
                          <span className="text-muted-foreground">
                            {" "}
                            · Estado: {primaryWa.setupStatus}
                          </span>
                        ) : null}
                      </p>
                    ) : null}
                    {task.taskType === "connect-number" && !primaryWa ? (
                      <p className="text-xs text-muted-foreground">
                        Aún no hay integración vinculada; se actualizará sola al
                        conectar el número.
                      </p>
                    ) : null}
                    {task.taskType === "payment-domiciliation" &&
                    isOperations ? (
                      <label className="flex cursor-pointer flex-wrap items-center gap-2 text-xs text-foreground">
                        <Checkbox
                          checked={agentBilling?.domiciliated ?? false}
                          disabled={billingLoading || billingSaving}
                          onCheckedChange={(v) => {
                            void onBillingDomiciliatedChange(v === true);
                          }}
                        />
                        <span>
                          Cliente domiciliado (mismo valor que en la Home de
                          Operaciones)
                        </span>
                      </label>
                    ) : null}
                    {task.taskType === "payment-domiciliation" &&
                    !isOperations ? (
                      <p className="text-xs text-muted-foreground">
                        La domiciliación la definen usuarios de Operaciones en
                        la Home (cobranza).
                      </p>
                    ) : null}
                  </div>

                  <div className="flex shrink-0 flex-wrap items-center gap-2">
                    <AttachmentList
                      attachments={task.attachments ?? []}
                      onRemove={(i) => onRemoveAttachment(task.id, i)}
                    />
                    {showUpload ? (
                      <FileUploadButton
                        agentId={agentId}
                        taskId={task.id}
                        onUploaded={onFileUploaded(task.id)}
                        label="Adjuntar"
                        size="sm"
                      />
                    ) : null}
                  </div>
                </div>
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
                      <CardTitle className="line-clamp-2">
                        {task.title}
                      </CardTitle>
                      <CardDescription>
                        {task.description?.trim()
                          ? task.description
                          : "Sin descripción."}
                      </CardDescription>
                      <p className="text-xs text-muted-foreground">
                        Creada {formatDateTime(task.createdAt)}
                        {task.createdByEmail ? (
                          <>
                            {" "}
                            · {actorLabel(task.createdByEmail, growersByEmail)}
                          </>
                        ) : null}
                      </p>
                    </div>
                    <Badge
                      variant={
                        task.status === "completed" ? "secondary" : "default"
                      }
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
                                      onToggleTaskAssignee(
                                        task.id,
                                        email,
                                        e.target.checked,
                                      )
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
                      variant={
                        task.status === "completed" ? "outline" : "default"
                      }
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
                <label
                  htmlFor="task-description"
                  className="text-sm font-medium"
                >
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
                    setCreateAttachments((prev) =>
                      prev.filter((_, idx) => idx !== i),
                    )
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

      {/* Bitácora y comentarios */}
      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Bitácora y comentarios
          </h3>
          <div className="flex flex-wrap items-center gap-1">
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-8 gap-1 px-2"
                    onClick={() => setActivitySortDesc((d) => !d)}
                    aria-label={
                      activitySortDesc
                        ? "Orden: más recientes primero"
                        : "Orden: más antiguos primero"
                    }
                  >
                    {activitySortDesc ? (
                      <ArrowDownWideNarrowIcon className="size-4" />
                    ) : (
                      <ArrowUpWideNarrowIcon className="size-4" />
                    )}
                  </Button>
                </TooltipTrigger>
                <TooltipContent sideOffset={6}>
                  {activitySortDesc
                    ? "Más recientes arriba"
                    : "Más antiguos arriba"}
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
            <div className="flex items-center gap-1 rounded-md border bg-background px-2 py-0.5">
              <FilterIcon
                className="size-3.5 text-muted-foreground"
                aria-hidden
              />
              <select
                className="h-7 max-w-[140px] border-0 bg-transparent text-xs outline-none"
                value={activityFilter}
                onChange={(e) =>
                  setActivityFilter(
                    e.target.value as "all" | "comment" | "system",
                  )
                }
                aria-label="Filtrar bitácora"
              >
                <option value="all">Todos</option>
                <option value="comment">Comentarios</option>
                <option value="system">Registros</option>
              </select>
            </div>
          </div>
        </div>

        {filteredActivity.length === 0 ? (
          <p className="pb-2 text-sm text-muted-foreground">
            No hay entradas en la bitácora todavía.
          </p>
        ) : (
          <div className="relative flex flex-col">
            {/* Centro de columna w-7 = mitad de 1.75rem; la línea coincide con el centro del círculo */}
            <div
              className="pointer-events-none absolute top-2 bottom-2 left-[0.875rem] z-0 w-px -translate-x-1/2 bg-border"
              aria-hidden
            />
            {filteredActivity.map((entry) => {
              const isComment = entry.kind === "comment";
              const Icon = isComment ? MessageSquareIcon : Settings2Icon;
              const when = formatDateTime(entry.createdAt);
              const who = actorLabel(entry.actorEmail, growersByEmail);
              return (
                <div
                  key={entry.id}
                  className="relative z-10 flex gap-3 pb-6 last:pb-2"
                >
                  <div className="flex w-7 shrink-0 justify-center pt-0.5">
                    <span className="flex size-7 shrink-0 items-center justify-center rounded-full border bg-muted ring-2 ring-background">
                      <Icon
                        className="size-3.5 text-muted-foreground"
                        aria-hidden
                      />
                    </span>
                  </div>
                  <div className="min-w-0 flex-1 space-y-1">
                    <p className="text-xs text-muted-foreground">
                      <span className="font-medium text-foreground">{who}</span>
                      {isComment ? " comentó" : " · registro automático"}
                      <span className="text-muted-foreground"> · {when}</span>
                    </p>
                    {isComment && entry.bodyHtml ? (
                      <div
                        className="prose prose-sm max-w-none text-sm dark:prose-invert [&_a]:text-primary [&_p]:my-1 [&_ul]:my-1 [&_ol]:my-1"
                        dangerouslySetInnerHTML={{ __html: entry.bodyHtml }}
                      />
                    ) : (
                      <p className="text-sm text-foreground">
                        {entry.summary ?? "—"}
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground">
            Agregar comentario
          </p>
          <ImplementationActivityCommentEditor
            disabled={loading}
            onSubmit={onPublishComment}
          />
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
              <p className="text-sm text-muted-foreground">
                Sin growers disponibles.
              </p>
            ) : (
              growers.map((g) => {
                const email = g.email.trim().toLowerCase();
                const checked = assigneeEmails.includes(email);
                return (
                  <label
                    key={email}
                    className="flex items-center gap-2 text-sm"
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={(e) =>
                        toggleAssigneeForCreate(email, e.target.checked)
                      }
                      className="h-4 w-4 rounded border-input"
                    />
                    <span className="font-medium">{g.name}</span>
                    <span className="text-xs text-muted-foreground">
                      ({email})
                    </span>
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
