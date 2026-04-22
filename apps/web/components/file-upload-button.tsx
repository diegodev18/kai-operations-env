"use client";

import { useCallback, useRef, useState } from "react";
import { Loader2Icon, PaperclipIcon, XIcon } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { uploadAgentFile } from "@/services/agents-api";
import type { ImplementationTaskAttachment } from "@/types";

type FileUploadButtonProps = {
  agentId: string;
  taskId: string;
  onUploaded: (attachment: ImplementationTaskAttachment) => void;
  label?: string;
  variant?: "default" | "outline" | "ghost";
  size?: "default" | "sm" | "icon";
  accept?: string;
};

export function FileUploadButton({
  agentId,
  taskId,
  onUploaded,
  label = "Adjuntar",
  variant = "outline",
  size = "sm",
  accept,
}: FileUploadButtonProps) {
  const [uploading, setUploading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      if (file.size > 10 * 1024 * 1024) {
        toast.error("El archivo supera el tamaño máximo de 10MB");
        if (inputRef.current) inputRef.current.value = "";
        return;
      }

      setUploading(true);
      try {
        const result = await uploadAgentFile(agentId, taskId, file);
        if (!result.ok) {
          toast.error(result.error);
          return;
        }
        onUploaded({
          name: result.file.name,
          url: result.file.url,
          uploadedAt: result.file.uploadedAt,
        });
        toast.success("Archivo subido correctamente");
      } catch {
        toast.error("Error al subir el archivo");
      } finally {
        setUploading(false);
        if (inputRef.current) inputRef.current.value = "";
      }
    },
    [agentId, taskId, onUploaded],
  );

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        className="hidden"
        accept={accept}
        onChange={handleFileChange}
        disabled={uploading}
      />
      <Button
        type="button"
        variant={variant}
        size={size}
        disabled={uploading}
        onClick={() => inputRef.current?.click()}
        className="gap-1.5"
      >
        {uploading ? (
          <Loader2Icon className="size-3.5 animate-spin" />
        ) : (
          <PaperclipIcon className="size-3.5" />
        )}
        {uploading ? "Subiendo..." : label}
      </Button>
    </>
  );
}

type AttachmentListProps = {
  attachments: ImplementationTaskAttachment[];
  onRemove?: (index: number) => void;
};

export function AttachmentList({ attachments, onRemove }: AttachmentListProps) {
  if (attachments.length === 0) return null;

  return (
    <div className="space-y-1.5">
      <p className="text-xs font-medium text-muted-foreground">Archivos adjuntos</p>
      <div className="space-y-1">
        {attachments.map((att, i) => (
          <div
            key={`${att.name}-${att.uploadedAt}`}
            className="flex items-center gap-2 rounded-md border px-2 py-1.5 text-xs"
          >
            <PaperclipIcon className="size-3 shrink-0 text-muted-foreground" />
            <a
              href={att.url}
              target="_blank"
              rel="noopener noreferrer"
              className="min-w-0 truncate text-foreground underline underline-offset-2 hover:text-primary"
            >
              {att.name}
            </a>
            {onRemove && (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="ml-auto size-5 shrink-0"
                onClick={() => onRemove(i)}
              >
                <XIcon className="size-3" />
              </Button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
