"use client";

import { useCallback, useEffect, useState } from "react";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import {
  BoldIcon,
  ItalicIcon,
  ListIcon,
  ListOrderedIcon,
  StrikethroughIcon,
} from "lucide-react";

import { Button } from "@/components/ui/button";

type Props = {
  disabled?: boolean;
  onSubmit: (html: string) => void | Promise<void>;
};

export function ImplementationActivityCommentEditor({
  disabled,
  onSubmit,
}: Props) {
  const [submitting, setSubmitting] = useState(false);

  const editor = useEditor({
    extensions: [StarterKit],
    content: "",
    editable: !disabled,
    immediatelyRender: false,
  });

  useEffect(() => {
    if (!editor) return;
    editor.setEditable(!disabled);
  }, [editor, disabled]);

  const handleSubmit = useCallback(async () => {
    if (!editor || disabled || submitting) return;
    const html = editor.getHTML();
    setSubmitting(true);
    try {
      await onSubmit(html);
      editor.commands.clearContent();
    } finally {
      setSubmitting(false);
    }
  }, [editor, disabled, submitting, onSubmit]);

  if (!editor) {
    return (
      <div className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
        Cargando editor…
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-md border bg-background">
      <div className="flex flex-wrap items-center gap-0.5 border-b bg-muted/30 px-1 py-1">
        <Button
          type="button"
          variant={editor.isActive("bold") ? "secondary" : "ghost"}
          size="sm"
          className="h-8 w-8 p-0"
          disabled={
            disabled || !editor.can().chain().focus().toggleBold().run()
          }
          onClick={() => editor.chain().focus().toggleBold().run()}
          aria-label="Negrita"
        >
          <BoldIcon className="size-4" />
        </Button>
        <Button
          type="button"
          variant={editor.isActive("italic") ? "secondary" : "ghost"}
          size="sm"
          className="h-8 w-8 p-0"
          disabled={
            disabled || !editor.can().chain().focus().toggleItalic().run()
          }
          onClick={() => editor.chain().focus().toggleItalic().run()}
          aria-label="Cursiva"
        >
          <ItalicIcon className="size-4" />
        </Button>
        <Button
          type="button"
          variant={editor.isActive("strike") ? "secondary" : "ghost"}
          size="sm"
          className="h-8 w-8 p-0"
          disabled={
            disabled || !editor.can().chain().focus().toggleStrike().run()
          }
          onClick={() => editor.chain().focus().toggleStrike().run()}
          aria-label="Tachado"
        >
          <StrikethroughIcon className="size-4" />
        </Button>
        <span className="mx-1 h-5 w-px bg-border" aria-hidden />
        <Button
          type="button"
          variant={editor.isActive("bulletList") ? "secondary" : "ghost"}
          size="sm"
          className="h-8 w-8 p-0"
          disabled={disabled}
          onClick={() => editor.chain().focus().toggleBulletList().run()}
          aria-label="Lista con viñetas"
        >
          <ListIcon className="size-4" />
        </Button>
        <Button
          type="button"
          variant={editor.isActive("orderedList") ? "secondary" : "ghost"}
          size="sm"
          className="h-8 w-8 p-0"
          disabled={disabled}
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
          aria-label="Lista numerada"
        >
          <ListOrderedIcon className="size-4" />
        </Button>
      </div>
      <EditorContent
        editor={editor}
        className="[&_.ProseMirror]:min-h-[2.25rem] [&_.ProseMirror]:max-h-[5.75rem] [&_.ProseMirror]:overflow-y-auto [&_.ProseMirror]:px-3 [&_.ProseMirror]:py-2 [&_.ProseMirror]:outline-none [&_.ProseMirror]:max-w-none [&_p]:my-1.5 [&_ul]:my-1.5 [&_ol]:my-1.5 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 [&_a]:text-primary [&_a]:underline"
      />
      <div className="flex justify-end border-t bg-muted/20 px-2 py-2">
        <Button
          type="button"
          size="sm"
          disabled={disabled || submitting}
          onClick={() => void handleSubmit()}
        >
          {submitting ? "Publicando…" : "Comentario"}
        </Button>
      </div>
    </div>
  );
}
