"use client";

import { WalletIcon } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

interface WalletCardProps {
  balanceMxn: number;
  isLoading: boolean;
  onLoad: () => void;
}

export function WalletCard({ balanceMxn, isLoading, onLoad }: WalletCardProps) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="flex items-center gap-2 text-base font-semibold">
          <WalletIcon className="size-4" />
          Monedero virtual
        </CardTitle>
        <Button size="sm" onClick={onLoad}>
          Cargar saldo
        </Button>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="h-9 w-40 animate-pulse rounded-md bg-muted" />
        ) : (
          <p className="text-3xl font-bold">
            ${balanceMxn.toFixed(2)}{" "}
            <span className="text-sm font-normal text-muted-foreground">MXN</span>
          </p>
        )}
        <p className="mt-1 text-xs text-muted-foreground">Saldo disponible para propinas</p>
      </CardContent>
    </Card>
  );
}
