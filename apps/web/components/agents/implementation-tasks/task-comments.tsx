"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { HistoryIcon, Loader2Icon, MessageSquareIcon } from "lucide-react";
import type { AgentGrowerRow, ImplementationActivityEntry } from "@/types";
import { ImplementationActivityCommentEditor } from "@/components/shared";
import {
  fetchImplementationActivity,
  createImplementationActivityComment,
} from "@/services/agents-api";
import { actorLabel, formatDateTime, growerInitials, emailInitials } from "./constants";

interface TaskCommentsProps {
  agentId: string;
  taskId: string;
  growers: AgentGrowerRow[];
  growersByEmail: Map<string, string>;
}

export function TaskComments({ agentId, taskId, growers, growersByEmail }: TaskCommentsProps) {
  const [entries, setEntries] = useState<ImplementationActivityEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const bottomRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetchImplementationActivity(agentId, taskId);
    if (res) {
      setEntries([...res.entries].reverse());
    }
    setLoading(false);
  }, [agentId, taskId]);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void load(); }, [load]);

  const handleSubmit = useCallback(
    async (html: string) => {
      const result = await createImplementationActivityComment(agentId, html, taskId);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      setEntries((prev) => [...prev, result.entry]);
      setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
    },
    [agentId, taskId],
  );

  const timelineEntries = useMemo(
    () =>
      entries
        .filter((entry) => !(entry.kind === "comment" && entry.hidden))
        .sort((a, b) => {
          const aTime = a.createdAt ? new Date(a.createdAt).getTime() : 0;
          const bTime = b.createdAt ? new Date(b.createdAt).getTime() : 0;
          return bTime - aTime;
        }),
    [entries],
  );

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
        <Loader2Icon className="size-3.5 animate-spin" />
        Cargando actividad…
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        <MessageSquareIcon className="size-3.5" />
        Actividad
      </p>

      {timelineEntries.length > 0 && (
        <div className="relative space-y-3">
          <div className="absolute left-3.5 top-1 bottom-1 w-px bg-border/70" />
          {timelineEntries.map((e) => {
            const name = actorLabel(e.actorEmail, growersByEmail);
            const grower = growers.find(
              (gr) => gr.email.trim().toLowerCase() === (e.actorEmail ?? ""),
            );
            const initials = grower ? growerInitials(grower) : emailInitials(e.actorEmail ?? "??");

            return (
              <div key={e.id} className="relative flex gap-2.5">
                <div className="z-10 mt-0.5">
                  {e.kind === "comment" ? (
                    <div className="flex size-7 shrink-0 items-center justify-center rounded-full bg-muted text-[10px] font-medium text-muted-foreground">
                      {initials}
                    </div>
                  ) : (
                    <div className="flex size-7 shrink-0 items-center justify-center rounded-full border bg-background text-muted-foreground">
                      <HistoryIcon className="size-3.5" />
                    </div>
                  )}
                </div>
                <div className="min-w-0 flex-1 space-y-1 pb-1">
                  <div className="flex items-baseline gap-2">
                    <span className="text-sm font-medium">{name}</span>
                    <span className="text-xs text-muted-foreground">
                      {formatDateTime(e.createdAt)}
                    </span>
                  </div>

                  {e.kind === "comment" ? (
                    e.bodyHtml && (
                      <div
                        className="prose prose-sm max-w-none rounded-lg border bg-muted/20 px-3 py-2 text-sm [&_a]:text-primary [&_a]:underline [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5"
                        dangerouslySetInnerHTML={{ __html: e.bodyHtml }}
                      />
                    )
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      {e.summary ? e.summary : (e.action ?? "Actualizó la tarea")}
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {timelineEntries.length === 0 && (
        <p className="text-sm text-muted-foreground">Sin actividad todavía.</p>
      )}

      <div ref={bottomRef} />

      {/* Comment input */}
      <ImplementationActivityCommentEditor onSubmit={handleSubmit} />
    </div>
  );
}
