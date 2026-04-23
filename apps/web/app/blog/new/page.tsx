"use client";

import { useCallback, useMemo, useState, type ElementType } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertCircleIcon,
  ClipboardCheckIcon,
  EyeIcon,
  AlertTriangleIcon,
  ShieldCheckIcon,
  Loader2Icon,
  SendIcon,
  XIcon,
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { toast } from "sonner";

import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { createBlogPost } from "@/services/blog-api";
import { BLOG_TAGS } from "@/consts/blog-tags";
import {
  generateMarkdown,
  type LessonFields,
} from "@/lib/blog/lesson-markdown";
import { useAuth } from "@/hooks";

const SECTIONS: {
  key: keyof LessonFields;
  label: string;
  icon: ElementType;
  placeholder: string;
}[] = [
  {
    key: "problem",
    label: "¿Qué problema se presentó?",
    icon: AlertCircleIcon,
    placeholder: "Describe el problema o error...",
  },
  {
    key: "howDiscovered",
    label: "¿Cómo te diste cuenta?",
    icon: EyeIcon,
    placeholder:
      "Explica cómo detectaste el problema (logs, alertas, reporte, etc.)...",
  },
  {
    key: "consequences",
    label: "¿Cuáles son las consecuencias?",
    icon: AlertTriangleIcon,
    placeholder: "Impacto en usuarios, sistema, datos, negocio...",
  },
  {
    key: "measuresTaken",
    label: "¿Qué medidas tomaste?",
    icon: ShieldCheckIcon,
    placeholder: "Acciones inmediatas tomadas para resolver...",
  },
  {
    key: "prevention",
    label: "¿Qué acciones se tomarán para que no se repita?",
    icon: ClipboardCheckIcon,
    placeholder: "Mejoras, alertas, tests, documentación, procesos...",
  },
];

export default function NewLessonPage() {
  const router = useRouter();
  const { session } = useAuth();
  const [saving, setSaving] = useState(false);
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

  const previewMd = useMemo(() => generateMarkdown(fields), [fields]);

  const updateField = useCallback((key: keyof LessonFields, value: string) => {
    setFields((prev) => ({ ...prev, [key]: value }));
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
      const content = generateMarkdown(fields);
      const result = await createBlogPost({
        title: title.trim(),
        content,
        tags,
      });
      if (result.ok && result.post) {
        toast.success("Lección creada");
        router.push(`/blog/${result.post.id}`);
      } else {
        toast.error(result.error ?? "Error al crear la lección");
      }
    } catch {
      toast.error("Ocurrió un error inesperado al publicar");
    } finally {
      setSaving(false);
    }
  }, [title, fields, tags, router]);

  if (!session) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center px-4">
        <p className="text-muted-foreground">
          Inicia sesión para crear una lección.
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-6xl flex-1 px-4 py-8">
      <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Nueva lección
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Completa cada bloque; a la derecha ves el markdown generado.
          </p>
        </div>
        <div className="flex shrink-0 gap-2">
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

      <div className="grid gap-8 lg:grid-cols-2 lg:items-start">
        <div className="space-y-6">
          <div className="space-y-2">
            <label htmlFor="lesson-title" className="text-sm font-medium">
              Título
            </label>
            <Input
              id="lesson-title"
              placeholder="Ej: Error en validación de clientes..."
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="text-lg font-medium"
            />
          </div>

          <div className="space-y-2">
            {SECTIONS.map((section, index) => {
              const Icon = section.icon;
              return (
                <details
                  key={section.key}
                  className="group border-b border-border/50 pb-1"
                  open={index === 0}
                >
                  <summary className="flex cursor-pointer list-none items-center gap-2 py-2 text-sm font-medium marker:hidden [&::-webkit-details-marker]:hidden">
                    <Icon className="size-4 shrink-0 text-muted-foreground" />
                    <span className="flex-1 text-left">{section.label}</span>
                    <span className="text-xs text-muted-foreground group-open:rotate-180">
                      ▾
                    </span>
                  </summary>
                  <Textarea
                    placeholder={section.placeholder}
                    value={fields[section.key]}
                    onChange={(e) => updateField(section.key, e.target.value)}
                    rows={4}
                    className="mt-2 resize-none text-sm"
                  />
                </details>
              );
            })}
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
              <SelectTrigger className="w-full max-w-md">
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

        <div className="lg:sticky lg:top-4 lg:max-h-[calc(100vh-6rem)] lg:overflow-y-auto">
          <div className="rounded-lg border border-border/60 bg-muted/15">
            <div className="border-b border-border/50 px-4 py-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              Vista previa · Markdown
            </div>
            <div className="p-4">
              {previewMd.trim() ? (
                <div className="prose prose-sm max-w-none dark:prose-invert prose-headings:scroll-mt-20 prose-hr:my-7">
                  <ReactMarkdown
                    remarkPlugins={[remarkGfm]}
                    components={{
                      p: ({ className, ...props }) => (
                        <p
                          className={`whitespace-pre-line ${className ?? ""}`}
                          {...props}
                        />
                      ),
                      hr: ({ className, ...props }) => (
                        <hr
                          className={`my-5 border-border/70 ${className ?? ""}`}
                          {...props}
                        />
                      ),
                    }}
                  >
                    {previewMd}
                  </ReactMarkdown>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Escribe en los bloques de la izquierda para ver el resultado.
                </p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
