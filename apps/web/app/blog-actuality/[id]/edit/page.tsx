"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type DragEvent,
} from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeftIcon, Loader2Icon, SaveIcon } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { ActualityMarkdownComposer } from "@/components/actuality-markdown-composer";
import {
  fetchBlogPost,
  updateBlogPost,
  uploadBlogImage,
  type BlogPost,
} from "@/services/blog-api";
import { ACTUALITY_TAGS } from "@/consts/blog-tags";
import { fetchOrganizationUsers } from "@/services/organization-api";
import { useAuth } from "@/hooks";

const POST_TYPE = "actuality" as const;

export default function EditActualityPage() {
  const params = useParams();
  const router = useRouter();
  const { session } = useAuth();
  const id = params.id as string;
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const [post, setPost] = useState<BlogPost | null>(null);
  const [loading, setLoading] = useState(true);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [selectedTag, setSelectedTag] = useState("");
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [mentionUsers, setMentionUsers] = useState<
    Array<{ id: string; name: string; email: string; mention: string }>
  >([]);

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

  useEffect(() => {
    if (!session) return;
    void (async () => {
      const data = await fetchBlogPost(id);
      if (!data) {
        toast.error("Entrada no encontrada");
        router.push("/blog-actuality");
        return;
      }
      if (data.type !== "actuality") {
        toast.error("Entrada no encontrada");
        router.push("/blog-actuality");
        return;
      }
      const userRoleCheck = (session?.user as { role?: string })?.role;
      const isAuthorCheck = session?.user?.id === data.authorId;
      if (!isAuthorCheck && userRoleCheck !== "admin") {
        toast.error("No tienes permiso para editar esta entrada");
        router.push("/blog-actuality");
        return;
      }
      setPost(data);
      setTitle(data.title);
      setContent(data.content);
      setTags(data.tags);
      setLoading(false);
    })();
  }, [id, router, session]);

  const handleAddTag = useCallback(
    (tag: string) => {
      if (tag && !tags.includes(tag)) {
        setTags((prev) => [...prev, tag]);
      }
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
            const newContentValue =
              content.slice(0, start) + markdownImage + content.slice(end);
            setContent(newContentValue);
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
      const result = await updateBlogPost(id, {
        title: title.trim(),
        content,
        tags,
        type: POST_TYPE,
      });
      if (result.ok && result.post) {
        toast.success("Entrada actualizada");
        router.push(`/blog-actuality/${id}`);
      } else {
        toast.error(result.error ?? "Error al actualizar la entrada");
      }
    } finally {
      setSaving(false);
    }
  }, [id, title, content, tags, router]);

  if (loading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <Loader2Icon className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!post) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <p className="text-muted-foreground">Entrada no encontrada</p>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-6xl flex-1 px-4 py-8">
      <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-3">
          <Button variant="ghost" size="icon" className="shrink-0" asChild>
            <Link href={`/blog-actuality/${id}`}>
              <ArrowLeftIcon className="h-4 w-4" />
            </Link>
          </Button>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">
              Editar entrada
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Markdown con vista previa en tiempo real.
            </p>
          </div>
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
              <Link href={`/blog-actuality/${id}`}>Cancelar</Link>
            </Button>
            <Button onClick={() => void handleSubmit()} disabled={saving}>
              {saving ? (
                <>
                  <Loader2Icon className="mr-2 h-4 w-4 animate-spin" />
                  Guardando...
                </>
              ) : (
                <>
                  <SaveIcon className="mr-2 h-4 w-4" />
                  Guardar cambios
                </>
              )}
            </Button>
          </div>
        }
      />
    </div>
  );
}
