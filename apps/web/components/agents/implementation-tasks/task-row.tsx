"use client";

import { useState } from "react";
import { CalendarIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { AgentGrowerRow, ImplementationTask, ImplementationTaskStatus } from "@/types";
import { cn } from "@/lib/utils";
import {
  TASK_TYPE_CONFIG,
  STATUS_CONFIG,
  STATUS_ORDER,
  formatDate,
  growerInitials,
  emailInitials,
  normalizeStatus,
} from "./constants";

interface TaskCardProps {
  task: ImplementationTask;
  isSelected: boolean;
  isSaving: boolean;
  growers: AgentGrowerRow[];
  onSelect: (id: string) => void;
  onChangeStatus: (task: ImplementationTask, status: ImplementationTaskStatus) => Promise<void>;
}

export function TaskCard({
  task,
  isSelected,
  isSaving,
  growers,
  onSelect,
  onChangeStatus,
}: TaskCardProps) {
  const [statusOpen, setStatusOpen] = useState(false);
  const config = task.taskType ? TASK_TYPE_CONFIG[task.taskType] : null;
  const effectiveStatus = normalizeStatus(task.status);
  const statusCfg = STATUS_CONFIG[effectiveStatus] ?? STATUS_CONFIG.todo;
  const StatusIcon = statusCfg.icon;
  const isDomiciliation = task.taskType === "payment-domiciliation";
  const isCompleted = effectiveStatus === "completed";
  const isCancelled = effectiveStatus === "cancelled";
  const isOverdue =
    !!task.dueDate &&
    !isCompleted &&
    !isCancelled &&
    new Date(task.dueDate) < new Date(new Date().toDateString());

  const assigneeAvatars = (task.assigneeEmails ?? []).slice(0, 3).map((email) => {
    const g = growers.find((gr) => gr.email.trim().toLowerCase() === email);
    return { initials: g ? growerInitials(g) : emailInitials(email), email };
  });
  const extraCount = Math.max(0, (task.assigneeEmails?.length ?? 0) - 3);

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onSelect(task.id)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") onSelect(task.id);
      }}
      className={cn(
        "group rounded-xl border bg-card p-4 cursor-pointer transition-all space-y-3",
        isSelected
          ? "border-primary/50 ring-1 ring-primary/20 shadow-md"
          : "border-border hover:border-border/60 hover:shadow-md",
        (isCompleted || isCancelled) && "opacity-55",
      )}
    >
      {/* Top: ID + optional type badge */}
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-mono text-muted-foreground/50">
          {task.publicId != null ? `AGT-${task.publicId}` : "—"}
        </span>
        {config?.badge && (
          <Badge
            variant={(config.badgeVariant as "default" | "secondary" | "outline") ?? "outline"}
            className="h-5 px-1.5 text-[11px]"
          >
            {config.badge}
          </Badge>
        )}
      </div>

      {/* Title */}
      <p
        className={cn(
          "text-sm font-medium leading-snug",
          (isCompleted || isCancelled) && "line-through text-muted-foreground",
        )}
      >
        {task.title}
      </p>

      {/* Bottom: status chip · due date · avatars */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          {/* Status dropdown */}
          <DropdownMenu open={statusOpen} onOpenChange={setStatusOpen}>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                disabled={isSaving || isDomiciliation}
                onClick={(e) => e.stopPropagation()}
                title={
                  isDomiciliation
                    ? "El estado se sincroniza con la cobranza"
                    : statusCfg.label
                }
                className={cn(
                  "flex items-center gap-1.5 rounded-md px-2 py-1 text-xs transition-colors hover:bg-muted",
                  statusCfg.badgeClassName,
                  isDomiciliation && "cursor-not-allowed opacity-50",
                )}
              >
                <StatusIcon className={cn("size-3 shrink-0", statusCfg.iconClassName)} />
                <span className="leading-none">{statusCfg.label}</span>
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="start"
              className="w-44"
              onClick={(e) => e.stopPropagation()}
            >
              {STATUS_ORDER.map((s) => {
                const cfg = STATUS_CONFIG[s];
                const Icon = cfg.icon;
                return (
                  <DropdownMenuItem
                    key={s}
                    className="gap-2"
                    onSelect={() => void onChangeStatus(task, s)}
                  >
                    <Icon className={cn("size-3.5 shrink-0", cfg.iconClassName)} />
                    <span className="text-sm">{cfg.label}</span>
                  </DropdownMenuItem>
                );
              })}
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Due date */}
          {task.dueDate && (
            <span
              className={cn(
                "flex items-center gap-1 shrink-0 text-xs",
                isOverdue ? "text-red-500" : "text-muted-foreground",
              )}
            >
              <CalendarIcon className="size-3" />
              {formatDate(task.dueDate)}
            </span>
          )}
        </div>

        {/* Assignee avatars */}
        {assigneeAvatars.length > 0 && (
          <div className="flex shrink-0 -space-x-1.5">
            {assigneeAvatars.map(({ initials, email }) => (
              <div
                key={email}
                title={email}
                className="flex size-6 items-center justify-center rounded-full border-2 border-card bg-muted text-[10px] font-medium text-muted-foreground"
              >
                {initials}
              </div>
            ))}
            {extraCount > 0 && (
              <div className="flex size-6 items-center justify-center rounded-full border-2 border-card bg-muted text-[10px] font-medium text-muted-foreground">
                +{extraCount}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
