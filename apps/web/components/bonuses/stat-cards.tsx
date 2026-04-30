"use client";

import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

interface StatCardProps {
  label: string;
  value: string;
  sub?: string;
  action?: React.ReactNode;
}

function StatCard({ label, value, sub, action }: StatCardProps) {
  return (
    <Card>
      <CardContent className="pt-5 pb-4">
        <div className="flex items-start justify-between gap-2">
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            {label}
          </p>
          {action}
        </div>
        <p className="mt-1 text-2xl font-bold leading-none">{value}</p>
        {sub && <p className="mt-1 text-xs text-muted-foreground">{sub}</p>}
      </CardContent>
    </Card>
  );
}

interface AdminStatCardsProps {
  balanceMxn: number;
  myBalanceMxn: number;
  tipsThisMonth: number;
  topSender: string | null;
  isLoading: boolean;
  onLoadWallet: () => void;
}

export function AdminStatCards({
  balanceMxn,
  myBalanceMxn,
  tipsThisMonth,
  topSender,
  isLoading,
  onLoadWallet,
}: AdminStatCardsProps) {
  if (isLoading) {
    return (
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <Card key={i}>
            <CardContent className="pt-5 pb-4">
              <div className="h-3 w-24 animate-pulse rounded bg-muted" />
              <div className="mt-2 h-7 w-32 animate-pulse rounded bg-muted" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
      <StatCard
        label="Monedero virtual"
        value={`$${balanceMxn.toFixed(2)}`}
        sub="MXN disponibles"
        action={
          <Button size="sm" variant="outline" className="h-6 px-2 text-xs" onClick={onLoadWallet}>
            Cargar
          </Button>
        }
      />
      <StatCard
        label="Mi saldo recibido"
        value={`$${myBalanceMxn.toFixed(2)}`}
        sub="MXN acumulados"
      />
      <StatCard
        label="Propinas este mes"
        value={String(tipsThisMonth)}
        sub={tipsThisMonth === 1 ? "propina enviada" : "propinas enviadas"}
      />
      <StatCard
        label="Top sender"
        value={topSender ?? "—"}
        sub={topSender ? "más propinas enviadas" : "sin actividad aún"}
      />
    </div>
  );
}

interface MemberStatCardsProps {
  balanceMxn: number;
  tipsSent: number;
  tipsReceived: number;
  isLoading: boolean;
}

export function MemberStatCards({ balanceMxn, tipsSent, tipsReceived, isLoading }: MemberStatCardsProps) {
  if (isLoading) {
    return (
      <div className="grid grid-cols-3 gap-4">
        {[0, 1, 2].map((i) => (
          <Card key={i}>
            <CardContent className="pt-5 pb-4">
              <div className="h-3 w-24 animate-pulse rounded bg-muted" />
              <div className="mt-2 h-7 w-32 animate-pulse rounded bg-muted" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-3 gap-4">
      <StatCard
        label="Mi saldo acumulado"
        value={`$${balanceMxn.toFixed(2)}`}
        sub="MXN · disponible para canje"
      />
      <StatCard
        label="Propinas enviadas"
        value={String(tipsSent)}
        sub="en total"
      />
      <StatCard
        label="Propinas recibidas"
        value={String(tipsReceived)}
        sub="en total"
      />
    </div>
  );
}
