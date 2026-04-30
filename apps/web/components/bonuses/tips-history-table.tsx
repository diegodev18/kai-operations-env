"use client";

import { Loader2Icon } from "lucide-react";
import { UserAvatar } from "./user-avatar";
import type { TeamMember, Tip } from "@/types";

interface TipsHistoryTableProps {
  tips: Tip[];
  members: TeamMember[];
  isLoading: boolean;
  currentUserId?: string;
}

function formatDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("es-MX", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export function TipsHistoryTable({ tips, members, isLoading, currentUserId }: TipsHistoryTableProps) {
  const memberMap = new Map(members.map((m) => [m.id, m]));

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12 text-muted-foreground">
        <Loader2Icon className="size-5 animate-spin" />
      </div>
    );
  }

  if (tips.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-muted-foreground">
        No hay propinas registradas todavía.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto rounded-md border">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b bg-muted/50 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            <th className="px-4 py-3">De</th>
            <th className="px-4 py-3">Para</th>
            <th className="px-4 py-3">Monto</th>
            <th className="px-4 py-3">Descripción</th>
            <th className="px-4 py-3">Fecha</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {tips.map((tip) => {
            const isReceived = tip.recipientId === currentUserId;
            const isSent = tip.senderId === currentUserId;
            const senderMember = memberMap.get(tip.senderId);
            const recipientMember = memberMap.get(tip.recipientId);
            return (
              <tr key={tip.id} className="hover:bg-muted/30">
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <UserAvatar
                      name={isSent ? "Tú" : tip.senderName}
                      image={isSent ? null : (senderMember?.image ?? null)}
                    />
                    <span className={isSent ? "font-medium text-foreground" : "text-muted-foreground"}>
                      {isSent ? "Tú" : tip.senderName}
                    </span>
                  </div>
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <UserAvatar
                      name={isReceived ? "Tú" : tip.recipientName}
                      image={isReceived ? null : (recipientMember?.image ?? null)}
                    />
                    <span className={isReceived ? "font-medium text-foreground" : "text-muted-foreground"}>
                      {isReceived ? "Tú" : tip.recipientName}
                    </span>
                  </div>
                </td>
                <td className="px-4 py-3">
                  <span className="inline-flex items-center rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-semibold text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300">
                    ${tip.amount} MXN
                  </span>
                </td>
                <td className="max-w-xs truncate px-4 py-3 text-muted-foreground">
                  {tip.description}
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">
                  {formatDate(tip.createdAt)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
