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
import { patchAgentBillingConfig } from "@/services/agents-api";
import { toast } from "sonner";

export interface BillingAgent {
  id: string;
  name: string;
  billing: {
    lastPaymentDate?: string | null;
  };
}

export function BillingConfigDialog({
  open,
  onOpenChange,
  agent,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  agent: BillingAgent | null;
  onSaved?: (agent: BillingAgent) => void | Promise<void>;
}) {
  const [domiciliated, setDomiciliated] = useState<boolean | null>(null);
  const [defaultAmount, setDefaultAmount] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [saving, setSaving] = useState(false);

  const handleOpenChange = (newOpen: boolean) => {
    if (!newOpen) {
      setDomiciliated(null);
      setDefaultAmount("");
      setDueDate("");
    }
    onOpenChange(newOpen);
  };

  const handleSave = async () => {
    if (!agent) return;
    setSaving(true);
    try {
      const r = await patchAgentBillingConfig(agent.id, {
        domiciliated,
        defaultPaymentAmount: defaultAmount ? Number(defaultAmount) : undefined,
        paymentDueDate: dueDate || null,
      });
      if (r.ok) {
        toast.success("Configuración actualizada");
        await onSaved?.(agent);
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
          <DialogTitle>Configuración de Cobranza</DialogTitle>
          <DialogDescription>
            Agente:{" "}
            <span className="font-medium text-foreground">{agent?.name}</span>
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <p className="text-sm font-medium">Domiciliación</p>
            <div className="flex flex-col gap-2 text-sm">
              <label className="flex cursor-pointer items-center gap-2">
                <input
                  type="radio"
                  name="billing-domiciliation"
                  className="size-4 accent-primary"
                  checked={domiciliated === true}
                  onChange={() => setDomiciliated(true)}
                />
                Domiciliado (pago automático mensual)
              </label>
              <label className="flex cursor-pointer items-center gap-2">
                <input
                  type="radio"
                  name="billing-domiciliation"
                  className="size-4 accent-primary"
                  checked={domiciliated === false}
                  onChange={() => setDomiciliated(false)}
                />
                No domiciliado
              </label>
              <label className="flex cursor-pointer items-center gap-2">
                <input
                  type="radio"
                  name="billing-domiciliation"
                  className="size-4 accent-primary"
                  checked={domiciliated === null}
                  onChange={() => setDomiciliated(null)}
                />
                Sin información
              </label>
            </div>
          </div>
          <div>
            <label className="text-sm font-medium">Monto mensual</label>
            <Input
              type="number"
              value={defaultAmount}
              onChange={(e) => setDefaultAmount(e.target.value)}
              placeholder="p. ej. 1500"
            />
          </div>
          {domiciliated !== true && (
            <div>
              <label className="text-sm font-medium">Fecha límite de pago</label>
              <Input
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
              />
            </div>
          )}
          {agent?.billing.lastPaymentDate && (
            <p className="text-xs text-muted-foreground">
              Último pago:{" "}
              {new Date(agent.billing.lastPaymentDate).toLocaleDateString(
                "es-MX",
              )}
            </p>
          )}
          {domiciliated === true && (
            <p className="text-xs text-muted-foreground bg-muted/50 rounded-md p-2">
              Los pagos domiciliados se renuevan automáticamente cada mes. No se
              requiere acción manual.
            </p>
          )}
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
            disabled={saving}
            onClick={() => void handleSave()}
          >
            {saving && <Loader2Icon className="mr-2 size-4 animate-spin" />}
            Guardar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
