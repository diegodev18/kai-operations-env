"use client";

import { useState } from "react";
import { toast } from "sonner";
import confetti from "canvas-confetti";
import { GiftIcon } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import type { SendTipInput, TeamMember, TipAmount } from "@/types";
import { TIP_AMOUNTS } from "@/types";
import { UserAvatar } from "./user-avatar";

interface SendTipDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  members: TeamMember[];
  currentUserId?: string;
  onSend: (input: SendTipInput) => Promise<{ ok: boolean; error?: string }>;
}

export function SendTipDialog({
  open,
  onOpenChange,
  members,
  currentUserId,
  onSend,
}: SendTipDialogProps) {
  const [recipientId, setRecipientId] = useState("");
  const [amount, setAmount] = useState<TipAmount | null>(null);
  const [description, setDescription] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const filteredMembers = members.filter((m) => m.id !== currentUserId);

  function reset() {
    setRecipientId("");
    setAmount(null);
    setDescription("");
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!recipientId) {
      toast.error("Selecciona un destinatario.");
      return;
    }
    if (!amount) {
      toast.error("Selecciona un monto.");
      return;
    }
    if (!description.trim()) {
      toast.error("La descripción es obligatoria.");
      return;
    }

    const recipient = members.find((m) => m.id === recipientId);
    if (!recipient) return;

    setIsSubmitting(true);
    const res = await onSend({
      recipientId: recipient.id,
      recipientName: recipient.name,
      recipientEmail: recipient.email,
      amount,
      description: description.trim(),
    });
    setIsSubmitting(false);

    if (res.ok) {
      toast.success(`Propina de $${amount} MXN enviada a ${recipient.name}.`);
      void confetti({
        particleCount: 120,
        spread: 80,
        origin: { y: 0.6 },
        colors: ["#10b981", "#34d399", "#6ee7b7", "#fbbf24", "#f472b6"],
      });
      reset();
      onOpenChange(false);
    } else {
      toast.error(res.error ?? "Error al enviar la propina.");
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) reset(); onOpenChange(v); }}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <GiftIcon className="size-4" />
            Enviar propina
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label>Para</Label>
            <Select value={recipientId} onValueChange={setRecipientId}>
              <SelectTrigger>
                <SelectValue placeholder="Selecciona a un compañero…" />
              </SelectTrigger>
              <SelectContent>
                {filteredMembers.map((m) => (
                  <SelectItem key={m.id} value={m.id}>
                    <div className="flex items-center gap-2">
                      <UserAvatar name={m.name} image={m.image} size="sm" />
                      {m.name}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Monto</Label>
            <div className="flex gap-2">
              {TIP_AMOUNTS.map((a) => (
                <button
                  key={a}
                  type="button"
                  onClick={() => setAmount(a)}
                  className={cn(
                    "flex-1 rounded-md border px-3 py-2 text-sm font-medium transition-colors",
                    amount === a
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-input bg-background hover:bg-muted",
                  )}
                >
                  ${a}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">
              Descripción <span className="text-destructive">*</span>
            </Label>
            <Textarea
              id="description"
              placeholder="¿Por qué merece esta propina?"
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => { reset(); onOpenChange(false); }}
              disabled={isSubmitting}
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Enviando…" : amount ? `Enviar $${amount}` : "Enviar"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
