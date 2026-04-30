"use client";

import { useState } from "react";
import { Loader2Icon, WalletIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { UserAvatar } from "./user-avatar";
import type { ActivityItem, TeamMember } from "@/types";

type Filter = "all" | "sent" | "received";

interface TipsFeedProps {
  activity: ActivityItem[];
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

export function TipsFeed({ activity, members, isLoading, currentUserId }: TipsFeedProps) {
  const [filter, setFilter] = useState<Filter>("all");
  const memberMap = new Map(members.map((m) => [m.id, m]));

  const filtered = activity.filter((item) => {
    if (item.type === "walletLoad") return filter === "all";
    if (filter === "sent") return item.senderId === currentUserId;
    if (filter === "received") return item.recipientId === currentUserId;
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
            ? "No hay actividad registrada todavía."
            : filter === "sent"
            ? "No has enviado propinas aún."
            : "No has recibido propinas aún."}
        </p>
      ) : (
        <div className="divide-y rounded-lg border">
          {filtered.map((item) => {
            if (item.type === "walletLoad") {
              return (
                <div key={item.id} className="flex gap-4 px-4 py-4 hover:bg-muted/30 transition-colors">
                  <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-muted">
                    <WalletIcon className="size-4 text-muted-foreground" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm">
                        <span className="font-semibold">{item.adminName}</span>
                        <span className="mx-1.5 text-muted-foreground">cargó el monedero virtual</span>
                      </p>
                      <div className="flex shrink-0 items-center gap-2">
                        <span className="rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-semibold text-blue-700 dark:bg-blue-900 dark:text-blue-300">
                          +${item.amount} MXN
                        </span>
                        <span className="text-xs text-muted-foreground whitespace-nowrap">
                          {timeAgo(item.createdAt)}
                        </span>
                      </div>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Saldo tras carga: ${item.newBalance} MXN
                    </p>
                  </div>
                </div>
              );
            }

            const isSent = item.senderId === currentUserId;
            const isReceived = item.recipientId === currentUserId;
            const senderMember = memberMap.get(item.senderId);
            const recipientMember = memberMap.get(item.recipientId);

            return (
              <div key={item.id} className="flex gap-4 px-4 py-4 hover:bg-muted/30 transition-colors">
                <UserAvatar
                  name={item.senderName}
                  image={senderMember?.image ?? null}
                  size="md"
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm">
                      <span className={cn("font-semibold", isSent && "text-primary")}>
                        {isSent ? "Tú" : item.senderName}
                      </span>
                      <span className="mx-1.5 text-muted-foreground">→</span>
                      <span className={cn("font-semibold", isReceived && "text-primary")}>
                        {isReceived ? "Tú" : item.recipientName}
                      </span>
                      {recipientMember?.image && !isReceived && (
                        <UserAvatar
                          name={item.recipientName}
                          image={recipientMember.image}
                          size="sm"
                        />
                      )}
                    </p>
                    <div className="flex shrink-0 items-center gap-2">
                      <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-semibold text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300">
                        ${item.amount} MXN
                      </span>
                      <span className="text-xs text-muted-foreground whitespace-nowrap">
                        {timeAgo(item.createdAt)}
                      </span>
                    </div>
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">{item.description}</p>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
