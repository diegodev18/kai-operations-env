"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeftIcon,
  Loader2Icon,
  XIcon,
  SaveIcon,
  AlertCircleIcon,
  EyeIcon,
  AlertTriangleIcon,
  ShieldCheckIcon,
  ClipboardCheckIcon,
} from "lucide-react";
import { toast } from "sonner";

import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { fetchBlogPost, updateBlogPost, type BlogPost } from "@/lib/blog-api";
import { BLOG_TAGS } from "@/lib/blog-tags";
import { useAuth } from "@/hooks/auth";

interface LessonFields {
  problem: string;
  howDiscovered: string;
  consequences: string;
  measuresTaken: string;
  prevention: string;
}

function parseMarkdownContent(content: string): LessonFields {
  const sections: Record<keyof LessonFields, string> = {
    problem: "",
    howDiscovered: "",
    consequences: "",
    measuresTaken: "",
    prevention: "",
  };

  const sectionHeaders: Record<keyof LessonFields, RegExp> = {
    problem: /¿Qué problema se presentó\?/i,
    howDiscovered: /¿Cómo te diste cuenta\?/i,
    consequences: /¿Cuáles son las consecuencias\?/i,
    measuresTaken: /¿Qué medidas tomaste\?/i,
    prevention: /¿Qué acciones se tomarán para que no se repita\?/i,
  };

  const lines = content.split("\n");
  let currentSection: keyof LessonFields | null = null;
  let currentContent: string[] = [];

  for (const line of lines) {
    const headerMatch = line.match(/^##\s+(.+)$/);
    
    if (headerMatch) {
      const header = headerMatch[1];
      let matchedSection: keyof LessonFields | null = null;

      for (const [key, regex] of Object.entries(sectionHeaders)) {
        if (regex.test(header)) {
          matchedSection = key as keyof LessonFields;
          break;
        }
      }

      if (matchedSection) {
        if (currentSection && currentContent.length > 0) {
          sections[currentSection] = currentContent.join("\n").trim();
        }
        currentSection = matchedSection;
        currentContent = [];
      } else {
        currentContent.push(line);
      }
    } else if (currentSection) {
      currentContent.push(line);
    }
  }

  if (currentSection && currentContent.length > 0) {
    sections[currentSection] = currentContent.join("\n").trim();
  }

  return sections;
}

function generateMarkdown(fields: LessonFields): string {
  const parts: string[] = [];

  if (fields.problem.trim()) {
    parts.push(`## ¿Qué problema se presentó?\n${fields.problem.trim()}`);
  }

  if (fields.howDiscovered.trim()) {
    parts.push(`## ¿Cómo te diste cuenta?\n${fields.howDiscovered.trim()}`);
  }

  if (fields.consequences.trim()) {
    parts.push(`## ¿Cuáles son las consecuencias?\n${fields.consequences.trim()}`);
  }

  if (fields.measuresTaken.trim()) {
    parts.push(`## ¿Qué medidas tomaste?\n${fields.measuresTaken.trim()}`);
  }

  if (fields.prevention.trim()) {
    parts.push(`## ¿Qué acciones se tomarán para que no se repita?\n${fields.prevention.trim()}`);
  }

  return parts.join("\n\n");
}

function MarkdownField({
  label,
  icon: Icon,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  icon: React.ElementType;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
}) {
  return (
    <div className="space-y-2">
      <label className="flex items-center gap-2 text-sm font-medium">
        <Icon className="h-4 w-4 text-muted-foreground" />
        {label}
      </label>
      <Textarea
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={4}
        className="resize-none font-mono text-sm"
      />
      <p className="text-xs text-muted-foreground">
        Markdown permitido: **bold**, *italic*, `code`, [links](url), listas
      </p>
    </div>
  );
}

export default function EditLessonPage() {
  const params = useParams();
  const router = useRouter();
  const { session } = useAuth();
  const id = params.id as string;

  const [post, setPost] = useState<BlogPost | null>(null);
  const [loading, setLoading] = useState(true);
  const [title, setTitle] = useState("");
  const [fields, setFields] = useState<LessonFields>({
    problem: "",
    howDiscovered: "",
    consequences: "",
    measuresTaken: "",
    prevention: "",
  });
  const [tags, setTags] = useState<string[]>([]);
  const [selectedTag, setSelectedTag] = useState("");
  const [saving, setSaving] = useState(false);
  const [showPreview, setShowPreview] = useState(false);

  useEffect(() => {
    if (!session) return;
    void (async () => {
      const data = await fetchBlogPost(id);
      if (!data) {
        toast.error("Lección no encontrada");
        router.push("/blog");
        return;
      }
      const userRoleCheck = (session?.user as { role?: string })?.role;
      const isAuthorCheck = session?.user?.id === data.authorId;
      if (!isAuthorCheck && userRoleCheck !== "admin") {
        toast.error("No tienes permiso para editar esta lección");
        router.push("/blog");
        return;
      }
      setPost(data);
      setTitle(data.title);
      setFields(parseMarkdownContent(data.content));
      setTags(data.tags);
      setLoading(false);
    })();
  }, [id, router, session]);

  const updateField = useCallback(
    (key: keyof LessonFields, value: string) => {
      setFields((prev) => ({ ...prev, [key]: value }));
    },
    []
  );

  const handleAddTag = useCallback(
    (tag: string) => {
      if (tag && !tags.includes(tag)) {
        setTags((prev) => [...prev, tag]);
      }
    },
    [tags]
  );

  const handleRemoveTag = useCallback((tag: string) => {
    setTags((prev) => prev.filter((t) => t !== tag));
  }, []);

  const handleTagSelect = useCallback(
    (tag: string) => {
      handleAddTag(tag);
      setSelectedTag("");
    },
    [handleAddTag]
  );

  const content = generateMarkdown(fields);

  const handleSubmit = useCallback(async () => {
    if (!title.trim()) {
      toast.error("El título es obligatorio");
      return;
    }

    const hasContent = Object.values(fields).some((f) => f.trim());
    if (!hasContent) {
      toast.error("Completa al menos una sección");
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
        toast.success("Lección actualizada");
        router.push(`/blog/${id}`);
      } else {
        toast.error(result.error ?? "Error al actualizar la lección");
      }
    } finally {
      setSaving(false);
    }
  }, [id, title, fields, tags, content, router]);

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
        <p className="text-muted-foreground">Lección no encontrada</p>
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
        <h1 className="text-2xl font-bold tracking-tight">Editar lección</h1>
      </div>

      <Card className="p-6">
        <div className="space-y-6">
          <div className="space-y-2">
            <label htmlFor="title" className="text-sm font-medium">
              Título
            </label>
            <Input
              id="title"
              placeholder="Ej: Error en validación de clientes..."
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>

          <div className="grid gap-6">
            <MarkdownField
              label="¿Qué problema se presentó?"
              icon={AlertCircleIcon}
              value={fields.problem}
              onChange={(v) => updateField("problem", v)}
              placeholder="Describe el problema o error..."
            />

            <MarkdownField
              label="¿Cómo te diste cuenta?"
              icon={EyeIcon}
              value={fields.howDiscovered}
              onChange={(v) => updateField("howDiscovered", v)}
              placeholder="Explica cómo detectaste el problema (logs, alertas, reporte, etc.)..."
            />

            <MarkdownField
              label="¿Cuáles son las consecuencias?"
              icon={AlertTriangleIcon}
              value={fields.consequences}
              onChange={(v) => updateField("consequences", v)}
              placeholder="Impacto en usuarios, sistema, datos, negocio..."
            />

            <MarkdownField
              label="¿Qué medidas tomaste?"
              icon={ShieldCheckIcon}
              value={fields.measuresTaken}
              onChange={(v) => updateField("measuresTaken", v)}
              placeholder="Acciones inmediatas tomadas para resolver..."
            />

            <MarkdownField
              label="¿Qué acciones se tomarán para que no se repita?"
              icon={ClipboardCheckIcon}
              value={fields.prevention}
              onChange={(v) => updateField("prevention", v)}
              placeholder="Mejoras, alertas, tests, documentación, procesos..."
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">Etiquetas (opcional)</label>
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

          <div className="flex justify-end">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowPreview(!showPreview)}
            >
              {showPreview ? "Ocultar preview" : "Ver preview"}
            </Button>
          </div>

          {showPreview && content && (
            <Card className="bg-muted/50 p-4">
              <h3 className="mb-2 text-sm font-medium">Preview</h3>
              <div className="prose prose-sm dark:prose-invert whitespace-pre-wrap">
                {content}
              </div>
            </Card>
          )}
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