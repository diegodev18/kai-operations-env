import { useCallback, useRef, useState } from "react";
import type { ChatMessageImage } from "@/hooks";
import type { PromptDesignerPendingPdf } from "@/types";

const MAX_CHAT_IMAGES = 4;
const MAX_IMAGE_BYTES = 3 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];
const PDF_MIME_TYPE = "application/pdf";
const MAX_PDF_BYTES = 20 * 1024 * 1024;

function isAllowedImageType(type: string): boolean {
  return ALLOWED_IMAGE_TYPES.includes(type);
}

function fileToImageData(file: File): Promise<ChatMessageImage | null> {
  if (!isAllowedImageType(file.type) || file.size > MAX_IMAGE_BYTES) {
    return Promise.resolve(null);
  }
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      if (typeof result !== "string" || !result.startsWith("data:")) {
        resolve(null);
        return;
      }
      const base64 = result.split(",")[1];
      if (!base64) {
        resolve(null);
        return;
      }
      resolve({ mimeType: file.type, data: base64 });
    };
    reader.onerror = () => resolve(null);
    reader.readAsDataURL(file);
  });
}

function fileToPdfData(file: File): Promise<PromptDesignerPendingPdf | null> {
  if (file.type !== PDF_MIME_TYPE || file.size > MAX_PDF_BYTES) {
    return Promise.resolve(null);
  }
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      if (typeof result !== "string" || !result.startsWith("data:")) {
        resolve(null);
        return;
      }
      const base64 = result.split(",")[1];
      if (!base64) {
        resolve(null);
        return;
      }
      resolve({
        mimeType: PDF_MIME_TYPE,
        data: base64,
        name: file.name || "documento.pdf",
      });
    };
    reader.onerror = () => resolve(null);
    reader.readAsDataURL(file);
  });
}

export function usePromptDesignerChatAttachments() {
  const [pendingImages, setPendingImages] = useState<ChatMessageImage[]>([]);
  const [pendingPdf, setPendingPdf] = useState<PromptDesignerPendingPdf | null>(null);
  const [isDraggingOverChat, setIsDraggingOverChat] = useState(false);
  const chatFileInputRef = useRef<HTMLInputElement>(null);

  const addFilesFromFileList = useCallback(
    async (files: FileList | null, currentImageCount?: number) => {
      if (!files?.length) return;
      const maxImages = MAX_CHAT_IMAGES - (currentImageCount ?? 0);
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        if (!file?.type) continue;
        if (file.type === PDF_MIME_TYPE) {
          const pdf = await fileToPdfData(file);
          if (pdf) setPendingPdf(pdf);
          continue;
        }
        if (
          maxImages > 0 &&
          isAllowedImageType(file.type) &&
          file.size <= MAX_IMAGE_BYTES
        ) {
          const img = await fileToImageData(file);
          if (img) {
            setPendingImages((p) => {
              if (p.length >= MAX_CHAT_IMAGES) return p;
              return [...p, img];
            });
          }
        }
      }
    },
    [],
  );

  const handleChatDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
  }, []);

  const handleChatDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDraggingOverChat(false);
      const files = e.dataTransfer.files;
      if (files?.length) {
        void addFilesFromFileList(files, pendingImages.length);
      }
    },
    [addFilesFromFileList, pendingImages.length],
  );

  const handleChatDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    if (e.dataTransfer.types.includes("Files")) {
      setIsDraggingOverChat(true);
    }
  }, []);

  const handleChatDragLeave = useCallback((e: React.DragEvent) => {
    if (
      e.relatedTarget != null &&
      typeof (e.relatedTarget as Node).nodeType === "number" &&
      !(e.currentTarget as Node).contains(e.relatedTarget as Node)
    ) {
      setIsDraggingOverChat(false);
    }
  }, []);

  return {
    pendingImages,
    setPendingImages,
    pendingPdf,
    setPendingPdf,
    isDraggingOverChat,
    chatFileInputRef,
    addFilesFromFileList,
    handleChatDragOver,
    handleChatDrop,
    handleChatDragEnter,
    handleChatDragLeave,
  };
}
