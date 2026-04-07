"use client";

import { useCallback, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeftIcon, Loader2Icon, XIcon, SendIcon, GripVerticalIcon } from "lucide-react";
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
import { createBlogPost, uploadBlogImage } from "@/lib/blog-api";
import { BLOG_TAGS } from "@/lib/blog-tags";
import { useAuth } from "@/hooks/auth";

export default function NewBlogPostPage() {
  const router = useRouter();
  const { session } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [selectedTag, setSelectedTag] = useState("");
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [isDragging, setIsDragging] = useState(false);

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
            const end = textarea.selectionEnd;
            const newContent = content.slice(0, start) + markdownImage + content.slice(end);
            setContent(newContent);
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
      const result = await createBlogPost({
        title: title.trim(),
        content,
        tags,
      });
      if (result.ok && result.post) {
        toast.success("Post creado");
        router.push(`/blog/${result.post.id}`);
      } else {
        toast.error(result.error ?? "Error al crear el post");
      }
    } finally {
      setSaving(false);
    }
  }, [title, content, tags, router]);

  if (!session) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <p className="text-muted-foreground">Inicia sesión para crear un post.</p>
      </div>
    );
  }

  return (
    <div className="container mx-auto max-w-4xl space-y-6 px-4 py-8">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" asChild>
          <Link href="/blog">
            <ArrowLeftIcon className="h-4 w-4" />
          </Link>
        </Button>
        <h1 className="text-2xl font-bold tracking-tight">Nuevo post</h1>
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
        </div>
      </Card>

      <div className="flex justify-end gap-2">
        <Button variant="outline" asChild>
          <Link href="/blog">Cancelar</Link>
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
    </div>
  );
}