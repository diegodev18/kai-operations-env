"use client";

import { useEffect, useId, useRef, useState } from "react";
import { EditorContent, useEditor, useEditorState } from "@tiptap/react";
import { BubbleMenu } from "@tiptap/react/menus";
import type { Editor } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import { Markdown } from "@tiptap/markdown";
import {
  BoldIcon,
  CodeIcon,
  Heading2Icon,
  Heading3Icon,
  ItalicIcon,
  ListIcon,
  ListOrderedIcon,
  QuoteIcon,
  StrikethroughIcon,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

export type PromptMarkdownEditorProps = {
  value: string;
  onChange: (markdown: string) => void;
  disabled?: boolean;
  placeholder?: string;
  /** Tailwind classes for the outer shell (height, text size, etc.) */
  className?: string;
  /**
   * Vista controlada por el padre (`true` = texto raw). Si no se pasa, el conmutador
   * puede mostrarse dentro del editor (modo integrado).
   */
  rawView?: boolean;
};

export type PromptMarkdownViewToggleProps = {
  rawView: boolean;
  onRawViewChange: (raw: boolean) => void;
  disabled?: boolean;
  /** `useId()` del padre si hay varios toggles en la misma vista. */
  id?: string;
};

export function PromptMarkdownViewToggle({
  rawView,
  onRawViewChange,
  disabled = false,
  id: idProp,
}: PromptMarkdownViewToggleProps) {
  const genId = useId();
  const switchId = idProp ?? genId;

  return (
    <div
      className="flex shrink-0 items-center gap-1.5"
      role="group"
      aria-label="Vista del editor"
    >
      <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
        Markdown
      </span>
      <Switch
        id={switchId}
        checked={rawView}
        onCheckedChange={onRawViewChange}
        disabled={disabled}
        aria-label={
          rawView
            ? "Vista raw; desactivar para editor visual"
            : "Vista visual; activar para texto raw"
        }
      />
      <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
        Raw
      </span>
    </div>
  );
}

function getMarkdown(editor: Editor): string {
  const withMd = editor as Editor & { getMarkdown?: () => string };
  return withMd.getMarkdown?.() ?? "";
}

/** Referencias estables: TipTap re-despacha si `options` / `appendTo` / `shouldShow` cambian de identidad → bucle infinito con useEditorState. */
const PROMPT_BUBBLE_APPEND_TO = () => document.body;

const PROMPT_BUBBLE_MENU_OPTIONS = {
  strategy: "fixed" as const,
  placement: "top" as const,
  offset: 8,
  flip: true,
  shift: { padding: 8 },
};

function promptBubbleMenuShouldShow({
  editor: ed,
  from,
  to,
}: {
  editor: Editor;
  from: number;
  to: number;
}) {
  if (!ed.isEditable) return false;
  if (from === to) return false;
  if (ed.isActive("codeBlock")) return false;
  return true;
}

function PromptMarkdownBubbleMenu({ editor }: { editor: Editor }) {
  useEditorState({
    editor,
    selector: ({ transactionNumber }) => transactionNumber,
  });

  return (
    <BubbleMenu
      editor={editor}
      className="z-[100]"
      appendTo={PROMPT_BUBBLE_APPEND_TO}
      shouldShow={promptBubbleMenuShouldShow}
      options={PROMPT_BUBBLE_MENU_OPTIONS}
    >
      <div
        role="toolbar"
        aria-label="Formato de texto"
        className="flex flex-wrap items-center gap-0.5 rounded-lg border border-border bg-popover/95 px-1 py-1 shadow-lg backdrop-blur-sm supports-[backdrop-filter]:bg-popover/80"
      >
        <Button
          type="button"
          variant={editor.isActive("bold") ? "secondary" : "ghost"}
          size="icon"
          className="h-8 w-8 shrink-0"
          disabled={!editor.can().chain().focus().toggleBold().run()}
          onClick={() => editor.chain().focus().toggleBold().run()}
          aria-label="Negrita"
        >
          <BoldIcon className="size-4" />
        </Button>
        <Button
          type="button"
          variant={editor.isActive("italic") ? "secondary" : "ghost"}
          size="icon"
          className="h-8 w-8 shrink-0"
          disabled={!editor.can().chain().focus().toggleItalic().run()}
          onClick={() => editor.chain().focus().toggleItalic().run()}
          aria-label="Cursiva"
        >
          <ItalicIcon className="size-4" />
        </Button>
        <Button
          type="button"
          variant={editor.isActive("strike") ? "secondary" : "ghost"}
          size="icon"
          className="h-8 w-8 shrink-0"
          disabled={!editor.can().chain().focus().toggleStrike().run()}
          onClick={() => editor.chain().focus().toggleStrike().run()}
          aria-label="Tachado"
        >
          <StrikethroughIcon className="size-4" />
        </Button>
        <Button
          type="button"
          variant={editor.isActive("code") ? "secondary" : "ghost"}
          size="icon"
          className="h-8 w-8 shrink-0"
          disabled={!editor.can().chain().focus().toggleCode().run()}
          onClick={() => editor.chain().focus().toggleCode().run()}
          aria-label="Código en línea"
        >
          <CodeIcon className="size-4" />
        </Button>
        <span
          className="mx-0.5 h-5 w-px shrink-0 bg-border"
          aria-hidden
        />
        <Button
          type="button"
          variant={editor.isActive("heading", { level: 2 }) ? "secondary" : "ghost"}
          size="icon"
          className="h-8 w-8 shrink-0"
          onClick={() =>
            editor.chain().focus().toggleHeading({ level: 2 }).run()
          }
          aria-label="Título 2"
        >
          <Heading2Icon className="size-4" />
        </Button>
        <Button
          type="button"
          variant={editor.isActive("heading", { level: 3 }) ? "secondary" : "ghost"}
          size="icon"
          className="h-8 w-8 shrink-0"
          onClick={() =>
            editor.chain().focus().toggleHeading({ level: 3 }).run()
          }
          aria-label="Título 3"
        >
          <Heading3Icon className="size-4" />
        </Button>
        <Button
          type="button"
          variant={editor.isActive("blockquote") ? "secondary" : "ghost"}
          size="icon"
          className="h-8 w-8 shrink-0"
          onClick={() => editor.chain().focus().toggleBlockquote().run()}
          aria-label="Cita"
        >
          <QuoteIcon className="size-4" />
        </Button>
        <span
          className="mx-0.5 h-5 w-px shrink-0 bg-border"
          aria-hidden
        />
        <Button
          type="button"
          variant={editor.isActive("bulletList") ? "secondary" : "ghost"}
          size="icon"
          className="h-8 w-8 shrink-0"
          onClick={() => editor.chain().focus().toggleBulletList().run()}
          aria-label="Lista con viñetas"
        >
          <ListIcon className="size-4" />
        </Button>
        <Button
          type="button"
          variant={editor.isActive("orderedList") ? "secondary" : "ghost"}
          size="icon"
          className="h-8 w-8 shrink-0"
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
          aria-label="Lista numerada"
        >
          <ListOrderedIcon className="size-4" />
        </Button>
      </div>
    </BubbleMenu>
  );
}

type RichPaneProps = {
  value: string;
  onChange: (markdown: string) => void;
  disabled: boolean;
  placeholder: string;
};

function PromptMarkdownRichPane({
  value,
  onChange,
  disabled,
  placeholder,
}: RichPaneProps) {
  const lastFromEditor = useRef<string | null>(null);

  const editor = useEditor(
    {
      extensions: [
        StarterKit.configure({
          heading: { levels: [1, 2, 3] },
        }),
        Markdown,
        Placeholder.configure({
          placeholder,
          showOnlyWhenEditable: true,
        }),
      ],
      content: value || "",
      contentType: "markdown",
      immediatelyRender: false,
      editable: !disabled,
      editorProps: {
        attributes: {
          spellcheck: "true",
          class:
            "outline-none min-h-full max-w-none px-3 py-2.5 focus:outline-none",
        },
      },
      onUpdate: ({ editor: ed }) => {
        const md = getMarkdown(ed);
        lastFromEditor.current = md;
        onChange(md);
      },
    },
    [],
  );

  useEffect(() => {
    if (!editor || editor.isDestroyed) return;
    editor.setEditable(!disabled);
  }, [editor, disabled]);

  useEffect(() => {
    if (!editor || editor.isDestroyed) return;
    if (value === lastFromEditor.current) return;
    const current = getMarkdown(editor);
    if (value === current) {
      lastFromEditor.current = value;
      return;
    }
    editor.commands.setContent(value || "", {
      contentType: "markdown",
      emitUpdate: false,
    });
    lastFromEditor.current = value;
  }, [value, editor]);

  if (!editor) {
    return (
      <div className="flex h-full min-h-[8rem] flex-1 items-center justify-center bg-muted/20 text-sm text-muted-foreground">
        Cargando editor…
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      {!disabled ? <PromptMarkdownBubbleMenu editor={editor} /> : null}
      <EditorContent
        editor={editor}
        className="flex min-h-0 flex-1 flex-col overflow-y-auto text-left [&_.ProseMirror]:min-h-full [&_.ProseMirror]:whitespace-pre-wrap [&_h1]:mb-2 [&_h1]:mt-3 [&_h1]:text-xl [&_h1]:font-semibold [&_h1]:tracking-tight [&_h1]:first:mt-0 [&_h2]:mb-1.5 [&_h2]:mt-2.5 [&_h2]:text-lg [&_h2]:font-semibold [&_h2]:first:mt-0 [&_h3]:mb-1 [&_h3]:mt-2 [&_h3]:text-base [&_h3]:font-semibold [&_h3]:first:mt-0 [&_p]:my-1 [&_p]:leading-relaxed [&_ul]:my-1.5 [&_ul]:list-disc [&_ul]:pl-6 [&_ol]:my-1.5 [&_ol]:list-decimal [&_ol]:pl-6 [&_li]:my-0.5 [&_blockquote]:my-2 [&_blockquote]:border-l-2 [&_blockquote]:border-muted-foreground/40 [&_blockquote]:pl-3 [&_blockquote]:italic [&_blockquote]:text-muted-foreground [&_pre]:my-2 [&_pre]:overflow-x-auto [&_pre]:rounded-md [&_pre]:border [&_pre]:border-border [&_pre]:bg-muted/60 [&_pre]:p-3 [&_pre]:font-mono [&_pre]:text-[0.8125rem] [&_code]:rounded [&_code]:bg-muted [&_code]:px-1 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-[0.8125rem] [&_pre_code]:border-0 [&_pre_code]:bg-transparent [&_pre_code]:p-0 [&_strong]:font-semibold [&_a]:text-primary [&_a]:underline [&_p.is-empty.is-editor-empty::before]:pointer-events-none [&_p.is-empty.is-editor-empty::before]:float-left [&_p.is-empty.is-editor-empty::before]:h-0 [&_p.is-empty.is-editor-empty::before]:text-muted-foreground [&_p.is-empty.is-editor-empty::before]:content-[attr(data-placeholder)]"
      />
    </div>
  );
}

export function PromptMarkdownEditor({
  value,
  onChange,
  disabled = false,
  placeholder = "",
  className,
  rawView: rawViewProp,
}: PromptMarkdownEditorProps) {
  const rawViewControlled = rawViewProp !== undefined;
  const [internalRawView, setInternalRawView] = useState(false);
  const rawViewActive = rawViewControlled ? rawViewProp : internalRawView;

  const [richPaneKey, setRichPaneKey] = useState(0);
  const controlledRichMountRef = useRef(0);
  const prevControlledRaw = useRef<boolean | undefined>(undefined);

  if (rawViewControlled) {
    const prev = prevControlledRaw.current;
    if (prev === true && rawViewProp === false) {
      controlledRichMountRef.current += 1;
    }
    prevControlledRaw.current = rawViewProp;
  } else {
    prevControlledRaw.current = undefined;
  }

  const richPaneReactKey = rawViewControlled
    ? `md-controlled-${controlledRichMountRef.current}`
    : richPaneKey;

  const handleInternalRawToggle = (checked: boolean) => {
    setInternalRawView(checked);
    if (!checked) {
      setRichPaneKey((k) => k + 1);
    }
  };

  return (
    <div
      className={cn(
        "flex h-full min-h-0 flex-col overflow-hidden rounded-md border border-input bg-background",
        className,
      )}
    >
      {!rawViewControlled ? (
        <div className="flex shrink-0 items-center justify-end border-b border-border/60 bg-muted/25 px-2 py-1.5">
          <PromptMarkdownViewToggle
            rawView={internalRawView}
            onRawViewChange={handleInternalRawToggle}
            disabled={disabled}
          />
        </div>
      ) : null}

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        {rawViewActive ? (
          <Textarea
            value={value}
            onChange={(e) => onChange(e.target.value)}
            disabled={disabled}
            placeholder={placeholder}
            spellCheck
            className="h-full min-h-0 flex-1 resize-none rounded-none border-0 bg-transparent px-3 py-2.5 font-mono shadow-none focus-visible:ring-0 focus-visible:ring-offset-0"
          />
        ) : (
          <PromptMarkdownRichPane
            key={richPaneReactKey}
            value={value}
            onChange={onChange}
            disabled={disabled}
            placeholder={placeholder}
          />
        )}
      </div>
    </div>
  );
}
