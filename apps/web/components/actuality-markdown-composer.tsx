"use client";

import {
  useState,
  type ChangeEvent,
  type DragEvent,
  type ReactNode,
  type RefObject,
} from "react";
import {
  BoldIcon,
  CodeIcon,
  ImageIcon,
  ItalicIcon,
  LinkIcon,
  Loader2Icon,
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

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

function insertAroundSelection(
  textarea: HTMLTextAreaElement,
  value: string,
  setValue: (v: string) => void,
  before: string,
  after: string,
) {
  const start = textarea.selectionStart;
  const end = textarea.selectionEnd;
  const selected = value.slice(start, end);
  const inner = selected || "texto";
  const insertion = `${before}${inner}${after}`;
  const next = value.slice(0, start) + insertion + value.slice(end);
  setValue(next);
  requestAnimationFrame(() => {
    textarea.focus();
    const pos = start + before.length + inner.length;
    textarea.setSelectionRange(pos, pos);
  });
}

export function ActualityMarkdownComposer(props: {
  title: string;
  onTitleChange: (v: string) => void;
  content: string;
  onContentChange: (v: string) => void;
  tags: string[];
  tagOptions: readonly string[];
  selectedTag: string;
  onTagSelect: (tag: string) => void;
  onRemoveTag: (tag: string) => void;
  textareaRef: RefObject<HTMLTextAreaElement | null>;
  fileInputRef: RefObject<HTMLInputElement | null>;
  onFileChange: (e: ChangeEvent<HTMLInputElement>) => void;
  isDragging: boolean;
  onDragOver: (e: DragEvent) => void;
  onDragLeave: (e: DragEvent) => void;
  onDrop: (e: DragEvent) => void;
  onPickImage: () => void;
  uploading: boolean;
  footerActions: ReactNode;
  density?: "md" | "full";
}) {
  const {
    title,
    onTitleChange,
    content,
    onContentChange,
    tags,
    tagOptions,
    selectedTag,
    onTagSelect,
    onRemoveTag,
    textareaRef,
    fileInputRef,
    onFileChange,
    isDragging,
    onDragOver,
    onDragLeave,
    onDrop,
    onPickImage,
    uploading,
    footerActions,
    density = "full",
  } = props;

  const [mobileTab, setMobileTab] = useState<"edit" | "preview">("edit");

  const runToolbar = (action: "bold" | "italic" | "code" | "link") => {
    const ta = textareaRef.current;
    if (!ta) return;
    switch (action) {
      case "bold":
        insertAroundSelection(ta, content, onContentChange, "**", "**");
        break;
      case "italic":
        insertAroundSelection(ta, content, onContentChange, "*", "*");
        break;
      case "code":
        insertAroundSelection(ta, content, onContentChange, "`", "`");
        break;
      case "link": {
        const url = window.prompt("URL del enlace", "https://");
        if (url === null) return;
        const start = ta.selectionStart;
        const end = ta.selectionEnd;
        const selected = content.slice(start, end) || "texto";
        const insertion = `[${selected}](${url})`;
        const next = content.slice(0, start) + insertion + content.slice(end);
        onContentChange(next);
        requestAnimationFrame(() => {
          ta.focus();
          const pos = start + insertion.length;
          ta.setSelectionRange(pos, pos);
        });
        break;
      }
    }
  };

  const editorMinH =
    density === "full" ? "min-h-[min(70vh,560px)]" : "min-h-[320px]";

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <label htmlFor="actuality-title" className="text-sm font-medium">
          Título
        </label>
        <Input
          id="actuality-title"
          placeholder="Título de la entrada..."
          value={title}
          onChange={(e) => onTitleChange(e.target.value)}
          className="text-lg font-medium"
        />
      </div>

      <div className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-sm font-medium">Markdown</span>
          <div className="flex lg:hidden">
            <Button
              type="button"
              variant={mobileTab === "edit" ? "secondary" : "ghost"}
              size="sm"
              className="rounded-r-none"
              onClick={() => setMobileTab("edit")}
            >
              Escribir
            </Button>
            <Button
              type="button"
              variant={mobileTab === "preview" ? "secondary" : "ghost"}
              size="sm"
              className="rounded-l-none border-l border-border"
              onClick={() => setMobileTab("preview")}
            >
              Vista previa
            </Button>
          </div>
        </div>

        <div className="flex flex-wrap gap-1 rounded-t-md border border-b-0 border-border/60 bg-muted/40 px-2 py-1.5">
          <span className="mr-2 self-center text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
            Insertar
          </span>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-8 px-2"
            onClick={() => runToolbar("bold")}
            title="Negrita (**)"
          >
            <BoldIcon className="size-4" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-8 px-2"
            onClick={() => runToolbar("italic")}
            title="Cursiva (*)"
          >
            <ItalicIcon className="size-4" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-8 px-2"
            onClick={() => runToolbar("code")}
            title="Código (`)"
          >
            <CodeIcon className="size-4" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-8 px-2"
            onClick={() => runToolbar("link")}
            title="Enlace"
          >
            <LinkIcon className="size-4" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-8 px-2"
            onClick={onPickImage}
            disabled={uploading}
            title="Subir imagen"
          >
            {uploading ? (
              <Loader2Icon className="size-4 animate-spin" />
            ) : (
              <ImageIcon className="size-4" />
            )}
          </Button>
        </div>

        <div
          className={`grid gap-0 overflow-hidden rounded-b-md border border-border/60 bg-background lg:grid-cols-2 ${editorMinH}`}
        >
          <div
            className={`flex min-h-0 flex-col border-border/60 lg:border-r ${
              mobileTab === "preview" ? "hidden lg:flex" : "flex"
            }`}
          >
            <div className="border-b border-border/50 bg-muted/30 px-3 py-1.5 text-[11px] text-muted-foreground">
              Editor · arrastra imágenes aquí
            </div>
            <div
              className={`relative min-h-0 flex-1 ${
                isDragging ? "bg-primary/5" : ""
              }`}
              onDragOver={onDragOver}
              onDragLeave={onDragLeave}
              onDrop={onDrop}
            >
              <Textarea
                ref={textareaRef}
                id="actuality-content"
                placeholder={`# Encabezado

Escribe en **Markdown**. @menciones y listas.

Arrastra imágenes para insertarlas.`}
                value={content}
                onChange={(e) => onContentChange(e.target.value)}
                className="min-h-[280px] flex-1 resize-none border-0 bg-transparent px-3 py-3 font-mono text-sm leading-relaxed focus-visible:ring-0 lg:min-h-0"
                spellCheck={false}
              />
              <div
                className="pointer-events-none absolute inset-y-0 left-0 w-0.5 bg-primary/50"
                aria-hidden
              />
              {isDragging && (
                <div className="absolute inset-0 flex items-center justify-center bg-primary/10">
                  <p className="text-sm font-medium text-primary">
                    Suelta la imagen
                  </p>
                </div>
              )}
            </div>
          </div>

          <div
            className={`flex min-h-0 flex-col bg-muted/20 ${
              mobileTab === "edit" ? "hidden lg:flex" : "flex"
            }`}
          >
            <div className="border-b border-border/50 px-3 py-1.5 text-[11px] text-muted-foreground">
              Vista previa
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto p-4">
              {content.trim() ? (
                <div className="prose prose-sm max-w-none dark:prose-invert prose-p:leading-relaxed">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>
                    {content}
                  </ReactMarkdown>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  La vista previa aparecerá aquí.
                </p>
              )}
            </div>
          </div>
        </div>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={onFileChange}
      />

      <div className="space-y-2">
        <label className="text-sm font-medium">Etiquetas (opcional)</label>
        <div className="flex flex-wrap gap-2">
          {tags.map((tag) => (
            <Badge key={tag} variant="secondary" className="gap-1">
              {tag}
              <button
                type="button"
                onClick={() => onRemoveTag(tag)}
                className="ml-1 hover:text-destructive"
              >
                ×
              </button>
            </Badge>
          ))}
        </div>
        <Select value={selectedTag} onValueChange={onTagSelect}>
          <SelectTrigger className="w-full max-w-md">
            <SelectValue placeholder="Añadir etiqueta..." />
          </SelectTrigger>
          <SelectContent>
            {tagOptions
              .filter((t) => !tags.includes(t))
              .map((tag) => (
                <SelectItem key={tag} value={tag}>
                  {tag}
                </SelectItem>
              ))}
          </SelectContent>
        </Select>
      </div>

      {footerActions}
    </div>
  );
}
