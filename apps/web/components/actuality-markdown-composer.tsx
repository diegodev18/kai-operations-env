"use client";

import {
  useMemo,
  useState,
  type ChangeEvent,
  type DragEvent,
  type HTMLAttributes,
  type LiHTMLAttributes,
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

const markdownComponents = {
  h1: ({ className, ...props }: HTMLAttributes<HTMLHeadingElement>) => (
    <h1
      className={`text-2xl font-semibold tracking-tight text-foreground ${className ?? ""}`}
      {...props}
    />
  ),
  h2: ({ className, ...props }: HTMLAttributes<HTMLHeadingElement>) => (
    <h2
      className={`mt-6 text-xl font-semibold tracking-tight text-foreground ${className ?? ""}`}
      {...props}
    />
  ),
  h3: ({ className, ...props }: HTMLAttributes<HTMLHeadingElement>) => (
    <h3 className={`mt-5 text-lg font-medium text-foreground ${className ?? ""}`} {...props} />
  ),
  p: ({ className, ...props }: HTMLAttributes<HTMLParagraphElement>) => (
    <p
      className={`my-3 whitespace-pre-line leading-7 text-foreground/95 ${className ?? ""}`}
      {...props}
    />
  ),
  ul: ({ className, ...props }: HTMLAttributes<HTMLUListElement>) => (
    <ul className={`my-3 ml-5 list-disc space-y-1 ${className ?? ""}`} {...props} />
  ),
  ol: ({ className, ...props }: HTMLAttributes<HTMLOListElement>) => (
    <ol className={`my-3 ml-5 list-decimal space-y-1 ${className ?? ""}`} {...props} />
  ),
  li: ({ className, ...props }: LiHTMLAttributes<HTMLLIElement>) => (
    <li className={`leading-7 text-foreground/95 ${className ?? ""}`} {...props} />
  ),
  blockquote: ({ className, ...props }: HTMLAttributes<HTMLQuoteElement>) => (
    <blockquote
      className={`my-4 border-l-2 border-border pl-4 text-muted-foreground italic ${className ?? ""}`}
      {...props}
    />
  ),
  a: ({ className, ...props }: HTMLAttributes<HTMLAnchorElement>) => (
    <a
      className={`font-medium text-primary underline underline-offset-4 hover:text-primary/80 ${className ?? ""}`}
      {...props}
    />
  ),
  code: ({ className, ...props }: HTMLAttributes<HTMLElement>) => (
    <code
      className={`rounded bg-muted px-1.5 py-0.5 font-mono text-[0.85em] ${className ?? ""}`}
      {...props}
    />
  ),
  pre: ({ className, ...props }: HTMLAttributes<HTMLPreElement>) => (
    <pre
      className={`my-4 overflow-x-auto rounded-md border border-border/60 bg-muted/50 p-3 ${className ?? ""}`}
      {...props}
    />
  ),
};

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
  mentionUsers?: Array<{ id: string; name: string; email: string; mention: string }>;
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
    mentionUsers = [],
    footerActions,
    density = "full",
  } = props;

  const [mobileTab, setMobileTab] = useState<"edit" | "preview">("edit");
  const [mentionOpen, setMentionOpen] = useState(false);
  const [mentionQuery, setMentionQuery] = useState("");
  const [mentionStart, setMentionStart] = useState<number | null>(null);
  const [mentionCursor, setMentionCursor] = useState<number | null>(null);

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

  const filteredMentionUsers = useMemo(() => {
    if (!mentionOpen) return [];
    const q = mentionQuery.trim().toLowerCase();
    return mentionUsers
      .filter((u) => {
        if (!q) return true;
        return (
          u.mention.toLowerCase().includes(q) ||
          u.name.toLowerCase().includes(q) ||
          u.email.toLowerCase().includes(q)
        );
      })
      .slice(0, 8);
  }, [mentionOpen, mentionQuery, mentionUsers]);

  const updateMentionStateFromTextarea = () => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    const cursor = textarea.selectionStart;
    const beforeCursor = content.slice(0, cursor);
    const match = beforeCursor.match(/(^|\s)@(\w*)$/);
    if (!match) {
      setMentionOpen(false);
      setMentionQuery("");
      setMentionStart(null);
      setMentionCursor(null);
      return;
    }
    const query = match[2] ?? "";
    const start = cursor - query.length - 1;
    setMentionQuery(query);
    setMentionStart(start);
    setMentionCursor(cursor);
    setMentionOpen(true);
  };

  const insertMention = (mention: string) => {
    const textarea = textareaRef.current;
    if (!textarea || mentionStart == null || mentionCursor == null) return;
    const insertion = `@${mention} `;
    const next =
      content.slice(0, mentionStart) + insertion + content.slice(mentionCursor);
    onContentChange(next);
    setMentionOpen(false);
    setMentionQuery("");
    setMentionStart(null);
    setMentionCursor(null);
    requestAnimationFrame(() => {
      textarea.focus();
      const pos = mentionStart + insertion.length;
      textarea.setSelectionRange(pos, pos);
    });
  };

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
                onChange={(e) => {
                  onContentChange(e.target.value);
                  requestAnimationFrame(updateMentionStateFromTextarea);
                }}
                onKeyUp={updateMentionStateFromTextarea}
                onClick={updateMentionStateFromTextarea}
                onBlur={() => {
                  // Small delay so click on suggestion works.
                  setTimeout(() => setMentionOpen(false), 120);
                }}
                className="field-sizing-fixed h-full min-h-[320px] flex-1 resize-none border-0 bg-transparent px-3 py-3 font-mono text-sm leading-relaxed focus-visible:ring-0 lg:min-h-0"
                spellCheck={false}
              />
              {mentionOpen && filteredMentionUsers.length > 0 ? (
                <div className="absolute right-3 top-3 z-20 w-72 overflow-hidden rounded-md border border-border/70 bg-popover shadow-lg">
                  <div className="border-b border-border/60 px-2 py-1.5 text-[11px] uppercase tracking-wide text-muted-foreground">
                    Mencionar usuario
                  </div>
                  <ul className="max-h-56 overflow-y-auto py-1">
                    {filteredMentionUsers.map((user) => (
                      <li key={user.id}>
                        <button
                          type="button"
                          className="flex w-full items-start gap-2 px-2 py-1.5 text-left hover:bg-muted/60"
                          onMouseDown={(e) => {
                            e.preventDefault();
                            insertMention(user.mention);
                          }}
                        >
                          <span className="mt-0.5 rounded bg-muted px-1.5 py-0.5 font-mono text-xs text-primary">
                            @{user.mention}
                          </span>
                          <span className="min-w-0">
                            <span className="block truncate text-sm text-foreground">
                              {user.name}
                            </span>
                            <span className="block truncate text-xs text-muted-foreground">
                              {user.email}
                            </span>
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
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
                <div className="text-sm">
                  <ReactMarkdown
                    remarkPlugins={[remarkGfm]}
                    components={markdownComponents}
                  >
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
