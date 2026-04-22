"use client";

import { useState } from "react";
import { Loader2Icon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { createPaymentRecord } from "@/services/agents-api";
import { toast } from "sonner";

export interface PaymentAgent {
  id: string;
  name: string;
}

export function RegisterPaymentDialog({
  open,
  onOpenChange,
  agent,
  defaultAmount,
  onPaymentCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  agent: PaymentAgent | null;
  defaultAmount?: string;
  onPaymentCreated?: (agentId: string) => void | Promise<void>;
}) {
  const [amount, setAmount] = useState(defaultAmount || "");
  const [period, setPeriod] = useState("");
  const [method, setMethod] = useState("transferencia");
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  const handleOpenChange = (newOpen: boolean) => {
    if (!newOpen) {
      setAmount(defaultAmount || "");
      setPeriod("");
      setMethod("transferencia");
      setReference("");
      setNotes("");
    }
    onOpenChange(newOpen);
  };

  const handleSubmit = async () => {
    if (!agent) {
      toast.error("No se pudo identificar el agente.");
      return;
    }
    setSaving(true);
    try {
      const r = await createPaymentRecord(agent.id, {
        amount: Number(amount),
        period,
        paymentMethod: method,
        reference: reference || undefined,
        notes: notes || undefined,
      });
      if (r.ok) {
        toast.success("Pago registrado");
        await onPaymentCreated?.(agent.id);
        handleOpenChange(false);
      } else {
        toast.error(r.error);
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent showClose>
        <DialogHeader>
          <DialogTitle>Registrar Pago</DialogTitle>
          <DialogDescription>
            Agente:{" "}
            <span className="font-medium text-foreground">
              {agent?.name ?? "—"}
            </span>
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div>
            <label className="text-sm font-medium">Monto</label>
            <Input
              type="number"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="p. ej. 1500"
              disabled={saving}
            />
          </div>
          <div>
            <label className="text-sm font-medium">Período</label>
            <Input
              value={period}
              onChange={(e) => setPeriod(e.target.value)}
              placeholder="p. ej. Abril 2026"
              disabled={saving}
            />
          </div>
          <div>
            <label className="text-sm font-medium">Método de pago</label>
            <select
              value={method}
              onChange={(e) => setMethod(e.target.value)}
              disabled={saving}
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm"
            >
              <option value="transferencia">Transferencia</option>
              <option value="efectivo">Efectivo</option>
              <option value="tarjeta">Tarjeta</option>
              <option value="cheque">Cheque</option>
              <option value="otro">Otro</option>
            </select>
          </div>
          <div>
            <label className="text-sm font-medium">Referencia (opcional)</label>
            <Input
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              placeholder="p. ej. REF-12345"
              disabled={saving}
            />
          </div>
          <div>
            <label className="text-sm font-medium">Notas (opcional)</label>
            <Input
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Notas adicionales"
              disabled={saving}
            />
          </div>
        </div>
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => handleOpenChange(false)}
            disabled={saving}
          >
            Cancelar
          </Button>
          <Button
            type="button"
            disabled={saving || !amount || !period}
            onClick={() => void handleSubmit()}
          >
            {saving && <Loader2Icon className="mr-2 size-4 animate-spin" />}
            Registrar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
