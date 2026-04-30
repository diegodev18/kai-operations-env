"use client";

import { useEffect, useRef, useState } from "react";
import {
  XIcon,
  ChevronUpIcon,
  ChevronDownIcon,
  CheckIcon,
  CalendarIcon,
  UsersIcon,
} from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import type {
  AgentGrowerRow,
  ImplementationTask,
  ImplementationTaskAttachment,
  WhatsappIntegrationStatusItem,
} from "@/types";
import type { AgentBilling } from "@/lib/agents/agent";
import { FileUploadButton, AttachmentList } from "@/components/shared";
import {
  MANDATORY_TASK_TYPES,
  TASK_TYPE_CONFIG,
  TASK_TYPES_WITH_ATTACHMENTS,
  formatDate,
  formatDateTime,
  actorLabel,
} from "./constants";

interface TaskDetailSheetProps {
  task: ImplementationTask | null;
  allTasks: ImplementationTask[];
  agentId: string;
  growers: AgentGrowerRow[];
  growersByEmail: Map<string, string>;
  taskDueDates: Record<string, string>;
  taskAssignees: Record<string, string[]>;
  repDraft: Record<string, { email: string; phone: string }>;
  agentBilling: AgentBilling | null;
  billingLoading: boolean;
  billingSaving: boolean;
  waIntegrations: WhatsappIntegrationStatusItem[];
  isOperations: boolean;
  savingTaskId: string | null;
  onClose: () => void;
  onNavigate: (taskId: string) => void;
  onToggleStatus: (task: ImplementationTask) => Promise<void>;
  onSaveDueDate: (taskId: string) => Promise<void>;
  onToggleAssignee: (taskId: string, email: string, checked: boolean) => void;
  onSaveAssignees: (taskId: string) => Promise<void>;
  onFileUploaded: (taskId: string) => (attachment: ImplementationTaskAttachment) => void;
  onRemoveAttachment: (taskId: string, index: number) => void;
  onSaveRepresentative: (taskId: string) => Promise<void>;
  onBillingDomiciliatedChange: (value: boolean | null) => Promise<void>;
  setTaskDueDates: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  setRepDraft: React.Dispatch<
    React.SetStateAction<Record<string, { email: string; phone: string }>>
  >;
}

const MIN_SHEET_WIDTH = 420;
const MAX_SHEET_WIDTH = 980;

