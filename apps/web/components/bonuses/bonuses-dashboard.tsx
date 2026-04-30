"use client";

import { useMemo, useState } from "react";
import { LoadWalletDialog } from "./load-wallet-dialog";
import { TipsFeed } from "./tips-feed";
import { TeamBalancesTable } from "./team-balances-table";
import { AdminStatCards, MemberStatCards } from "./stat-cards";
import { useAdminWallet, useAdminBalances, useTips, useTeamMembers, useMyBalance } from "@/hooks";
import { useAuth, useUserRole } from "@/hooks";

export function BonusesDashboard() {
  const { session } = useAuth();
  const { isAdmin } = useUserRole();
  const currentUserId = session?.user?.id;

  const { wallet, isLoading: walletLoading, loadFunds } = useAdminWallet();
  const { balances, isLoading: balancesLoading, redeem } = useAdminBalances();
  const { tips, isLoading: tipsLoading } = useTips();
  const { members, isLoading: membersLoading } = useTeamMembers();
  const { balanceMxn: myBalance, isLoading: myBalanceLoading } = useMyBalance();

  const [loadWalletOpen, setLoadWalletOpen] = useState(false);

  const now = new Date();
  const tipsThisMonth = useMemo(
    () =>
      tips.filter((t) => {
        if (!t.createdAt) return false;
        const d = new Date(t.createdAt);
        return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [tips],
  );

  const topSender = useMemo(() => {
    if (tips.length === 0) return null;
    const counts: Record<string, { name: string; count: number }> = {};
    for (const t of tips) {
      if (!counts[t.senderId]) counts[t.senderId] = { name: t.senderName, count: 0 };
      counts[t.senderId].count++;
    }
    const top = Object.values(counts).sort((a, b) => b.count - a.count)[0];
    return top?.name ?? null;
  }, [tips]);

  const tipsSent = useMemo(
    () => tips.filter((t) => t.senderId === currentUserId).length,
    [tips, currentUserId],
  );

  const tipsReceived = useMemo(
    () => tips.filter((t) => t.recipientId === currentUserId).length,
    [tips, currentUserId],
  );

  const statsLoading = tipsLoading || walletLoading || myBalanceLoading;

  return (
    <div className="flex flex-col gap-6 p-6">
      <div>
        <h1 className="text-2xl font-bold">Bonificaciones</h1>
        <p className="text-sm text-muted-foreground">
          Reconoce a tus compañeros con una propina interna.
        </p>
      </div>

      {isAdmin ? (
        <AdminStatCards
          balanceMxn={wallet?.balanceMxn ?? 0}
          myBalanceMxn={myBalance}
          tipsThisMonth={tipsThisMonth.length}
          topSender={topSender}
          isLoading={statsLoading}
          onLoadWallet={() => setLoadWalletOpen(true)}
        />
      ) : (
        <MemberStatCards
          balanceMxn={myBalance}
          tipsSent={tipsSent}
          tipsReceived={tipsReceived}
          isLoading={statsLoading}
        />
      )}

      {isAdmin && (
        <section className="flex flex-col gap-3">
          <h2 className="text-base font-semibold">Saldos del equipo</h2>
          <TeamBalancesTable
            balances={balances}
            members={members}
            isLoading={balancesLoading}
            onRedeem={redeem}
          />
        </section>
      )}

      <section className="flex flex-col gap-3">
        <h2 className="text-base font-semibold">Actividad</h2>
        <TipsFeed
          tips={tips}
          members={members}
          isLoading={tipsLoading || membersLoading}
          currentUserId={currentUserId}
        />
      </section>

      <LoadWalletDialog
        open={loadWalletOpen}
        onOpenChange={setLoadWalletOpen}
        loadFunds={loadFunds}
      />
    </div>
  );
}
