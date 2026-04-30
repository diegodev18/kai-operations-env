"use client";

import { useMemo, useState } from "react";
import { ChevronDownIcon, ChevronRightIcon } from "lucide-react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import type {
  AgentGrowerRow,
  ImplementationTask,
  ImplementationTaskPriority,
  ImplementationTaskStatus,
} from "@/types";
import { cn } from "@/lib/utils";
import {
  PRIORITY_CONFIG,
  PRIORITY_ORDER,
  STATUS_CONFIG,
  TASK_TYPE_CONFIG,
  normalizeStatus,
} from "./constants";
import { TaskCard } from "./task-row";

// ── Draggable task card wrapper ───────────────────────────────────────────────

interface DraggableCardProps {
  task: ImplementationTask;
  isSelected: boolean;
  isSaving: boolean;
  isDragging: boolean;
  growers: AgentGrowerRow[];
  onSelect: (id: string) => void;
  onChangeStatus: (task: ImplementationTask, status: ImplementationTaskStatus) => Promise<void>;
}

function DraggableCard({
  task,
  isSelected,
  isSaving,
  isDragging,
  growers,
  onSelect,
  onChangeStatus,
}: DraggableCardProps) {
  const { attributes, listeners, setNodeRef, transform } = useDraggable({
    id: task.id,
    data: { task },
  });

  const style = transform
    ? { transform: CSS.Translate.toString(transform) }
    : undefined;

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...listeners}
      {...attributes}
      className={cn("touch-none", isDragging && "opacity-40")}
    >
      <TaskCard
        task={task}
        isSelected={isSelected}
        isSaving={isSaving}
        growers={growers}
        onSelect={onSelect}
        onChangeStatus={onChangeStatus}
      />
    </div>
  );
}

// ── Mandatory task compact row ────────────────────────────────────────────────

interface MandatoryRowProps {
  task: ImplementationTask;
  isSelected: boolean;
  growers: AgentGrowerRow[];
  onSelect: (id: string) => void;
}

function MandatoryRow({ task, isSelected, onSelect }: MandatoryRowProps) {
  const config = task.taskType ? TASK_TYPE_CONFIG[task.taskType] : null;
  const TypeIcon = config?.icon;
  const effectiveStatus = normalizeStatus(task.status);
  const statusCfg = STATUS_CONFIG[effectiveStatus] ?? STATUS_CONFIG.todo;
  const StatusIcon = statusCfg.icon;

  return (
    <button
      type="button"
      onClick={() => onSelect(task.id)}
      className={cn(
        "flex w-full items-center gap-3 rounded-xl border p-3 text-left transition-all hover:shadow-sm",
        isSelected
          ? "border-primary/50 bg-accent ring-1 ring-primary/20"
          : "border-border bg-card hover:border-border/60",
      )}
    >
      {TypeIcon && (
        <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted">
          <TypeIcon className="size-4 text-muted-foreground" />
        </div>
      )}
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-foreground">{task.title}</p>
        {config?.label && (
          <p className="truncate text-xs text-muted-foreground/60">{config.label}</p>
        )}
      </div>
      <div
        className={cn(
          "flex shrink-0 items-center gap-1.5 rounded-md px-2 py-1 text-xs",
          statusCfg.badgeClassName,
        )}
      >
        <StatusIcon className={cn("size-3", statusCfg.iconClassName)} />
        <span>{statusCfg.label}</span>
      </div>
    </button>
  );
}

// ── Mandatory section ─────────────────────────────────────────────────────────

interface MandatorySectionProps {
  tasks: ImplementationTask[];
  selectedTaskId: string | null;
  growers: AgentGrowerRow[];
  onSelect: (id: string) => void;
}

