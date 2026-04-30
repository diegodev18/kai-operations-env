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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
interface LoadWalletDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  loadFunds: (amount: number) => Promise<{ ok: true; balanceMxn: number } | { ok: false; error: string }>;
  onLoaded?: (newBalance: number) => void;
}

export function LoadWalletDialog({ open, onOpenChange, loadFunds, onLoaded }: LoadWalletDialogProps) {
  const [amount, setAmount] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const parsed = parseFloat(amount);
    if (isNaN(parsed) || parsed <= 0) {
      toast.error("Ingresa un monto válido mayor a $0.");
      return;
    }
    setIsSubmitting(true);
    const res = await loadFunds(parsed);
    setIsSubmitting(false);
    if (res.ok) {
      toast.success(`Se cargaron $${parsed.toFixed(2)} MXN al monedero.`);
      setAmount("");
      onLoaded?.(res.balanceMxn);
      onOpenChange(false);
    } else {
      toast.error(res.error);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Cargar monedero</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="amount">Monto (MXN)</Label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                $
              </span>
              <Input
                id="amount"
                type="number"
                min="1"
                step="0.01"
                placeholder="500.00"
                className="pl-6"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                autoFocus
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isSubmitting}
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Cargando…" : "Cargar"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
