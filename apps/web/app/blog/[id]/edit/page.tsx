"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeftIcon, Loader2Icon, XIcon, GripVerticalIcon, SaveIcon } from "lucide-react";
import { toast } from "sonner";

import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { fetchBlogPost, updateBlogPost, uploadBlogImage, type BlogPost } from "@/lib/blog-api";
import { BLOG_TAGS } from "@/lib/blog-tags";
import { useAuth } from "@/hooks/auth";

export default function EditBlogPostPage() {
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

  const userRole = (session?.user as { role?: string })?.role;
  const isAdmin = userRole === "admin";
  const isAuthor = post && session?.user?.id === post.authorId;
  const canEdit = isAuthor || isAdmin;

  useEffect(() => {
    if (!session) return;
    void (async () => {
      const data = await fetchBlogPost(id);
      if (!data) {
        toast.error("Post no encontrado");
        router.push("/blog");
        return;
      }
      const userRoleCheck = (session?.user as { role?: string })?.role;
      const isAuthorCheck = session?.user?.id === data.authorId;
      if (!isAuthorCheck && userRoleCheck !== "admin") {
        toast.error("No tienes permiso para editar este post");
        router.push("/blog");
        return;
      }
      setPost(data);
      setTitle(data.title);
      setContent(data.content);
      setTags(data.tags);
      setLoading(false);
    })();
  }, [id, router, session]);

  const handleAddTag = useCallback((tag: string) => {
    if (tag && !tags.includes(tag)) {
      setTags((prev) => [...prev, tag]);
    }
  }, [tags]);

  const handleRemoveTag = useCallback((tag: string) => {
    setTags((prev) => prev.filter((t) => t !== tag));
  }, []);

  const handleTagSelect = useCallback((tag: string) => {
    handleAddTag(tag);
    setSelectedTag("");
  }, [handleAddTag]);

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
            const newContent = content.slice(0, start) + markdownImage + content.slice(start);
            setContent(newContent);
            setTimeout(() => {
              textarea.focus();
              textarea.setSelectionRange(start + markdownImage.length, start + markdownImage.length);
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
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) {
        await handleImageUpload(file);
        if (fileInputRef.current) fileInputRef.current.value = "";
      }
    },
    [handleImageUpload],
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback(
    async (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      const files = Array.from(e.dataTransfer.files).filter((f) => f.type.startsWith("image/"));
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

    setSaving(true);
    try {
      const result = await updateBlogPost(id, {
        title: title.trim(),
        content,
        tags,
      });
      if (result.ok && result.post) {
        toast.success("Post actualizado");
        router.push(`/blog/${id}`);
      } else {
        toast.error(result.error ?? "Error al actualizar el post");
      }
    } finally {
      setSaving(false);
    }
  }, [id, title, content, tags, post?.images, router]);

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2Icon className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!post) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <p className="text-muted-foreground">Post no encontrado</p>
      </div>
    );
  }

  return (
    <div className="container mx-auto max-w-4xl space-y-6 px-4 py-8">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" asChild>
          <Link href={`/blog/${id}`}>
            <ArrowLeftIcon className="h-4 w-4" />
          </Link>
        </Button>
        <h1 className="text-2xl font-bold tracking-tight">Editar post</h1>
      </div>

      <Card className="p-6">
        <div className="space-y-4">
          <div className="space-y-2">
            <label htmlFor="title" className="text-sm font-medium">
              Título
            </label>
            <Input
              id="title"
              placeholder="Título del post..."
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <label htmlFor="content" className="text-sm font-medium">
              Contenido (Markdown)
            </label>
            <div
              className={`relative rounded-md border transition-colors ${
                isDragging ? "border-primary bg-primary/5" : ""
              }`}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
            >
              <Textarea
                ref={textareaRef}
                id="content"
                placeholder={`Escribe el contenido en markdown...

Usa @username para mencionar usuarios
Arrastra y suelta imágenes para insertarlas`}
                value={content}
                onChange={(e) => setContent(e.target.value)}
                rows={25}
                className="resize-none border-0 font-mono text-sm focus-visible:ring-0"
              />
              {isDragging && (
                <div className="absolute inset-0 flex items-center justify-center rounded-md bg-primary/10">
                  <p className="text-sm text-primary">Suelta la imagen aquí</p>
                </div>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              Arrastra y suelta imágenes directamente en el editor
            </p>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">Etiquetas</label>
            <div className="flex flex-wrap gap-2">
              {tags.map((tag) => (
                <Badge key={tag} variant="secondary" className="gap-1">
                  {tag}
                  <button
                    type="button"
                    onClick={() => handleRemoveTag(tag)}
                    className="ml-1 hover:text-destructive"
                  >
                    <XIcon className="h-3 w-3" />
                  </button>
                </Badge>
              ))}
            </div>
            <Select value={selectedTag} onValueChange={handleTagSelect}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Selecciona una etiqueta..." />
              </SelectTrigger>
              <SelectContent>
                {BLOG_TAGS.filter((t) => !tags.includes(t)).map((tag) => (
                  <SelectItem key={tag} value={tag}>
                    {tag}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">Adjuntar imagen</label>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleFileChange}
              className="hidden"
            />
            <Button
              type="button"
              variant="outline"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
            >
              {uploading ? (
                <Loader2Icon className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <GripVerticalIcon className="mr-2 h-4 w-4" />
              )}
              {uploading ? "Subiendo..." : "Seleccionar imagen"}
            </Button>
          </div>
        </div>
      </Card>

      <div className="flex justify-end gap-2">
        <Button variant="outline" asChild>
          <Link href={`/blog/${id}`}>Cancelar</Link>
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
    </div>
  );
}