function MandatorySection({ tasks, selectedTaskId, growers, onSelect }: MandatorySectionProps) {
  const [collapsed, setCollapsed] = useState(true);

  const completedCount = tasks.filter(
    (t) => normalizeStatus(t.status) === "completed",
  ).length;

  return (
    <div className="rounded-xl border border-dashed bg-muted/20 p-4">
      <button
        type="button"
        onClick={() => setCollapsed((prev) => !prev)}
        className="flex w-full items-center gap-2 text-left"
      >
        {collapsed ? (
          <ChevronRightIcon className="size-4 shrink-0 text-muted-foreground" />
        ) : (
          <ChevronDownIcon className="size-4 shrink-0 text-muted-foreground" />
        )}
        <span className="text-sm font-semibold text-muted-foreground">Requeridas</span>
        <span className="ml-1 text-sm text-muted-foreground/60">
          {completedCount}/{tasks.length}
        </span>
      </button>

      {!collapsed && (
        <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {tasks.map((task) => (
            <MandatoryRow
              key={task.id}
              task={task}
              isSelected={selectedTaskId === task.id}
              growers={growers}
              onSelect={onSelect}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ── Droppable priority column ─────────────────────────────────────────────────

interface PriorityColumnProps {
  priority: ImplementationTaskPriority;
  tasks: ImplementationTask[];
  selectedTaskId: string | null;
  savingTaskId: string | null;
  activeDragTaskId: string | null;
  growers: AgentGrowerRow[];
  onSelect: (id: string) => void;
  onChangeStatus: (task: ImplementationTask, status: ImplementationTaskStatus) => Promise<void>;
  defaultCollapsed?: boolean;
}

function PriorityColumn({
  priority,
  tasks,
  selectedTaskId,
  savingTaskId,
  activeDragTaskId,
  growers,
  onSelect,
  onChangeStatus,
  defaultCollapsed = false,
}: PriorityColumnProps) {
  const [collapsed, setCollapsed] = useState(defaultCollapsed);
  const cfg = PRIORITY_CONFIG[priority];
  const Icon = cfg.icon;

  const { setNodeRef, isOver } = useDroppable({ id: priority });

  return (
    <div
      className={cn(
        "flex flex-col gap-2.5 transition-all",
        collapsed
          ? "w-14 shrink-0"
          : "min-w-[300px] max-w-[340px] flex-1",
      )}
    >
      {/* Column header */}
      <button
        type="button"
        onClick={() => setCollapsed((prev) => !prev)}
        className={cn(
          "rounded-lg text-left transition-colors hover:bg-muted/40",
          collapsed
            ? "flex h-full min-h-[120px] flex-col items-center gap-2 px-1 py-2"
            : "flex items-center gap-2 px-1.5 py-1.5",
        )}
      >
        {collapsed ? (
          <>
            <ChevronRightIcon className="size-3.5 text-muted-foreground/50" />
            <Icon className={cn("size-4 shrink-0", cfg.className)} />
            <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground [writing-mode:vertical-rl] [text-orientation:mixed]">
              {cfg.label}
            </span>
            <span className="rounded-full bg-muted px-1.5 py-0 text-[10px] font-medium text-muted-foreground">
              {tasks.length}
            </span>
          </>
        ) : (
          <>
            <Icon className={cn("size-4 shrink-0", cfg.className)} />
            <span className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              {cfg.label}
            </span>
            <span className="ml-1 rounded-full bg-muted px-2 py-0 text-xs font-medium text-muted-foreground">
              {tasks.length}
            </span>
            <ChevronDownIcon className="ml-auto size-3.5 text-muted-foreground/50" />
          </>
        )}
      </button>

      {/* Cards */}
      {!collapsed && (
        <div
          ref={setNodeRef}
          className={cn(
            "flex flex-col gap-2.5 rounded-xl p-1 transition-colors",
            isOver && activeDragTaskId && "bg-muted/40 ring-1 ring-border",
          )}
        >
          {tasks.length === 0 && !isOver ? (
            <div className="flex min-h-[120px] items-center justify-center rounded-xl border border-dashed text-sm text-muted-foreground/40">
              Sin tareas
            </div>
          ) : (
            <>
              {tasks.map((task) => (
                <DraggableCard
                  key={task.id}
                  task={task}
                  isSelected={selectedTaskId === task.id}
                  isSaving={savingTaskId === task.id}
                  isDragging={activeDragTaskId === task.id}
                  growers={growers}
                  onSelect={onSelect}
                  onChangeStatus={onChangeStatus}
                />
              ))}
              {/* Extra drop zone when column is empty but being hovered */}
              {tasks.length === 0 && isOver && (
                <div className="min-h-[120px] rounded-xl border-2 border-dashed border-primary/40" />
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ── Main TaskList ─────────────────────────────────────────────────────────────

interface TaskListProps {
  tasks: ImplementationTask[];
  selectedTaskId: string | null;
  savingTaskId: string | null;
  growers: AgentGrowerRow[];
  onSelect: (id: string) => void;
  onChangeStatus: (task: ImplementationTask, status: ImplementationTaskStatus) => Promise<void>;
  onChangePriority: (task: ImplementationTask, priority: ImplementationTaskPriority) => Promise<void>;
}

export function TaskList({
  tasks,
  selectedTaskId,
  savingTaskId,
  growers,
  onSelect,
  onChangeStatus,
  onChangePriority,
}: TaskListProps) {
  const [activeDragTask, setActiveDragTask] = useState<ImplementationTask | null>(null);
  const activeDragTaskId = activeDragTask?.id ?? null;

  const rootTasks = useMemo(() => tasks.filter((t) => !t.parentTaskId), [tasks]);
  const mandatoryTasks = useMemo(() => rootTasks.filter((t) => t.mandatory), [rootTasks]);
  const boardTasks = useMemo(() => rootTasks.filter((t) => !t.mandatory), [rootTasks]);

  const tasksByPriority = useMemo(() => {
    const groups: Record<ImplementationTaskPriority, ImplementationTask[]> = {
      urgent: [], high: [], medium: [], low: [], none: [],
    };
    for (const task of boardTasks) {
      const p = task.priority ?? "none";
      groups[p].push(task);
    }
    for (const p of PRIORITY_ORDER) {
      groups[p].sort((a, b) => {
        const aIsDone = normalizeStatus(a.status) === "completed" || a.status === "cancelled";
        const bIsDone = normalizeStatus(b.status) === "completed" || b.status === "cancelled";
        if (aIsDone !== bIsDone) return aIsDone ? 1 : -1;
        const aTime = a.dueDate ? new Date(a.dueDate).getTime() : Number.MAX_SAFE_INTEGER;
        const bTime = b.dueDate ? new Date(b.dueDate).getTime() : Number.MAX_SAFE_INTEGER;
        return aTime - bTime;
      });
    }
    return groups;
  }, [boardTasks]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
  );

  function handleDragStart(event: DragStartEvent) {
    const task = (event.active.data.current as { task: ImplementationTask }).task;
    setActiveDragTask(task);
  }

  function handleDragEnd(event: DragEndEvent) {
    const { over } = event;
    const task = activeDragTask;
    setActiveDragTask(null);

    if (!task || !over) return;
    const newPriority = over.id as ImplementationTaskPriority;
    if (newPriority === (task.priority ?? "none")) return;
    void onChangePriority(task, newPriority);
  }

  if (tasks.length === 0) {
    return (
      <p className="py-16 text-center text-base text-muted-foreground">
        No hay tareas todavía.
      </p>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-5">
      {/* Mandatory tasks */}
      {mandatoryTasks.length > 0 && (
        <MandatorySection
          tasks={mandatoryTasks}
          selectedTaskId={selectedTaskId}
          growers={growers}
          onSelect={onSelect}
        />
      )}

      {/* Board */}
      {boardTasks.length > 0 && (
        <div className="min-h-0 flex-1">
          <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
            <div className="flex h-full items-start gap-4 overflow-x-auto overflow-y-hidden pb-3">
              {PRIORITY_ORDER.map((priority) => (
                <PriorityColumn
                  key={priority}
                  priority={priority}
                  tasks={tasksByPriority[priority]}
                  selectedTaskId={selectedTaskId}
                  savingTaskId={savingTaskId}
                  activeDragTaskId={activeDragTaskId}
                  growers={growers}
                  onSelect={onSelect}
                  onChangeStatus={onChangeStatus}
                  defaultCollapsed={
                    priority === "none" && tasksByPriority[priority].length === 0
                  }
                />
              ))}
            </div>

            {/* Drag overlay — renders a ghost card while dragging */}
            <DragOverlay dropAnimation={null}>
              {activeDragTask && (
                <div className="rotate-1 opacity-90 shadow-xl">
                  <TaskCard
                    task={activeDragTask}
                    isSelected={false}
                    isSaving={false}
                    growers={growers}
                    onSelect={() => undefined}
                    onChangeStatus={async () => undefined}
                  />
                </div>
              )}
            </DragOverlay>
          </DndContext>
        </div>
      )}
    </div>
  );
}
