"use client";

import { useCallback, useState } from "react";
import { Loader2Icon, Trash2Icon } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { deleteAgentTool } from "@/hooks";
import type { AgentTool } from "@/types";

export function DeleteToolDialog({
  agentId,
  tool,
  open,
  onOpenChange,
  onSuccess,
}: {
  agentId: string;
  tool: AgentTool;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}) {
  const [deleting, setDeleting] = useState(false);

  const handleDelete = useCallback(async () => {
    setDeleting(true);
    try {
      const ok = await deleteAgentTool(agentId, tool.id);
      if (ok) {
        toast.success("Tool eliminada");
        onSuccess();
      }
    } finally {
      setDeleting(false);
    }
  }, [agentId, tool.id, onSuccess]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm" showClose>
        <DialogHeader>
          <DialogTitle>¿Eliminar tool?</DialogTitle>
          <p className="text-sm text-muted-foreground">
            Se eliminará la tool &quot;
            <span className="font-mono text-foreground">{tool.name}</span>&quot;.
            Esta acción no se puede deshacer.
          </p>
        </DialogHeader>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            variant="destructive"
            onClick={handleDelete}
            disabled={deleting}
          >
            {deleting ? (
              <Loader2Icon className="mr-2 size-4 animate-spin" />
            ) : (
              <Trash2Icon className="mr-2 size-4" />
            )}
            Eliminar
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