export function TaskDetailSheet({
  task,
  allTasks,
  agentId,
  growers,
  growersByEmail,
  taskDueDates,
  taskAssignees,
  repDraft,
  agentBilling,
  billingLoading,
  billingSaving,
  waIntegrations,
  isOperations,
  savingTaskId,
  onClose,
  onNavigate,
  onToggleStatus,
  onSaveDueDate,
  onToggleAssignee,
  onSaveAssignees,
  onFileUploaded,
  onRemoveAttachment,
  onSaveRepresentative,
  onBillingDomiciliatedChange,
  setTaskDueDates,
  setRepDraft,
}: TaskDetailSheetProps) {
  const [sheetWidth, setSheetWidth] = useState(480);
  const [isResizing, setIsResizing] = useState(false);
  const [assigneesOpen, setAssigneesOpen] = useState(false);
  const assigneesOnOpen = useRef<string[]>([]);

  const open = task !== null;
  const isSaving = task ? savingTaskId === task.id : false;

  const taskIndex = allTasks.findIndex((t) => t.id === task?.id);
  const prevTask = taskIndex > 0 ? allTasks[taskIndex - 1] : null;
  const nextTask =
    taskIndex >= 0 && taskIndex < allTasks.length - 1
      ? allTasks[taskIndex + 1]
      : null;

  useEffect(() => {
    if (!isResizing) return;
    const onPointerMove = (event: PointerEvent) => {
      const nextWidth = Math.max(
        MIN_SHEET_WIDTH,
        Math.min(MAX_SHEET_WIDTH, window.innerWidth - event.clientX),
      );
      setSheetWidth(nextWidth);
    };
    const onPointerUp = () => setIsResizing(false);
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    return () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
  }, [isResizing]);

  const handleAssigneesOpenChange = (nextOpen: boolean) => {
    if (nextOpen) {
      assigneesOnOpen.current = [...(taskAssignees[task?.id ?? ""] ?? [])];
    } else if (task) {
      const current = taskAssignees[task.id] ?? [];
      const changed =
        assigneesOnOpen.current.length !== current.length ||
        current.some((e) => !assigneesOnOpen.current.includes(e));
      if (changed) void onSaveAssignees(task.id);
    }
    setAssigneesOpen(nextOpen);
  };

  if (!task) return null;

  const config = task.taskType ? TASK_TYPE_CONFIG[task.taskType] : null;
  const Icon = config?.icon ?? null;
  const isCompleted = task.status === "completed";
  const isDomiciliation = task.taskType === "payment-domiciliation";
  const isCustomTask =
    !task.mandatory && !(task.taskType && MANDATORY_TASK_TYPES.has(task.taskType));
  const showTypeAttachments =
    task.taskType != null && TASK_TYPES_WITH_ATTACHMENTS.has(task.taskType);
  const dueDateValue = taskDueDates[task.id] ?? "";
  const selectedAssignees = taskAssignees[task.id] ?? [];
  const primaryWa = waIntegrations[0];
  const draft = repDraft[task.id] ?? { email: "", phone: "" };

  return (
    <Sheet open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <SheetContent
        side="right"
        className="flex w-full flex-col gap-0 p-0 sm:max-w-none"
        style={{
          width: `min(100vw, ${sheetWidth}px)`,
          maxWidth: "100vw",
        }}
      >
        {/* Resize handle */}
        <div
          role="separator"
          aria-orientation="vertical"
          aria-label="Redimensionar panel"
          className="absolute bottom-0 left-0 top-0 z-20 hidden w-2 cursor-col-resize bg-transparent transition-colors hover:bg-border/60 sm:block"
          onPointerDown={(e) => {
            e.preventDefault();
            setIsResizing(true);
          }}
        />

        {/* Accessibility titles */}
        <SheetTitle className="sr-only">{task.title}</SheetTitle>
        <SheetDescription className="sr-only">
          Detalle de la tarea de implementación
        </SheetDescription>

        {/* Toolbar */}
        <div className="flex shrink-0 items-center justify-between border-b px-3 py-2">
          <div className="flex items-center gap-0.5">
            <Button
              variant="ghost"
              size="icon"
              className="size-7"
              disabled={!prevTask}
              onClick={() => prevTask && onNavigate(prevTask.id)}
              aria-label="Tarea anterior"
            >
              <ChevronUpIcon className="size-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="size-7"
              disabled={!nextTask}
              onClick={() => nextTask && onNavigate(nextTask.id)}
              aria-label="Siguiente tarea"
            >
              <ChevronDownIcon className="size-4" />
            </Button>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="size-7"
            onClick={onClose}
            aria-label="Cerrar panel"
          >
            <XIcon className="size-4" />
          </Button>
        </div>

        {/* Scrollable content */}
        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="space-y-5 px-6 py-5">
            {/* Title & type */}
            <div className="flex items-start gap-2.5">
              {Icon && (
                <Icon className="mt-1 size-4 shrink-0 text-muted-foreground" />
              )}
              <div className="min-w-0 flex-1">
                <h2 className="text-lg font-semibold leading-snug text-foreground">
                  {task.title}
                </h2>
                {config?.badge && (
                  <Badge
                    variant={
                      (config.badgeVariant as
                        | "default"
                        | "secondary"
                        | "outline") ?? "outline"
                    }
                    className="mt-1.5 text-[10px]"
                  >
                    {config.badge}
                  </Badge>
                )}
              </div>
            </div>

            {/* Description */}
            {task.description?.trim() ? (
              <p className="whitespace-pre-wrap text-sm text-foreground">
                {task.description}
              </p>
            ) : (
              <p className="text-sm italic text-muted-foreground">
                Sin descripción.
              </p>
            )}

            {/* Metadata table */}
            <div className="divide-y rounded-lg border">
              {/* Status */}
              <div className="flex items-center gap-3 px-3 py-2.5">
                <span className="w-36 shrink-0 text-sm text-muted-foreground">
                  Estado
                </span>
                <button
                  type="button"
                  disabled={isSaving || isDomiciliation}
                  title={
                    isDomiciliation
                      ? "El estado se sincroniza con la cobranza"
                      : undefined
                  }
                  onClick={() => void onToggleStatus(task)}
                  className="flex items-center gap-1.5 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isCompleted ? (
                    <Badge variant="secondary" className="gap-1">
                      <CheckIcon className="size-3" />
                      Completada
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="gap-1">
                      <span className="size-2 rounded-full border border-muted-foreground/40" />
                      Pendiente
                    </Badge>
                  )}
                </button>
              </div>

              {/* Due date */}
              <div className="flex items-center gap-3 px-3 py-2.5">
                <span className="w-36 shrink-0 text-sm text-muted-foreground">
                  Vencimiento
                </span>
                <div className="flex items-center gap-2">
                  <CalendarIcon className="size-3.5 text-muted-foreground" />
                  <input
                    type="date"
                    value={dueDateValue}
                    onChange={(e) =>
                      setTaskDueDates((prev) => ({
                        ...prev,
                        [task.id]: e.target.value,
                      }))
                    }
                    onBlur={() => void onSaveDueDate(task.id)}
                    className="h-7 rounded-md border border-input bg-background px-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring/50"
                  />
                  {dueDateValue && (
                    <span className="text-xs text-muted-foreground">
                      {formatDate(dueDateValue)}
                    </span>
                  )}
                </div>
              </div>

              {/* Assignees */}
              <div className="flex items-center gap-3 px-3 py-2.5">
                <span className="w-36 shrink-0 text-sm text-muted-foreground">
                  Asignados
                </span>
                <Popover
                  open={assigneesOpen}
                  onOpenChange={handleAssigneesOpenChange}
                >
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 gap-1.5 text-xs"
                    >
                      <UsersIcon className="size-3.5" />
                      {selectedAssignees.length > 0
                        ? `${selectedAssignees.length} asignado${selectedAssignees.length > 1 ? "s" : ""}`
                        : "Sin asignados"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-64 p-2" align="start">
                    <p className="mb-2 px-1 text-xs font-medium text-muted-foreground">
                      Growers
                    </p>
                    {growers.length === 0 ? (
                      <p className="px-1 text-xs text-muted-foreground">
                        Sin growers disponibles.
                      </p>
                    ) : (
                      <div className="space-y-0.5">
                        {growers.map((g) => {
                          const email = g.email.trim().toLowerCase();
                          const checked = selectedAssignees.includes(email);
                          return (
                            <label
                              key={email}
                              className="flex cursor-pointer items-center gap-2 rounded px-1 py-1.5 hover:bg-muted"
                            >
                              <Checkbox
                                checked={checked}
                                onCheckedChange={(v) =>
                                  onToggleAssignee(task.id, email, Boolean(v))
                                }
                              />
                              <span className="text-sm">{g.name}</span>
                            </label>
                          );
                        })}
                      </div>
                    )}
                  </PopoverContent>
                </Popover>
              </div>

              {/* Attachments for custom tasks */}
              {isCustomTask && (
                <div className="flex flex-col gap-2 px-3 py-2.5">
                  <div className="flex items-center gap-3">
                    <span className="w-36 shrink-0 text-sm text-muted-foreground">
                      Archivos
                    </span>
                    <FileUploadButton
                      agentId={agentId}
                      taskId={task.id}
                      onUploaded={onFileUploaded(task.id)}
                      label="Adjuntar"
                      size="sm"
                    />
                  </div>
                  {(task.attachments?.length ?? 0) > 0 && (
                    <div className="pl-[calc(9rem+0.75rem)]">
                      <AttachmentList
                        attachments={task.attachments ?? []}
                        onRemove={(i) => onRemoveAttachment(task.id, i)}
                      />
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Type-specific: connect-number */}
            {task.taskType === "connect-number" && (
              <div className="space-y-1.5 rounded-lg border px-3 py-3">
                <p className="text-xs font-semibold text-muted-foreground">
                  Integración WhatsApp
                </p>
                {primaryWa ? (
                  <p className="text-sm text-foreground">
                    Número detectado:{" "}
                    <span className="font-medium">
                      {primaryWa.formattedPhoneNumber ??
                        primaryWa.phoneNumber ??
                        "—"}
                    </span>
                    {primaryWa.setupStatus && (
                      <span className="text-muted-foreground">
                        {" "}
                        · Estado: {primaryWa.setupStatus}
                      </span>
                    )}
                  </p>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    Sin integración vinculada. Se actualizará automáticamente al
                    conectar el número.
                  </p>
                )}
              </div>
            )}

            {/* Type-specific: payment-domiciliation */}
            {task.taskType === "payment-domiciliation" && (
              <div className="space-y-2 rounded-lg border px-3 py-3">
                <p className="text-xs font-semibold text-muted-foreground">
                  Domiciliación de cobro
                </p>
                {isOperations ? (
                  <select
                    className="h-8 max-w-xs rounded-md border border-input bg-transparent px-2 text-sm"
                    disabled={billingLoading || billingSaving}
                    value={
                      agentBilling?.domiciliated === true
                        ? "true"
                        : agentBilling?.domiciliated === false
                          ? "false"
                          : "null"
                    }
                    onChange={(e) => {
                      const v = e.target.value;
                      const next: boolean | null =
                        v === "true" ? true : v === "false" ? false : null;
                      void onBillingDomiciliatedChange(next);
                    }}
                  >
                    <option value="null">Sin información</option>
                    <option value="true">Domiciliado</option>
                    <option value="false">No domiciliado</option>
                  </select>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    La domiciliación la definen usuarios de Operaciones en la
                    Home.
                  </p>
                )}
              </div>
            )}

            {/* Type-specific: representative-contact */}
            {task.taskType === "representative-contact" && (
              <div className="space-y-3 rounded-lg border px-3 py-3">
                <p className="text-xs font-semibold text-muted-foreground">
                  Contacto del representante
                </p>
                <p className="text-xs text-muted-foreground">
                  Indica al menos un medio de contacto y guarda antes de marcar
                  como hecha.
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
            )}

            {/* Type-specific: csf-request / quote-sent attachments */}
            {showTypeAttachments && (
              <div className="space-y-2 rounded-lg border px-3 py-3">
                <p className="text-xs font-semibold text-muted-foreground">
                  {task.taskType === "csf-request"
                    ? "Constancia de Situación Fiscal"
                    : "Cotización"}
                </p>
                <AttachmentList
                  attachments={task.attachments ?? []}
                  onRemove={(i) => onRemoveAttachment(task.id, i)}
                />
                <FileUploadButton
                  agentId={agentId}
                  taskId={task.id}
                  onUploaded={onFileUploaded(task.id)}
                  label="Adjuntar archivo"
                  size="sm"
                />
              </div>
            )}

            {/* Footer */}
            <div className="space-y-0.5 border-t pt-3">
              <p className="text-xs text-muted-foreground">
                Creada {formatDateTime(task.createdAt)}
                {task.createdByEmail ? (
                  <> · {actorLabel(task.createdByEmail, growersByEmail)}</>
                ) : null}
              </p>
              {task.updatedAt && (
                <p className="text-xs text-muted-foreground">
                  Actualizada {formatDateTime(task.updatedAt)}
                </p>
              )}
            </div>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
