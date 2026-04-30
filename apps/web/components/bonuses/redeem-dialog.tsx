"use client";

import { useState } from "react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import type { UserBalance } from "@/types";

interface RedeemDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  balance: UserBalance | null;
  onRedeem: (userId: string) => Promise<{ ok: boolean; error?: string }>;
}

export function RedeemDialog({ open, onOpenChange, balance, onRedeem }: RedeemDialogProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleConfirm() {
    if (!balance) return;
    setIsSubmitting(true);
    const res = await onRedeem(balance.userId);
    setIsSubmitting(false);
    if (res.ok) {
      toast.success(
        `Saldo de $${balance.balanceMxn.toFixed(2)} MXN canjeado para ${balance.userName}.`,
      );
      onOpenChange(false);
    } else {
      toast.error(res.error ?? "Error al canjear el saldo.");
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Canjear saldo</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          ¿Confirmar canje de{" "}
          <span className="font-semibold text-foreground">
            ${balance?.balanceMxn.toFixed(2)} MXN
          </span>{" "}
          para{" "}
          <span className="font-semibold text-foreground">{balance?.userName}</span>?
          <br />
          <span className="mt-1 block text-xs">El saldo quedará en $0.00 MXN.</span>
        </p>
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isSubmitting}
          >
            Cancelar
          </Button>
          <Button onClick={handleConfirm} disabled={isSubmitting}>
            {isSubmitting ? "Canjeando…" : "Confirmar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
