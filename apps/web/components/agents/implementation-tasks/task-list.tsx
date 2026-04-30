"use client";

import { useMemo, useState } from "react";
import { ChevronDownIcon, ChevronRightIcon } from "lucide-react";
import type { AgentGrowerRow, ImplementationTask } from "@/types";
import { MANDATORY_TASK_TYPES } from "./constants";
import { TaskRow } from "./task-row";

interface GroupSectionProps {
  title: string;
  badge: string;
  tasks: ImplementationTask[];
  selectedTaskId: string | null;
  savingTaskId: string | null;
  growers: AgentGrowerRow[];
  onSelect: (id: string) => void;
  onToggleStatus: (task: ImplementationTask) => Promise<void>;
  defaultCollapsed?: boolean;
}

function GroupSection({
  title,
  badge,
  tasks,
  selectedTaskId,
  savingTaskId,
  growers,
  onSelect,
  onToggleStatus,
  defaultCollapsed = false,
}: GroupSectionProps) {
  const [collapsed, setCollapsed] = useState(defaultCollapsed);

  if (tasks.length === 0) return null;

  return (
    <section>
      <button
        type="button"
        onClick={() => setCollapsed((prev) => !prev)}
        className="flex w-full items-center gap-1.5 rounded px-1 py-1 text-left transition-colors hover:bg-muted/40"
      >
        {collapsed ? (
          <ChevronRightIcon className="size-3.5 shrink-0 text-muted-foreground" />
        ) : (
          <ChevronDownIcon className="size-3.5 shrink-0 text-muted-foreground" />
        )}
        <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {title}
        </span>
        <span className="ml-1 text-xs text-muted-foreground">{badge}</span>
      </button>
      {!collapsed && (
        <div className="mt-0.5 space-y-px pl-2">
          {tasks.map((task) => (
            <TaskRow
              key={task.id}
              task={task}
              isSelected={selectedTaskId === task.id}
              isSaving={savingTaskId === task.id}
              growers={growers}
              onSelect={onSelect}
              onToggleStatus={onToggleStatus}
            />
          ))}
        </div>
      )}
    </section>
  );
}

interface TaskListProps {
  tasks: ImplementationTask[];
  selectedTaskId: string | null;
  savingTaskId: string | null;
  growers: AgentGrowerRow[];
  onSelect: (id: string) => void;
  onToggleStatus: (task: ImplementationTask) => Promise<void>;
}

export function TaskList({
  tasks,
  selectedTaskId,
  savingTaskId,
  growers,
  onSelect,
  onToggleStatus,
}: TaskListProps) {
  const mandatoryTasks = useMemo(
    () =>
      tasks.filter(
        (t) => t.mandatory || (t.taskType && MANDATORY_TASK_TYPES.has(t.taskType)),
      ),
    [tasks],
  );

  const mandatoryCompleted = useMemo(
    () => mandatoryTasks.filter((t) => t.status === "completed").length,
    [mandatoryTasks],
  );

  const customPending = useMemo(
    () =>
      tasks
        .filter(
          (t) =>
            !t.mandatory &&
            !(t.taskType && MANDATORY_TASK_TYPES.has(t.taskType ?? "")) &&
            t.status === "pending",
        )
        .sort((a, b) => {
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

  const customCompleted = useMemo(
    () =>
      tasks
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
        }),
    [tasks],
  );

  if (tasks.length === 0) {
    return (
      <p className="py-12 text-center text-sm text-muted-foreground">
        No hay tareas todavía.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      <GroupSection
        title="Obligatorias"
        badge={`${mandatoryCompleted}/${mandatoryTasks.length}`}
        tasks={mandatoryTasks}
        selectedTaskId={selectedTaskId}
        savingTaskId={savingTaskId}
        growers={growers}
        onSelect={onSelect}
        onToggleStatus={onToggleStatus}
      />
      <GroupSection
        title="Pendientes"
        badge={String(customPending.length)}
        tasks={customPending}
        selectedTaskId={selectedTaskId}
        savingTaskId={savingTaskId}
        growers={growers}
        onSelect={onSelect}
        onToggleStatus={onToggleStatus}
      />
      <GroupSection
        title="Completadas"
        badge={String(customCompleted.length)}
        tasks={customCompleted}
        selectedTaskId={selectedTaskId}
        savingTaskId={savingTaskId}
        growers={growers}
        onSelect={onSelect}
        onToggleStatus={onToggleStatus}
        defaultCollapsed
      />
    </div>
  );
}
