"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type DragEvent,
} from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Loader2Icon, SendIcon } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { ActualityMarkdownComposer } from "@/components/actuality-markdown-composer";
import { createBlogPost, uploadBlogImage } from "@/lib/blog-api";
import { ACTUALITY_TAGS } from "@/lib/blog-tags";
import { fetchOrganizationUsers } from "@/lib/organization-api";
import { useAuth } from "@/hooks/auth";

const POST_TYPE = "actuality" as const;

export default function NewActualityPage() {
  const router = useRouter();
  const { session } = useAuth();
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [selectedTag, setSelectedTag] = useState("");
  const [mentionUsers, setMentionUsers] = useState<
    Array<{ id: string; name: string; email: string; mention: string }>
  >([]);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    void (async () => {
      const data = await fetchOrganizationUsers();
      if (!data?.users) return;
      const users = data.users
        .map((u) => ({
          id: u.id,
          name: u.name,
          email: u.email,
          mention: (u.email.split("@")[0] ?? "").replace(/[^\w]/g, "").toLowerCase(),
        }))
        .filter((u) => u.mention.length > 0);
      setMentionUsers(users);
    })();
  }, []);

  const handleAddTag = useCallback(
    (tag: string) => {
      if (tag && !tags.includes(tag)) setTags((prev) => [...prev, tag]);
    },
    [tags],
  );

  const handleRemoveTag = useCallback((tag: string) => {
    setTags((prev) => prev.filter((t) => t !== tag));
  }, []);

  const handleTagSelect = useCallback(
    (tag: string) => {
      handleAddTag(tag);
      setSelectedTag("");
    },
    [handleAddTag],
  );

  const handleImageUpload = useCallback(
    async (file: File) => {
      if (!file.type.startsWith("image/")) {
        toast.error("Solo se permiten imágenes");
        return;
      }
      if (file.size > 10 * 1024 * 1024) {
        toast.error("La imagen no puede superar 10MB");
        return;
      }

      setUploading(true);
      try {
        const result = await uploadBlogImage(file);
        if (result.ok && result.url) {
          const markdownImage = `![${file.name}](${result.url})`;
          const textarea = textareaRef.current;
          if (textarea) {
            const start = textarea.selectionStart;
            const end = textarea.selectionEnd;
            const next =
              content.slice(0, start) + markdownImage + content.slice(end);
            setContent(next);
            setTimeout(() => {
              textarea.focus();
              const newPos = start + markdownImage.length;
              textarea.setSelectionRange(newPos, newPos);
            }, 0);
          } else {
            setContent((prev) => prev + "\n" + markdownImage);
          }
          toast.success("Imagen insertada");
        } else {
          toast.error(result.error ?? "Error al subir imagen");
        }
      } finally {
        setUploading(false);
      }
    },
    [content],
  );

  const handleFileChange = useCallback(
    async (e: ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) {
        await handleImageUpload(file);
        if (fileInputRef.current) fileInputRef.current.value = "";
      }
    },
    [handleImageUpload],
  );

  const handleDragOver = useCallback((e: DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback(
    async (e: DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      const files = Array.from(e.dataTransfer.files).filter((f) =>
        f.type.startsWith("image/"),
      );
      for (const file of files) {
        await handleImageUpload(file);
      }
    },
    [handleImageUpload],
  );

  const handleSubmit = useCallback(async () => {
    if (!title.trim()) {
      toast.error("El título es obligatorio");
      return;
    }
    if (!content.trim()) {
      toast.error("El contenido es obligatorio");
      return;
    }

    setSaving(true);
    try {
      const result = await createBlogPost({
        title: title.trim(),
        content,
        tags,
        type: POST_TYPE,
      });
      if (result.ok && result.post) {
        toast.success("Entrada creada");
        router.push(`/blog-actuality/${result.post.id}`);
      } else {
        toast.error(result.error ?? "Error al crear la entrada");
      }
    } catch {
      toast.error("Ocurrió un error inesperado al publicar");
    } finally {
      setSaving(false);
    }
  }, [title, content, tags, router]);

  if (!session) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center px-4">
        <p className="text-muted-foreground">
          Inicia sesión para crear una entrada.
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-6xl flex-1 px-4 py-8">
      <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Nueva entrada
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Editor Markdown con vista previa; arrastra imágenes al panel
            izquierdo.
          </p>
        </div>
      </div>

      <ActualityMarkdownComposer
        title={title}
        onTitleChange={setTitle}
        content={content}
        onContentChange={setContent}
        tags={tags}
        tagOptions={ACTUALITY_TAGS}
        selectedTag={selectedTag}
        onTagSelect={handleTagSelect}
        onRemoveTag={handleRemoveTag}
        textareaRef={textareaRef}
        fileInputRef={fileInputRef}
        onFileChange={handleFileChange}
        isDragging={isDragging}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onPickImage={() => fileInputRef.current?.click()}
        uploading={uploading}
        mentionUsers={mentionUsers}
        density="full"
        footerActions={
          <div className="flex flex-wrap justify-end gap-2 pt-2">
            <Button variant="outline" asChild>
              <Link href="/blog-actuality">Cancelar</Link>
            </Button>
            <Button onClick={() => void handleSubmit()} disabled={saving}>
              {saving ? (
                <>
                  <Loader2Icon className="mr-2 h-4 w-4 animate-spin" />
                  Guardando...
                </>
              ) : (
                <>
                  <SendIcon className="mr-2 h-4 w-4" />
                  Publicar
                </>
              )}
            </Button>
          </div>
        }
      />
    </div>
  );
}
