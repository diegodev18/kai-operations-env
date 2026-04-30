"use client";

import { useState } from "react";
import { Loader2Icon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { RedeemDialog } from "./redeem-dialog";
import { UserAvatar } from "./user-avatar";
import type { TeamMember, UserBalance } from "@/types";

interface TeamBalancesTableProps {
  balances: UserBalance[];
  members: TeamMember[];
  isLoading: boolean;
  onRedeem: (userId: string) => Promise<{ ok: boolean; error?: string }>;
}

export function TeamBalancesTable({ balances, members, isLoading, onRedeem }: TeamBalancesTableProps) {
  const [redeemTarget, setRedeemTarget] = useState<UserBalance | null>(null);

  const memberMap = new Map(members.map((m) => [m.id, m]));

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12 text-muted-foreground">
        <Loader2Icon className="size-5 animate-spin" />
      </div>
    );
  }

  if (balances.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-muted-foreground">
        Ningún colaborador tiene saldo acumulado todavía.
      </p>
    );
  }

  return (
    <>
      <div className="overflow-x-auto rounded-md border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/50 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              <th className="px-4 py-3">Colaborador</th>
              <th className="px-4 py-3">Email</th>
              <th className="px-4 py-3">Saldo acumulado</th>
              <th className="px-4 py-3">Acción</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {balances.map((b) => {
              const member = memberMap.get(b.userId);
              return (
                <tr key={b.userId} className="hover:bg-muted/30">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <UserAvatar name={b.userName} image={member?.image ?? null} />
                      <span className="font-medium">{b.userName}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{b.userEmail}</td>
                  <td className="px-4 py-3">
                    <span
                      className={
                        b.balanceMxn > 0
                          ? "font-semibold text-emerald-600 dark:text-emerald-400"
                          : "text-muted-foreground"
                      }
                    >
                      ${b.balanceMxn.toFixed(2)} MXN
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={b.balanceMxn === 0}
                      onClick={() => setRedeemTarget(b)}
                    >
                      Canjear
                    </Button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <RedeemDialog
        open={redeemTarget !== null}
        onOpenChange={(v) => { if (!v) setRedeemTarget(null); }}
        balance={redeemTarget}
        onRedeem={onRedeem}
      />
    </>
  );
}
