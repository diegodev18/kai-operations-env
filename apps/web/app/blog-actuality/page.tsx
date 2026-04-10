"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  SearchIcon,
  PlusIcon,
  Loader2Icon,
  TagIcon,
  UserIcon,
  FilterIcon,
  XIcon,
  SendIcon,
  GripVerticalIcon,
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  fetchBlogPosts,
  searchBlogPosts,
  createBlogPost,
  uploadBlogImage,
  type BlogPost,
} from "@/lib/blog-api";
import { ACTUALITY_TAGS } from "@/lib/blog-tags";
import { useAuth } from "@/hooks/auth";

function formatDate(timestamp: number): string {
  return new Date(timestamp).toLocaleDateString("es-ES", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function ActualityPage() {
  const { session } = useAuth();
  const [posts, setPosts] = useState<BlogPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [, setSearching] = useState(false);
  const [selectedAuthor, setSelectedAuthor] = useState<string>("");
  const [selectedTag, setSelectedTag] = useState<string>("");
  const [showFilters, setShowFilters] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [isDragging, setIsDragging] = useState(false);

  const [newTitle, setNewTitle] = useState("");
  const [newContent, setNewContent] = useState("");
  const [newTags, setNewTags] = useState<string[]>([]);
  const [selectedNewTag, setSelectedNewTag] = useState("");
  const [showPreview, setShowPreview] = useState(false);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const POST_TYPE = "actuality";

  const loadPosts = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchBlogPosts(POST_TYPE);
      setPosts(data ?? []);
    } finally {
      setLoading(false);
    }
  }, []);

  const handleSearch = useCallback(async () => {
    const q = searchQuery.trim();
    if (!q) {
      void loadPosts();
      return;
    }
    setSearching(true);
    try {
      const data = await searchBlogPosts(q, POST_TYPE);
      setPosts(data ?? []);
    } finally {
      setSearching(false);
    }
  }, [searchQuery, loadPosts]);

  useEffect(() => {
    void loadPosts();
  }, [loadPosts]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Enter") {
        void handleSearch();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleSearch]);

  const authors = useMemo(() => {
    const authorSet = new Map<string, { id: string; mention: string; name: string }>();
    posts.forEach((post) => {
      if (!authorSet.has(post.authorId)) {
        authorSet.set(post.authorId, {
          id: post.authorId,
          mention: post.authorMention,
          name: post.authorName,
        });
      }
    });
    return Array.from(authorSet.values()).sort((a, b) =>
      a.name.localeCompare(b.name)
    );
  }, [posts]);

  const filteredPosts = useMemo(() => {
    return posts.filter((post) => {
      if (selectedAuthor && post.authorId !== selectedAuthor) {
        return false;
      }
      if (selectedTag && !post.tags.includes(selectedTag)) {
        return false;
      }
      return true;
    });
  }, [posts, selectedAuthor, selectedTag]);

  const hasActiveFilters = selectedAuthor || selectedTag || searchQuery;

  const clearFilters = useCallback(() => {
    setSelectedAuthor("");
    setSelectedTag("");
    setSearchQuery("");
    void loadPosts();
  }, [loadPosts]);

  const handleAddNewTag = useCallback((tag: string) => {
    if (tag && !newTags.includes(tag)) {
      setNewTags((prev) => [...prev, tag]);
    }
  }, [newTags]);

  const handleRemoveNewTag = useCallback((tag: string) => {
    setNewTags((prev) => prev.filter((t) => t !== tag));
  }, []);

  const handleNewTagSelect = useCallback((tag: string) => {
    handleAddNewTag(tag);
    setSelectedNewTag("");
  }, [handleAddNewTag]);

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
            const newContentValue = newContent.slice(0, start) + markdownImage + newContent.slice(end);
            setNewContent(newContentValue);
            setTimeout(() => {
              textarea.focus();
              const newPos = start + markdownImage.length;
              textarea.setSelectionRange(newPos, newPos);
            }, 0);
          } else {
            setNewContent((prev) => prev + "\n" + markdownImage);
          }
          toast.success("Imagen insertada");
        } else {
          toast.error(result.error ?? "Error al subir imagen");
        }
      } finally {
        setUploading(false);
      }
    },
    [newContent]
  );

  const handleFileChange = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) {
        await handleImageUpload(file);
        if (fileInputRef.current) fileInputRef.current.value = "";
      }
    },
    [handleImageUpload]
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
      const files = Array.from(e.dataTransfer.files).filter((f) =>
        f.type.startsWith("image/")
      );
      for (const file of files) {
        await handleImageUpload(file);
      }
    },
    [handleImageUpload]
  );

  const handleCreatePost = useCallback(async () => {
    if (!newTitle.trim()) {
      toast.error("El título es obligatorio");
      return;
    }

    if (!newContent.trim()) {
      toast.error("El contenido es obligatorio");
      return;
    }

    setSaving(true);
    try {
      const result = await createBlogPost({
        title: newTitle.trim(),
        content: newContent,
        tags: newTags,
        type: POST_TYPE,
      });
      if (result.ok && result.post) {
        toast.success("Entrada creada");
        setDialogOpen(false);
        setNewTitle("");
        setNewContent("");
        setNewTags([]);
        void loadPosts();
      } else {
        toast.error(result.error ?? "Error al crear la entrada");
      }
    } finally {
      setSaving(false);
    }
  }, [newTitle, newContent, newTags, loadPosts]);

  const resetDialog = useCallback(() => {
    setNewTitle("");
    setNewContent("");
    setNewTags([]);
    setSelectedNewTag("");
    setShowPreview(false);
  }, []);

  if (!session) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <p className="text-muted-foreground">Inicia sesión para ver la actualidad.</p>
      </div>
    );
  }

  return (
    <div className="container mx-auto max-w-5xl space-y-8 px-4 py-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Actualidad kAI</h1>
          <p className="mt-1 text-muted-foreground">
            Notas, comentarios y actualizaciones del equipo
          </p>
        </div>
        <Button onClick={() => setDialogOpen(true)}>
          <PlusIcon className="mr-2 h-4 w-4" />
          Nueva entrada
        </Button>
      </div>

      <div className="space-y-4">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <SearchIcon className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Buscar..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>
          <Button
            variant={showFilters ? "default" : "outline"}
            size="icon"
            onClick={() => setShowFilters(!showFilters)}
          >
            <FilterIcon className="h-4 w-4" />
          </Button>
        </div>

        {showFilters && (
          <div className="flex flex-wrap gap-2">
            <Select
              value={selectedAuthor}
              onValueChange={setSelectedAuthor}
            >
              <SelectTrigger className="w-[200px]">
                <SelectValue placeholder="Filtrar por autor" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">Todos los autores</SelectItem>
                {authors.map((author) => (
                  <SelectItem key={author.id} value={author.id}>
                    {author.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={selectedTag} onValueChange={setSelectedTag}>
              <SelectTrigger className="w-[200px]">
                <SelectValue placeholder="Filtrar por etiqueta" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">Todas las etiquetas</SelectItem>
                {ACTUALITY_TAGS.map((tag) => (
                  <SelectItem key={tag} value={tag}>
                    {tag}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {hasActiveFilters && (
              <Button
                variant="ghost"
                size="sm"
                onClick={clearFilters}
                className="gap-1"
              >
                <XIcon className="h-4 w-4" />
                Limpiar
              </Button>
            )}
          </div>
        )}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2Icon className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : filteredPosts.length === 0 ? (
        <div className="py-16 text-center">
          <p className="text-muted-foreground">
            {hasActiveFilters
              ? "No se encontraron resultados."
              : "No hay entradas todavía. ¡Crea la primera!"}
          </p>
        </div>
      ) : (
        <div className="grid gap-6">
          {filteredPosts.map((post) => (
            <Link key={post.id} href={`/blog-actuality/${post.id}`} className="block">
              <Card className="transition-all hover:border-primary/50 hover:shadow-md">
                <CardHeader className="gap-3">
                  <div className="flex items-start justify-between gap-2">
                    <CardTitle className="text-xl hover:text-primary">
                      {post.title}
                    </CardTitle>
                    {post.isHidden && (
                      <Badge variant="secondary">Oculto</Badge>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <UserIcon className="h-3.5 w-3.5" />
                      @{post.authorMention}
                    </span>
                    <span>{formatDate(post.createdAt)}</span>
                  </div>
                </CardHeader>
                <CardContent className="gap-4">
                  <div className="line-clamp-3 text-muted-foreground">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>
                      {post.content.slice(0, 300)}
                    </ReactMarkdown>
                  </div>
                  {post.tags.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {post.tags.map((tag) => (
                        <Badge key={tag} variant="outline" className="gap-1">
                          <TagIcon className="h-3 w-3" />
                          {tag}
                        </Badge>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}

      <Dialog
        open={dialogOpen}
        onOpenChange={(open) => {
          setDialogOpen(open);
          if (!open) resetDialog();
        }}
      >
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Nueva entrada</DialogTitle>
            <DialogDescription>
              Comparte noticias, comentarios y actualizaciones del equipo.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <label htmlFor="new-title" className="text-sm font-medium">
                Título
              </label>
              <Input
                id="new-title"
                placeholder="Título de la entrada..."
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <label htmlFor="new-content" className="text-sm font-medium">
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
                  id="new-content"
                  placeholder={`Escribe el contenido en markdown...

Usa @username para mencionar usuarios
Arrastra y suelta imágenes para insertarlas`}
                  value={newContent}
                  onChange={(e) => setNewContent(e.target.value)}
                  rows={15}
                  className="resize-none font-mono text-sm"
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
              <label className="text-sm font-medium">Etiquetas (opcional)</label>
              <div className="flex flex-wrap gap-2">
                {newTags.map((tag) => (
                  <Badge key={tag} variant="secondary" className="gap-1">
                    {tag}
                    <button
                      type="button"
                      onClick={() => handleRemoveNewTag(tag)}
                      className="ml-1 hover:text-destructive"
                    >
                      <XIcon className="h-3 w-3" />
                    </button>
                  </Badge>
                ))}
              </div>
              <Select value={selectedNewTag} onValueChange={handleNewTagSelect}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Selecciona una etiqueta..." />
                </SelectTrigger>
                <SelectContent>
                  {ACTUALITY_TAGS.filter((t) => !newTags.includes(t)).map((tag) => (
                    <SelectItem key={tag} value={tag}>
                      {tag}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex justify-between">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowPreview(!showPreview)}
              >
                {showPreview ? "Ocultar preview" : "Ver preview"}
              </Button>
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
                size="sm"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
              >
                {uploading ? (
                  <Loader2Icon className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <GripVerticalIcon className="mr-2 h-4 w-4" />
                )}
                {uploading ? "Subiendo..." : "Adjuntar imagen"}
              </Button>
            </div>

            {showPreview && newContent && (
              <Card className="bg-muted/50 p-4">
                <h3 className="mb-2 text-sm font-medium">Preview</h3>
                <div className="prose prose-sm dark:prose-invert">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>
                    {newContent}
                  </ReactMarkdown>
                </div>
              </Card>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={() => void handleCreatePost()} disabled={saving}>
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
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}