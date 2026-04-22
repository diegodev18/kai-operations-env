"use client";

import React, { useRef, type RefObject } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  ArrowUpIcon,
  FileTextIcon,
  ImageIcon,
  ListChecksIcon,
  Loader2Icon,
  RotateCcwIcon,
  ShieldCheckIcon,
  SparklesIcon,
  TerminalIcon,
  XIcon,
} from "lucide-react";
import type {
  ChatMessage,
  ChatMessageImage,
  ChatMessagePdf,
  PromptModelId,
  PromptMode,
} from "@/hooks/prompt-chat";
import { isChatStatusMessage } from "@/hooks/prompt-chat";

type PendingPdf = ChatMessagePdf & { name: string };

const OPTIMIZE =
  "Optimiza este prompt: hazlo más claro, consistente y efectivo, sin cambiar su intención. Devuelve el prompt completo optimizado.";
const FIX_CONTRADICTIONS =
  "Revisa este prompt y corrige contradicciones, ambiguedades y conflictos entre instrucciones. Devuelve una version consolidada y coherente, manteniendo la intencion original.";
const MAX_CHAT_IMAGES = 4;

const chatMarkdownComponents = {
  a: ({ node, ...props }: any) => <a {...props} />,
  h1: ({ node, ...props }: any) => <h1 {...props} />,
  h2: ({ node, ...props }: any) => <h2 {...props} />,
  h3: ({ node, ...props }: any) => <h3 {...props} />,
  code: ({ node, inline, ...props }: any) =>
    inline ? (
      <code className="bg-muted px-1 rounded text-xs" {...props} />
    ) : (
      <code className="block bg-muted p-1 rounded text-xs overflow-x-auto" {...props} />
    ),
  ol: ({ node, ...props }: any) => (
    <ol className="list-decimal list-inside" {...props} />
  ),
  ul: ({ node, ...props }: any) => (
    <ul className="list-disc list-inside" {...props} />
  ),
};

export interface PromptChatPanelProps {
  messages: ChatMessage[];
  chatLoading: boolean;
  promptAndChatLocked: boolean;
  editingPrompt: string;
  chatInput: string;
  setChatInput: (value: string) => void;
  pendingImages: ChatMessageImage[];
  setPendingImages: (value: ChatMessageImage[] | ((prev: ChatMessageImage[]) => ChatMessageImage[])) => void;
  pendingPdf: PendingPdf | null;
  setPendingPdf: (value: PendingPdf | null) => void;
  isDraggingOverChat: boolean;
  handleChatDragOver: (e: React.DragEvent<any>) => void;
  handleChatDrop: (e: React.DragEvent<any>) => void;
  handleChatDragEnter: (e: React.DragEvent<any>) => void;
  handleChatDragLeave: (e: React.DragEvent<any>) => void;
  chatWidth: number;
  setChatWidth: (value: number) => void;
  promptModel: PromptModelId;
  setPromptModel: (value: PromptModelId) => void;
  promptMode: PromptMode;
  setPromptMode: (value: PromptMode) => void;
  reset: () => void;
  sendMessage: (text: string, images?: ChatMessageImage[], pdf?: PendingPdf | null) => Promise<void>;
  handleSendChat: () => void;
  addFilesFromFileList: (files: FileList | null, currentCount: number) => void;
  chatFileInputRef: RefObject<HTMLInputElement | null>;
  formatToolsBlock: () => string;
}

