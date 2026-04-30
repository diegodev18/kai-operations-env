"use client";

import { useState } from "react";
import { Loader2Icon } from "lucide-react";
import { cn } from "@/lib/utils";
import { UserAvatar } from "./user-avatar";
import type { TeamMember, Tip } from "@/types";

type Filter = "all" | "sent" | "received";

interface TipsFeedProps {
  tips: Tip[];
  members: TeamMember[];
  isLoading: boolean;
  currentUserId?: string;
}

function timeAgo(iso: string | null): string {
  if (!iso) return "—";
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "ahora";
  if (mins < 60) return `hace ${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `hace ${hrs}h`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `hace ${days}d`;
  return new Date(iso).toLocaleDateString("es-MX", { day: "2-digit", month: "short" });
}

const TABS: { key: Filter; label: string }[] = [
  { key: "all", label: "Todos" },
  { key: "sent", label: "Enviados" },
  { key: "received", label: "Recibidos" },
];

export function TipsFeed({ tips, members, isLoading, currentUserId }: TipsFeedProps) {
  const [filter, setFilter] = useState<Filter>("all");
  const memberMap = new Map(members.map((m) => [m.id, m]));

  const filtered = tips.filter((t) => {
    if (filter === "sent") return t.senderId === currentUserId;
    if (filter === "received") return t.recipientId === currentUserId;
    return true;
  });

  return (
    <div className="flex flex-col gap-4">
      {/* Tabs */}
      <div className="flex gap-1">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => setFilter(tab.key)}
            className={cn(
              "rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
              filter === tab.key
                ? "bg-foreground text-background"
                : "text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Feed */}
      {isLoading ? (
        <div className="flex items-center justify-center py-12 text-muted-foreground">
          <Loader2Icon className="size-5 animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">
          {filter === "all"
            ? "No hay propinas registradas todavía."
            : filter === "sent"
            ? "No has enviado propinas aún."
            : "No has recibido propinas aún."}
        </p>
      ) : (
        <div className="divide-y rounded-lg border">
          {filtered.map((tip) => {
            const isSent = tip.senderId === currentUserId;
            const isReceived = tip.recipientId === currentUserId;
            const senderMember = memberMap.get(tip.senderId);
            const recipientMember = memberMap.get(tip.recipientId);

            return (
              <div key={tip.id} className="flex gap-4 px-4 py-4 hover:bg-muted/30 transition-colors">
                <UserAvatar
                  name={tip.senderName}
                  image={senderMember?.image ?? null}
                  size="md"
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm">
                      <span className={cn("font-semibold", isSent && "text-primary")}>
                        {isSent ? "Tú" : tip.senderName}
                      </span>
                      <span className="mx-1.5 text-muted-foreground">→</span>
                      <span className={cn("font-semibold", isReceived && "text-primary")}>
                        {isReceived ? "Tú" : tip.recipientName}
                      </span>
                      {recipientMember?.image && !isReceived && (
                        <UserAvatar
                          name={tip.recipientName}
                          image={recipientMember.image}
                          size="sm"
                        />
                      )}
                    </p>
                    <div className="flex shrink-0 items-center gap-2">
                      <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-semibold text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300">
                        ${tip.amount} MXN
                      </span>
                      <span className="text-xs text-muted-foreground whitespace-nowrap">
                        {timeAgo(tip.createdAt)}
                      </span>
                    </div>
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">{tip.description}</p>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
