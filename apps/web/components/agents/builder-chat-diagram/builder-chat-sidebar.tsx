"use client";

import type { Dispatch, RefObject, SetStateAction } from "react";
import { MessageSquareIcon, PencilIcon, PlusIcon, SendIcon, Trash2Icon } from "lucide-react";
import { toast } from "sonner";

import { BuilderChatUiBlock } from "@/components/agents/builder-chat-ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { ToolsCatalogItem } from "@/types";
import { cn } from "@/lib/utils";

import { FORM_STEPS } from "./constants";
import { isBusinessComplete, isPersonalityComplete } from "./draft-helpers";
import type { BuilderMode, ChatMessage, DraftState, FormStep } from "./types";
import { formatUserBubbleText } from "./user-bubble-text";

export type BuilderChatSidebarProps = {
  chatPanelWidth: number;
  builderMode: BuilderMode;
  formStep: FormStep;
  formStepIndex: number;
  draftState: DraftState;
  setDraftState: Dispatch<SetStateAction<DraftState>>;
  updateStepFromState: (state: DraftState) => DraftState;
  selectedToolsForForm: ToolsCatalogItem[];
  removeToolFromDraft: (toolId: string) => void;
  setEditingToolId: (id: string | null) => void;
  setToolsDialogOpen: (open: boolean) => void;
  chatMessages: ChatMessage[];
  typingMessageId: string | null;
  isThinking: boolean;
  thinkingLabel: string;
  sendUserText: (text: string, displayText?: string) => Promise<void>;
  chatInput: string;
  setChatInput: (value: string) => void;
  chatComposerRef: RefObject<HTMLTextAreaElement | null>;
  handleSend: (textOverride?: string) => Promise<void>;
  canUseChatComposer: boolean;
  agentCreatedDialogOpen: boolean;
  readyToConfirm: boolean;
  saving: boolean;
  setFormStep: Dispatch<SetStateAction<FormStep>>;
};

