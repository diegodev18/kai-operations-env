"use client";

import { useState } from "react";
import { GiftIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { WalletCard } from "./wallet-card";
import { LoadWalletDialog } from "./load-wallet-dialog";
import { SendTipDialog } from "./send-tip-dialog";
import { TipsHistoryTable } from "./tips-history-table";
import { TeamBalancesTable } from "./team-balances-table";
import { useAdminWallet, useAdminBalances, useTips, useTeamMembers, useMyBalance } from "@/hooks";
import { useAuth, useUserRole } from "@/hooks";

export function BonusesDashboard() {
  const { session } = useAuth();
  const { isAdmin } = useUserRole();
  const currentUserId = session?.user?.id;

  const { wallet, isLoading: walletLoading, loadFunds } = useAdminWallet();
  const { balances, isLoading: balancesLoading, redeem, refetch: refetchBalances } = useAdminBalances();
  const { tips, isLoading: tipsLoading, send } = useTips();
  const { members, isLoading: membersLoading } = useTeamMembers();
  const { balanceMxn: myBalance, isLoading: myBalanceLoading } = useMyBalance();

  const [loadWalletOpen, setLoadWalletOpen] = useState(false);
  const [sendTipOpen, setSendTipOpen] = useState(false);

  return (
    <div className="flex flex-col gap-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Bonificaciones</h1>
          <p className="text-sm text-muted-foreground">
            Reconoce a tus compañeros con una propina interna.
          </p>
        </div>
        <Button onClick={() => setSendTipOpen(true)}>
          <GiftIcon className="mr-2 size-4" />
          Enviar propina
        </Button>
      </div>

      {/* Admin: monedero */}
      {isAdmin && (
        <WalletCard
          balanceMxn={wallet?.balanceMxn ?? 0}
          isLoading={walletLoading}
          onLoad={() => setLoadWalletOpen(true)}
        />
      )}

      {/* Member: mi saldo */}
      {!isAdmin && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-semibold">Mi saldo acumulado</CardTitle>
          </CardHeader>
          <CardContent>
            {myBalanceLoading ? (
              <div className="h-9 w-40 animate-pulse rounded-md bg-muted" />
            ) : (
              <p className="text-3xl font-bold">
                ${myBalance.toFixed(2)}{" "}
                <span className="text-sm font-normal text-muted-foreground">MXN</span>
              </p>
            )}
            <p className="mt-1 text-xs text-muted-foreground">
              Disponible para canje — contacta al administrador.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Admin: saldos del equipo */}
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

      {/* Historial */}
      <section className="flex flex-col gap-3">
        <h2 className="text-base font-semibold">Historial de propinas</h2>
        <TipsHistoryTable
          tips={tips}
          members={members}
          isLoading={tipsLoading}
          currentUserId={currentUserId}
        />
      </section>

      <LoadWalletDialog
        open={loadWalletOpen}
        onOpenChange={setLoadWalletOpen}
        loadFunds={loadFunds}
      />

      <SendTipDialog
        open={sendTipOpen}
        onOpenChange={setSendTipOpen}
        members={members}
        currentUserId={currentUserId}
        onSend={async (input) => {
          const res = await send(input);
          if (res.ok) void refetchBalances();
          return res;
        }}
      />
    </div>
  );
}