export function PromptChatPanel({
  messages,
  chatLoading,
  promptAndChatLocked,
  editingPrompt,
  chatInput,
  setChatInput,
  pendingImages,
  setPendingImages,
  pendingPdf,
  setPendingPdf,
  isDraggingOverChat,
  handleChatDragOver,
  handleChatDrop,
  handleChatDragEnter,
  handleChatDragLeave,
  chatWidth,
  setChatWidth,
  promptModel,
  setPromptModel,
  promptMode,
  setPromptMode,
  reset,
  sendMessage,
  handleSendChat,
  addFilesFromFileList,
  chatFileInputRef,
  formatToolsBlock,
}: PromptChatPanelProps) {
  return (
    <>
      <div
        role="separator"
        className="w-2 shrink-0 cursor-col-resize border-l bg-border/60 hover:bg-primary/20"
        onMouseDown={(e) => {
          e.preventDefault();
          const startX = e.clientX;
          const startW = chatWidth;
          const onMove = (ev: MouseEvent) => {
            const d = startX - ev.clientX;
            setChatWidth(Math.min(520, Math.max(260, startW + d)));
          };
          const onUp = () => {
            document.removeEventListener("mousemove", onMove);
            document.removeEventListener("mouseup", onUp);
          };
          document.addEventListener("mousemove", onMove);
          document.addEventListener("mouseup", onUp);
        }}
      />

      <aside
        className={`relative shrink-0 flex min-h-0 flex-col border-l transition-colors ${
          isDraggingOverChat ? "bg-primary/10 ring-2 ring-inset ring-primary" : ""
        }`}
        style={{ width: chatWidth }}
        onDragOver={handleChatDragOver}
        onDrop={handleChatDrop}
        onDragEnter={handleChatDragEnter}
        onDragLeave={handleChatDragLeave}
      >
        {isDraggingOverChat && (
          <div
            className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 border-2 border-dashed border-primary bg-primary/5"
            aria-hidden
          >
            <ImageIcon className="h-10 w-10 text-primary" />
            <span className="text-sm font-medium text-primary">
              Suelta la imagen o PDF aqui para adjuntarlo
            </span>
          </div>
        )}
        <Card className="rounded-none border-0 shadow-none h-full flex flex-col min-h-0">
          <CardHeader className="pb-2">
            <div className="flex justify-between gap-2">
              <div>
                <CardTitle className="text-sm">Asistente</CardTitle>
                <CardDescription className="text-xs">
                  Mejoras y preguntas sobre el prompt
                </CardDescription>
              </div>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => reset()}
                    disabled={
                      messages.length === 0 || chatLoading || promptAndChatLocked
                    }
                  >
                    <RotateCcwIcon className="w-4 h-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Reiniciar chat</TooltipContent>
              </Tooltip>
            </div>
          </CardHeader>
          <CardContent className="flex min-h-0 flex-1 flex-col overflow-hidden px-3 pb-1">
            <div className="flex-1 overflow-y-auto space-y-2 mb-2 pr-1">
              {messages.map((message: ChatMessage, index: number) => {
                const isLast = index === messages.length - 1;
                const thinking = isLast && message.role === "model" && chatLoading;
                const isStatus =
                  message.role === "model" &&
                  !thinking &&
                  isChatStatusMessage(message.content);
                const display = thinking
                  ? message.content.split("\n").slice(-6).join("\n")
                  : message.content;
                return (
                  <div
                    key={`${message.role}-${index}`}
                    className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}
                  >
                    <div
                      className={`max-w-[90%] rounded-md px-2 py-1.5 text-xs break-words ${
                        message.role === "user"
                          ? "bg-primary text-primary-foreground"
                          : thinking || isStatus
                            ? "bg-muted/80 text-muted-foreground"
                            : "bg-muted"
                      }`}
                    >
                      <ReactMarkdown
                        remarkPlugins={[remarkGfm]}
                        components={chatMarkdownComponents}
                      >
                        {display}
                      </ReactMarkdown>
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="shrink-0 flex flex-col gap-2">
              <div className="mt-auto flex items-center gap-2 pt-1">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="inline-flex">
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        className="h-8 w-8 rounded-lg"
                        disabled={
                          !editingPrompt.trim() ||
                          chatLoading ||
                          promptAndChatLocked
                        }
                        onClick={() => void sendMessage(OPTIMIZE)}
                        aria-label="Optimizar prompt"
                      >
                        <SparklesIcon className="h-4 w-4" />
                      </Button>
                    </span>
                  </TooltipTrigger>
                  <TooltipContent>Optimizar prompt</TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="inline-flex">
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        className="h-8 w-8 rounded-lg"
                        disabled={
                          !editingPrompt.trim() ||
                          chatLoading ||
                          promptAndChatLocked
                        }
                        onClick={() => void sendMessage(FIX_CONTRADICTIONS)}
                        aria-label="Corregir contradicciones"
                      >
                        <ShieldCheckIcon className="h-4 w-4" />
                      </Button>
                    </span>
                  </TooltipTrigger>
                  <TooltipContent>Corregir contradicciones</TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="inline-flex">
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        className="h-8 w-8 rounded-lg"
                        disabled={
                          !editingPrompt.trim() ||
                          chatLoading ||
                          promptAndChatLocked
                        }
                        onClick={() => {
                          void sendMessage(
                            `Contexto de tools:\n${formatToolsBlock()}\n\nResume qué hace cada tool.`,
                          );
                        }}
                        aria-label="Resumir tools"
                      >
                        <ListChecksIcon className="h-4 w-4" />
                      </Button>
                    </span>
                  </TooltipTrigger>
                  <TooltipContent>Resumir tools</TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="inline-flex">
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        className="h-8 w-8 rounded-lg"
                        disabled={
                          !editingPrompt.trim() ||
                          chatLoading ||
                          promptAndChatLocked
                        }
                        aria-label="Extraer comandos"
                      >
                        <TerminalIcon className="h-4 w-4" />
                      </Button>
                    </span>
                  </TooltipTrigger>
                  <TooltipContent>Extraer comandos</TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="inline-flex">
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        className="h-8 w-8 rounded-lg"
                        disabled={chatLoading || promptAndChatLocked}
                        onClick={() => chatFileInputRef?.current?.click()}
                        aria-label="Subir imagen"
                      >
                        <ImageIcon className="h-4 w-4" />
                      </Button>
                    </span>
                  </TooltipTrigger>
                  <TooltipContent>Subir imagen o PDF</TooltipContent>
                </Tooltip>
              </div>
              <Label htmlFor="prompt-chat-input" className="text-xs font-semibold">
                Pide ayuda al asistente
              </Label>
              <input
                ref={chatFileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif,application/pdf"
                multiple
                className="hidden"
                aria-hidden
                onChange={(e) => {
                  void addFilesFromFileList(e.target.files ?? null, pendingImages.length);
                  e.target.value = "";
                }}
              />
              {(pendingImages.length > 0 || pendingPdf) &&
                promptModel !== "gemini-3-flash" &&
                promptModel !== "gemini-3.1-pro" && (
                  <p className="text-xs text-amber-600 dark:text-amber-500">
                    Las imágenes y el PDF solo se envían con modelos Gemini.
                  </p>
                )}
              {pendingPdf != null && (
                <div className="flex items-center gap-2 rounded-md border border-border bg-muted px-2 py-1.5 text-xs">
                  <FileTextIcon className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <span className="flex-1 truncate" title={pendingPdf.name}>
                    {pendingPdf.name}
                  </span>
                  <button
                    type="button"
                    className="rounded p-0.5 text-muted-foreground hover:bg-muted-foreground/20 hover:text-foreground"
                    onClick={() => setPendingPdf(null)}
                    aria-label="Quitar PDF"
                  >
                    <XIcon className="h-3 w-3" />
                  </button>
                </div>
              )}
              {pendingImages.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {pendingImages.map((img, i) => (
                    <div
                      key={`${img.mimeType}-${i}`}
                      className="relative overflow-hidden rounded border border-border bg-muted"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={`data:${img.mimeType};base64,${img.data}`}
                        alt=""
                        className="h-14 w-14 object-cover"
                      />
                      <button
                        type="button"
                        className="absolute right-0.5 top-0.5 rounded-full bg-black/60 p-0.5 text-white hover:bg-black/80"
                        onClick={() =>
                          setPendingImages((p) => p.filter((_, j) => j !== i))
                        }
                        aria-label="Quitar imagen"
                      >
                        <XIcon className="h-3 w-3" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
              <Textarea
                id="prompt-chat-input"
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                placeholder="Escribe un mensaje…"
                rows={3}
                className="min-h-[92px] resize-none rounded-xl text-sm"
                disabled={promptAndChatLocked}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    void handleSendChat();
                  }
                }}
                onPaste={(e) => {
                  const files = e.clipboardData?.files;
                  if (files?.length && pendingImages.length < MAX_CHAT_IMAGES) {
                    let hasImage = false;
                    for (let i = 0; i < files.length; i++) {
                      if (files[i]?.type && /^image\//i.test(files[i].type)) {
                        hasImage = true;
                        break;
                      }
                    }
                    if (hasImage) {
                      e.preventDefault();
                      void addFilesFromFileList(files, pendingImages.length);
                    }
                  }
                }}
              />
              <div className="flex items-center gap-2">
                <Select
                  value={promptMode}
                  onValueChange={(v) => setPromptMode(v as PromptMode)}
                  disabled={promptAndChatLocked}
                >
                  <SelectTrigger className="h-8 w-fit min-w-[108px] rounded-full border px-2.5 text-xs">
                    <span className="inline-flex items-center gap-2">
                      <SparklesIcon className="h-3.5 w-3.5" />
                      <SelectValue />
                    </span>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="agent">Agente</SelectItem>
                    <SelectItem value="questions">Preguntas</SelectItem>
                  </SelectContent>
                </Select>
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className="ml-auto h-8 w-8 rounded-lg"
                  onClick={() => void handleSendChat()}
                  disabled={
                    chatLoading || !chatInput.trim() || promptAndChatLocked
                  }
                  aria-label="Enviar"
                >
                  {chatLoading ? (
                    <Loader2Icon className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <ArrowUpIcon className="h-3.5 w-3.5" />
                  )}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </aside>
    </>
  );
}
