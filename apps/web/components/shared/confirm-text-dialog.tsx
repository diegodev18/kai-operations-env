"use client";

import { useState } from "react";
import { Loader2Icon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

export function ConfirmTextDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmWord = "CONFIRMAR",
  confirmText = "Confirmar",
  onConfirm,
  saving = false,
  isDangerous = true,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  confirmWord?: string;
  confirmText?: string;
  onConfirm: () => void | Promise<void>;
  saving?: boolean;
  isDangerous?: boolean;
}) {
  const [inputValue, setInputValue] = useState("");
  const isConfirmed = inputValue === confirmWord;

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) {
      setInputValue("");
    }
    onOpenChange(nextOpen);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Escribe <strong>{confirmWord}</strong> para confirmar:
          </p>
          <Input
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            placeholder={confirmWord}
            disabled={saving}
            autoFocus
            onKeyDown={(e) => {
              if (e.key === "Enter" && isConfirmed && !saving) {
                void onConfirm();
              }
            }}
          />
        </div>
        <div className="flex gap-2 justify-end">
          <Button
            variant="outline"
            onClick={() => handleOpenChange(false)}
            disabled={saving}
          >
            Cancelar
          </Button>
          <Button
            onClick={() => void onConfirm()}
            disabled={!isConfirmed || saving}
            variant={isDangerous ? "destructive" : "default"}
          >
            {saving && <Loader2Icon className="mr-2 size-4 animate-spin" />}
            {confirmText}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