export function BuilderChatSidebar(props: BuilderChatSidebarProps) {
  const {
    chatPanelWidth,
    builderMode,
    formStep,
    formStepIndex,
    draftState,
    setDraftState,
    updateStepFromState,
    selectedToolsForForm,
    removeToolFromDraft,
    setEditingToolId,
    setToolsDialogOpen,
    chatMessages,
    typingMessageId,
    isThinking,
    thinkingLabel,
    sendUserText,
    chatInput,
    setChatInput,
    chatComposerRef,
    handleSend,
    canUseChatComposer,
    agentCreatedDialogOpen,
    readyToConfirm,
    saving,
    setFormStep,
  } = props;

  return (
    <section
      className="flex h-[calc(100vh-110px)] min-h-[700px] flex-col rounded-xl border border-border bg-card lg:shrink-0"
      style={{ width: `${chatPanelWidth}px` }}
    >
      <header className="border-b border-border px-4 py-3">
        <p className="flex items-center gap-2 text-sm font-medium">
          <MessageSquareIcon className="size-4" />
          {builderMode === "form" ? "Constructor por formulario" : "Conversación guiada"}
        </p>
      </header>
      <div className="flex-1 space-y-3 overflow-y-auto p-4">
        {builderMode === "form" ? (
          <div className="space-y-3 rounded-xl border border-border bg-muted/20 p-3">
            <div className="flex items-center justify-between">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Paso {formStepIndex + 1} de {FORM_STEPS.length}
              </p>
              <p className="text-xs text-muted-foreground">
                {formStep === "business"
                  ? "Negocio"
                  : formStep === "tools"
                    ? "Tools"
                    : formStep === "personality"
                      ? "Personalidad"
                      : "Revisión"}
              </p>
            </div>
            {formStep === "business" ? (
              <div className="space-y-2">
                <Label>Nombre del negocio</Label>
                <Input
                  value={draftState.business_name}
                  onChange={(event) =>
                    setDraftState((prev) =>
                      updateStepFromState({ ...prev, business_name: event.target.value }),
                    )
                  }
                />
                <Label>Responsable</Label>
                <Input
                  value={draftState.owner_name}
                  onChange={(event) =>
                    setDraftState((prev) =>
                      updateStepFromState({ ...prev, owner_name: event.target.value }),
                    )
                  }
                />
                <Label>Industria</Label>
                <Input
                  value={draftState.industry}
                  onChange={(event) =>
                    setDraftState((prev) =>
                      updateStepFromState({ ...prev, industry: event.target.value }),
                    )
                  }
                />
                <Label>Descripción del negocio</Label>
                <Textarea
                  value={draftState.description}
                  onChange={(event) =>
                    setDraftState((prev) =>
                      updateStepFromState({ ...prev, description: event.target.value }),
                    )
                  }
                  rows={2}
                />
                <Label>Audiencia objetivo</Label>
                <Textarea
                  value={draftState.target_audience}
                  onChange={(event) =>
                    setDraftState((prev) =>
                      updateStepFromState({ ...prev, target_audience: event.target.value }),
                    )
                  }
                  rows={2}
                />
                <Label>Rol del agente</Label>
                <Textarea
                  value={draftState.agent_description}
                  onChange={(event) =>
                    setDraftState((prev) =>
                      updateStepFromState({ ...prev, agent_description: event.target.value }),
                    )
                  }
                  rows={2}
                />
                <Label>Reglas de escalamiento</Label>
                <Textarea
                  value={draftState.escalation_rules}
                  onChange={(event) =>
                    setDraftState((prev) =>
                      updateStepFromState({ ...prev, escalation_rules: event.target.value }),
                    )
                  }
                  rows={2}
                />
                <Label>País</Label>
                <Input
                  value={draftState.country}
                  onChange={(event) =>
                    setDraftState((prev) =>
                      updateStepFromState({ ...prev, country: event.target.value }),
                    )
                  }
                  placeholder="p. ej. México, Colombia"
                />
              </div>
            ) : null}
            {formStep === "tools" ? (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium">Tools seleccionadas</p>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setEditingToolId(null);
                      setToolsDialogOpen(true);
                    }}
                  >
                    <PlusIcon className="mr-1 size-4" />
                    Agregar tool
                  </Button>
                </div>
                {selectedToolsForForm.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    Aún no hay tools seleccionadas.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {selectedToolsForForm.map((tool) => (
                      <div
                        key={tool.id}
                        className="flex items-center justify-between rounded-md border border-border bg-background px-2 py-2"
                      >
                        <div className="pr-2">
                          <p className="text-sm font-medium">{tool.displayName ?? tool.name}</p>
                          <p className="line-clamp-1 text-xs text-muted-foreground">{tool.name}</p>
                        </div>
                        <div className="flex items-center gap-1">
                          <Button
                            type="button"
                            size="icon"
                            variant="ghost"
                            onClick={() => {
                              setEditingToolId(tool.id);
                              setToolsDialogOpen(true);
                            }}
                            aria-label={`Personalizar ${tool.displayName ?? tool.name}`}
                          >
                            <PencilIcon className="size-4" />
                          </Button>
                          <Button
                            type="button"
                            size="icon"
                            variant="ghost"
                            onClick={() => removeToolFromDraft(tool.id)}
                            aria-label={`Eliminar ${tool.displayName ?? tool.name}`}
                          >
                            <Trash2Icon className="size-4 text-destructive" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                <p className="text-xs text-muted-foreground">
                  Usa el chat de abajo en este paso para que el agente te ayude a encontrar tools.
                </p>
              </div>
            ) : null}
            {formStep === "personality" ? (
              <div className="space-y-2">
                <Label>Nombre del agente</Label>
                <Input
                  value={draftState.agent_name}
                  onChange={(event) =>
                    setDraftState((prev) =>
                      updateStepFromState({ ...prev, agent_name: event.target.value }),
                    )
                  }
                />
                <Label>Personalidad del agente</Label>
                <Textarea
                  value={draftState.agent_personality}
                  onChange={(event) =>
                    setDraftState((prev) =>
                      updateStepFromState({ ...prev, agent_personality: event.target.value }),
                    )
                  }
                  rows={3}
                />
                <Label>Idioma de las respuestas al usuario</Label>
                <Input
                  value={draftState.response_language}
                  onChange={(event) =>
                    setDraftState((prev) =>
                      updateStepFromState({
                        ...prev,
                        response_language: event.target.value,
                      }),
                    )
                  }
                  placeholder="p. ej. Spanish, English"
                />
                <p className="text-xs text-muted-foreground">
                  El system prompt técnico se guarda en inglés; este valor indica en qué idioma
                  debe hablar el agente con tus clientes.
                </p>
                <Label>Uso de emojis</Label>
                <Input
                  value={draftState.use_emojis}
                  onChange={(event) =>
                    setDraftState((prev) =>
                      updateStepFromState({ ...prev, use_emojis: event.target.value }),
                    )
                  }
                  placeholder="p. ej. Sí, usar emojis con moderación"
                />
                <Label>Acento / Dialecto</Label>
                <Input
                  value={draftState.country_accent}
                  onChange={(event) =>
                    setDraftState((prev) =>
                      updateStepFromState({ ...prev, country_accent: event.target.value }),
                    )
                  }
                  placeholder="p. ej. Español de México"
                />
                <Label>Firma / Despedida</Label>
                <Input
                  value={draftState.agent_signature}
                  onChange={(event) =>
                    setDraftState((prev) =>
                      updateStepFromState({ ...prev, agent_signature: event.target.value }),
                    )
                  }
                  placeholder="p. ej. Saludos, tu asistente virtual"
                />
              </div>
            ) : null}
            {formStep === "review" ? (
              <div className="space-y-2 text-sm">
                <p className="font-medium">Revisión final</p>
                <p>
                  Negocio:{" "}
                  <span className="text-muted-foreground">
                    {draftState.business_name || "Sin completar"}
                  </span>
                </p>
                <p>
                  Tools:{" "}
                  <span className="text-muted-foreground">
                    {draftState.selected_tools.length} seleccionadas
                  </span>
                </p>
                <p>
                  Agente:{" "}
                  <span className="text-muted-foreground">
                    {draftState.agent_name || "Sin nombre"}
                  </span>
                </p>
                <p>
                  Idioma de respuestas:{" "}
                  <span className="text-muted-foreground">
                    {draftState.response_language.trim() || "—"}
                  </span>
                </p>
                <Button
                  type="button"
                  onClick={() => {
                    void handleSend("confirmar");
                  }}
                  disabled={!readyToConfirm || isThinking || saving}
                >
                  Confirmar desde formulario
                </Button>
              </div>
            ) : null}
            <div className="flex items-center justify-between pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  const prevIndex = Math.max(0, formStepIndex - 1);
                  setFormStep(FORM_STEPS[prevIndex] ?? "business");
                }}
                disabled={formStepIndex === 0}
              >
                Anterior
              </Button>
              <Button
                type="button"
                onClick={() => {
                  if (formStep === "business" && !isBusinessComplete(draftState)) {
                    toast.error("Completa los campos de negocio requeridos.");
                    return;
                  }
                  if (formStep === "tools" && draftState.selected_tools.length === 0) {
                    toast.error("Selecciona al menos una tool.");
                    return;
                  }
                  if (formStep === "personality" && !isPersonalityComplete(draftState)) {
                    toast.error("Completa todos los campos de personalidad del agente.");
                    return;
                  }
                  const nextIndex = Math.min(FORM_STEPS.length - 1, formStepIndex + 1);
                  setFormStep(FORM_STEPS[nextIndex] ?? "review");
                }}
                disabled={formStepIndex === FORM_STEPS.length - 1}
              >
                Siguiente
              </Button>
            </div>
          </div>
        ) : null}
        {builderMode !== "form" || formStep === "tools"
          ? chatMessages.map((message, messageIndex) => {
              const isLatestInThread = messageIndex === chatMessages.length - 1;
              /** Solo el último mensaje del hilo puede tener UI activa; tras enviar o elegir opción, queda bloqueada. */
              const uiInteractive = isLatestInThread && !isThinking;
              return (
                <div
                  key={message.id}
                  className={cn(
                    "max-w-[92%] rounded-xl px-3 py-2 text-sm whitespace-pre-wrap",
                    message.role === "assistant"
                      ? "bg-muted text-foreground"
                      : "ml-auto bg-primary text-primary-foreground",
                  )}
                >
                  {message.role === "user"
                    ? (message.displayText ?? formatUserBubbleText(message.text))
                    : message.text}
                  {typingMessageId === message.id ? (
                    <span className="ml-0.5 inline-block animate-pulse align-baseline font-mono">
                      ▍
                    </span>
                  ) : null}
                  {message.role === "assistant" &&
                  message.ui &&
                  typingMessageId !== message.id ? (
                    <BuilderChatUiBlock
                      ui={message.ui}
                      disabled={!uiInteractive}
                      onSend={(payload, displayText) => void sendUserText(payload, displayText)}
                    />
                  ) : null}
                </div>
              );
            })
          : null}
        {isThinking && (builderMode !== "form" || formStep === "tools") ? (
          <div className="max-w-[92%] px-1 py-1 text-sm text-muted-foreground">
            <div className="relative inline-block">
              <span className="shine-text relative">
                {thinkingLabel}
                <span className="ml-0.5 inline-block animate-pulse">▍</span>
              </span>
            </div>
          </div>
        ) : null}
      </div>
      <div className="space-y-2 border-t border-border p-3">
        <div className="flex items-end gap-2">
          <Textarea
            ref={chatComposerRef}
            value={chatInput}
            onChange={(e) => setChatInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void handleSend();
              }
            }}
            disabled={agentCreatedDialogOpen || !canUseChatComposer}
            placeholder={
              canUseChatComposer
                ? formStep === "tools" && builderMode === "form"
                  ? "Pide sugerencias de tools al agente..."
                  : "Escribe un mensaje..."
                : "Activa modo conversacional o avanza al paso Tools"
            }
            rows={1}
            aria-label="Mensaje del chat"
            className={cn(
              "max-h-[92px] min-h-[32px] resize-none overflow-y-auto rounded-lg px-2.5 py-1.5 text-sm leading-5 shadow-none md:text-sm dark:bg-input/30",
              "field-sizing-fixed",
            )}
          />
          <Button
            size="icon"
            onClick={() => void handleSend()}
            disabled={isThinking || agentCreatedDialogOpen || !canUseChatComposer}
          >
            <SendIcon className="size-4" />
          </Button>
        </div>
      </div>
    </section>
  );
}
