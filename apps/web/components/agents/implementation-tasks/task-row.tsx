"use client";

import { CheckIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { AgentGrowerRow, ImplementationTask } from "@/types";
import { cn } from "@/lib/utils";
import {
  TASK_TYPE_CONFIG,
  formatDate,
  growerInitials,
  emailInitials,
} from "./constants";

interface TaskRowProps {
  task: ImplementationTask;
  isSelected: boolean;
  isSaving: boolean;
  growers: AgentGrowerRow[];
  onSelect: (id: string) => void;
  onToggleStatus: (task: ImplementationTask) => Promise<void>;
}

export function TaskRow({
  task,
  isSelected,
  isSaving,
  growers,
  onSelect,
  onToggleStatus,
}: TaskRowProps) {
  const config = task.taskType ? TASK_TYPE_CONFIG[task.taskType] : null;
  const isCompleted = task.status === "completed";
  const isDomiciliation = task.taskType === "payment-domiciliation";

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
        "flex items-center gap-2.5 rounded-md px-2 py-1.5 transition-colors cursor-pointer",
        isSelected ? "bg-accent text-accent-foreground" : "hover:bg-muted/60",
      )}
    >
      {/* Status circle */}
      <button
        type="button"
        disabled={isSaving || isDomiciliation}
        onClick={(e) => {
          e.stopPropagation();
          void onToggleStatus(task);
        }}
        title={
          isDomiciliation
            ? "El estado se sincroniza con la cobranza"
            : isCompleted
              ? "Marcar como pendiente"
              : "Marcar como completada"
        }
        className={cn(
          "flex size-4 shrink-0 items-center justify-center rounded-full border transition-colors",
          isCompleted
            ? "border-primary bg-primary text-primary-foreground"
            : "border-muted-foreground/40 hover:border-primary",
          (isSaving || isDomiciliation) && "cursor-not-allowed opacity-50",
        )}
      >
        {isCompleted && <CheckIcon className="size-2.5" strokeWidth={3} />}
      </button>

      {/* Title */}
      <span
        className={cn(
          "min-w-0 flex-1 truncate text-sm",
          isCompleted && "text-muted-foreground line-through",
        )}
      >
        {task.title}
      </span>

      {/* Type badge */}
      {config?.badge && (
        <Badge
          variant={(config.badgeVariant as "default" | "secondary" | "outline") ?? "outline"}
          className="hidden shrink-0 text-[10px] sm:flex"
        >
          {config.badge}
        </Badge>
      )}

      {/* Due date */}
      {task.dueDate && (
        <span className="hidden shrink-0 text-xs text-muted-foreground md:block">
          {formatDate(task.dueDate)}
        </span>
      )}

      {/* Assignee avatars */}
      {assigneeAvatars.length > 0 && (
        <div className="flex shrink-0 -space-x-1">
          {assigneeAvatars.map(({ initials, email }) => (
            <div
              key={email}
              className="flex size-5 items-center justify-center rounded-full border border-background bg-muted text-[9px] font-medium text-muted-foreground"
            >
              {initials}
            </div>
          ))}
          {extraCount > 0 && (
            <div className="flex size-5 items-center justify-center rounded-full border border-background bg-muted text-[9px] font-medium text-muted-foreground">
              +{extraCount}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
