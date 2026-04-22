"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeftIcon,
  ArrowRightIcon,
  CheckIcon,
  Loader2Icon,
  XIcon,
  BuildingIcon,
  WrenchIcon,
  UserIcon,
  SettingsIcon,
  RocketIcon,
  ListChecks,
  PlusIcon,
  HomeIcon,
  ChevronDownIcon,
  RefreshCwIcon,
  RotateCcwIcon,
} from "lucide-react";
import { toast } from "sonner";
import { AGENT_BUILDER_MANDATORY_TOOL_NAMES } from "@kai/shared";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ConfirmationDialog } from "@/components/confirmation-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import {
  postAgentDraft,
  patchAgentDraft,
  fetchToolsCatalog,
  analyzeAgentWithAI,
  recommendAgentTools,
  generateAgentToolFlowsMarkdown,
  fetchAgentFlowQuestions,
  fetchSavedBuilderCompanies,
  postSavedBuilderCompany,
  patchSavedBuilderCompany,
  type ToolsCatalogItem,
  type DynamicQuestion,
  type BuilderCompanyPayload,
  type SavedBuilderCompany,
  type ToolFlowsMarkdownPayload,
} from "@/services/agents-api";
import {
  PromptMarkdownEditor,
  PromptMarkdownViewToggle,
} from "@/components/prompt-markdown-editor";
import {
  EscalationRulesInput,
  StringListInput,
} from "@/components/form-input-components";
import {
  FlowSelectChips,
  FlowSuggestionsMulti,
  FlowSuggestionsSingle,
  FlowQuestionField,
} from "@/components/flow-question-components";
import { SectionBusiness } from "@/components/section-business";
import { SectionFlows } from "@/components/section-flows";
import { SectionTools } from "@/components/section-tools";
import { SectionPersonality } from "@/components/section-personality";
import { SectionAdvanced } from "@/components/section-advanced";
import {
  DEFAULT_FORM_STATE,
  FORM_SECTIONS,
  BUILDER_LLM_MODELS,
  STAGE_TYPES,
} from "@/consts/form-builder/constants";
import type {
  AgentFlowQuestion,
  FormBuilderState,
  FormSectionId,
  PersonalityTrait,
  Pipeline,
  Stage,
} from "@/types";
import {
  PROPERTY_DESCRIPTIONS,
  PROPERTY_TITLES,
} from "@/consts/form-builder/property-descriptions";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks";

const ICONS: Record<string, React.ReactNode> = {
  templates: <RocketIcon className="size-5" />,
  business: <BuildingIcon className="size-5" />,
  tools: <WrenchIcon className="size-5" />,
  personality: <UserIcon className="size-5" />,
  advanced: <SettingsIcon className="size-5" />,
  flows: <ListChecks className="size-5" />,
  pipelines: <ListChecks className="size-5" />,
  review: <CheckIcon className="size-5" />,
};

function industryIsComplete(state: FormBuilderState): boolean {
  if (!state.industry) return false;
  if (state.industry === "Otro") return !!state.custom_industry.trim();
  return true;
}

function formStateToBuilderCompanyPayload(
  state: FormBuilderState,
): BuilderCompanyPayload {
  const payload: BuilderCompanyPayload = {
    businessName: state.business_name.trim(),
    industry: state.industry.trim(),
    description: state.description.trim(),
    targetAudience: state.target_audience.trim(),
    agentDescription: state.agent_description.trim(),
    escalationRules: state.escalation_rules.trim(),
    country: state.country.trim(),
  };
  const ci = state.custom_industry.trim();
  if (ci) payload.customIndustry = ci;
  const tz = state.business_timezone.trim();
  if (tz) payload.businessTimezone = tz;
  if (state.brandValues.length > 0)
    payload.brandValues = [...state.brandValues];
  const pol = state.policies.trim();
  if (pol) payload.policies = pol;
  return payload;
}

function builderCompanyPayloadToPartialState(
  p: BuilderCompanyPayload,
): Partial<FormBuilderState> {
  return {
    business_name: p.businessName,
    industry: p.industry,
    custom_industry: p.customIndustry ?? "",
    description: p.description,
    target_audience: p.targetAudience,
    agent_description: p.agentDescription,
    escalation_rules: p.escalationRules,
    country: p.country,
    business_timezone: p.businessTimezone ?? "",
    brandValues: p.brandValues ?? [],
    policies: p.policies ?? "",
  };
}

/** Mínimo para persistir en API (Zod del POST). */
function canPersistBuilderCompany(state: FormBuilderState): boolean {
  if (!state.business_name.trim()) return false;
  if (!industryIsComplete(state)) return false;
  if (!state.description.trim()) return false;
  if (!state.target_audience.trim()) return false;
  if (!state.agent_description.trim()) return false;
  if (!state.escalation_rules.trim()) return false;
  if (!state.country.trim()) return false;
  return true;
}

/** Negocio (incl. nombre e industria) + personalidad (antes de Flujos). */
function areCoreProfileComplete(state: FormBuilderState): boolean {
  const business =
    !!state.business_name.trim() &&
    !!state.owner_name.trim() &&
    industryIsComplete(state) &&
    !!state.description.trim() &&
    !!state.target_audience.trim() &&
    !!state.agent_description.trim() &&
    !!state.escalation_rules.trim() &&
    !!state.country.trim();
  const personality =
    !!state.agent_name.trim() &&
    !!state.agent_personality.trim() &&
    !!state.response_language.trim() &&
    !!state.use_emojis;
  return business && personality;
}

function isFlowsStepComplete(state: FormBuilderState): boolean {
  if (state.flow_questions.length === 0) return false;
  return state.flow_questions.every((q) => {
    if (q.required === false) return true;
    return !!state.flow_answers[q.field]?.trim();
  });
}

/** Para el paso Herramientas: perfil core + Flujos contestado. */
function areToolsPrerequisitesMet(state: FormBuilderState): boolean {
  return areCoreProfileComplete(state) && isFlowsStepComplete(state);
}

function getFirstCoreIncompleteSection(
  state: FormBuilderState,
): FormSectionId | null {
  if (
    !state.business_name.trim() ||
    !state.owner_name.trim() ||
    !industryIsComplete(state) ||
    !state.description.trim() ||
    !state.target_audience.trim() ||
    !state.agent_description.trim() ||
    !state.escalation_rules.trim() ||
    !state.country.trim()
  ) {
    return "business";
  }
  if (
    !state.agent_name.trim() ||
    !state.agent_personality.trim() ||
    !state.response_language.trim() ||
    !state.use_emojis
  ) {
    return "personality";
  }
  return null;
}

function getFirstIncompleteSectionForTools(
  state: FormBuilderState,
): FormSectionId | null {
  const core = getFirstCoreIncompleteSection(state);
  if (core) return core;
  if (!isFlowsStepComplete(state)) return "flows";
  return null;
}

function buildFlowQuestionsTriggerHash(state: FormBuilderState): string {
  return JSON.stringify({
    business_name: state.business_name,
    owner_name: state.owner_name,
    industry: state.industry,
    custom_industry: state.custom_industry,
    description: state.description,
    target_audience: state.target_audience,
    agent_description: state.agent_description,
    escalation_rules: state.escalation_rules,
    country: state.country,
    business_timezone: state.business_timezone,
    agent_name: state.agent_name,
    agent_personality: state.agent_personality,
    response_language: state.response_language,
    use_emojis: state.use_emojis,
    country_accent: state.country_accent,
    agent_signature: state.agent_signature,
    personality_traits: state.personality_traits,
    require_auth: state.require_auth,
  });
}

function buildOperationalContextNarrative(state: FormBuilderState): string {
  return state.flow_questions
    .map((q) => {
      const a = state.flow_answers[q.field]?.trim() || "";
      return `${q.label}\nRespuesta: ${a || "(sin respuesta)"}`;
    })
    .join("\n\n---\n\n");
}

/** Texto del paso Avanzado útil para redactar flujos de uso de herramientas. */
function buildAdvancedProfileNarrative(state: FormBuilderState): string {
  const parts: string[] = [];
  parts.push(
    [
      "Estilo/persona configurada para respuestas al usuario:",
      `- Personalidad base: ${state.agent_personality.trim() || "(no definida)"}`,
      `- Rasgos: ${state.personality_traits.length ? state.personality_traits.join(", ") : "(sin rasgos)"}`,
      `- Tono: ${state.tone}`,
      `- Uso de emojis: ${state.use_emojis}`,
      `- Acento/variante: ${state.country_accent.trim() || "(sin acento específico)"}`,
      `- Firma del agente: ${state.agent_signature.trim() || "(sin firma)"}`,
      `- Longitud preferida: ${state.responseLength}`,
      `- Estilo de conversación: ${state.conversationStyle}`,
    ].join("\n"),
  );
  if (state.policies.trim()) {
    parts.push(`Políticas / límites del agente:\n${state.policies.trim()}`);
  }
  if (state.greetingMessage.trim()) {
    parts.push(`Saludo típico:\n${state.greetingMessage.trim()}`);
  }
  if (state.brandValues.length) {
    parts.push(
      `Valores de marca: ${state.brandValues.filter(Boolean).join(", ")}`,
    );
  }
  if (state.topicsToAvoid.length) {
    parts.push(
      `Temas a evitar: ${state.topicsToAvoid.filter(Boolean).join(", ")}`,
    );
  }
  if (state.requiredPhrases.length) {
    parts.push(
      `Frases requeridas en ciertos casos: ${state.requiredPhrases.filter(Boolean).join(" | ")}`,
    );
  }
  return parts.join("\n\n");
}

function buildToolsSelectionNarrative(
  catalog: ToolsCatalogItem[],
  selectedToolIds: string[],
  rationale: string | null,
  toolReasonById: Record<string, string>,
): string {
  const chunks: string[] = [];
  if (rationale?.trim()) {
    chunks.push(
      "Motivación general de la recomendación de herramientas para este negocio:\n" +
        rationale.trim(),
    );
  }
  const byId = new Map(catalog.map((t) => [t.id, t]));
  const perTool: string[] = [];
  for (const id of selectedToolIds) {
    const reason = toolReasonById[id]?.trim();
    if (!reason) continue;
    const t = byId.get(id);
    const label =
      (t?.displayName && t.displayName.trim()) ||
      (t?.name && t.name.trim()) ||
      id;
    perTool.push(`### ${label} (id: \`${id}\`)\n${reason}`);
  }
  if (perTool.length) {
    chunks.push(
      "Justificación por herramienta (úsalas para definir disparadores y respuestas al usuario):\n\n" +
        perTool.join("\n\n"),
    );
  }
  return chunks.join("\n\n---\n\n");
}

function buildSupplementalToolFlowsContext(
  state: FormBuilderState,
  catalog: ToolsCatalogItem[],
  toolsRationale: string | null,
  toolReasonById: Record<string, string>,
): string {
  return [
    buildAdvancedProfileNarrative(state),
    buildToolsSelectionNarrative(
      catalog,
      state.selected_tools,
      toolsRationale,
      toolReasonById,
    ),
  ]
    .filter((s) => s.trim().length > 0)
    .join("\n\n===\n\n");
}

function buildToolFlowsMarkdownPayload(
  state: FormBuilderState,
  catalog: ToolsCatalogItem[],
  toolsRationale: string | null,
  toolReasonById: Record<string, string>,
): Omit<ToolFlowsMarkdownPayload, "mode" | "existingMarkdownEs"> {
  return {
    business_name: state.business_name,
    owner_name: state.owner_name,
    industry: state.industry,
    custom_industry: state.custom_industry,
    description: state.description,
    target_audience: state.target_audience,
    agent_description: state.agent_description,
    escalation_rules: state.escalation_rules,
    country: state.country,
    business_timezone: state.business_timezone,
    agent_name: state.agent_name,
    agent_personality: state.agent_personality,
    response_language: state.response_language,
    business_hours: "",
    require_auth: state.require_auth,
    operational_context: buildOperationalContextNarrative(state),
    tools_context_data_actions: "",
    tools_context_commerce_reservations: "",
    tools_context_integrations: "",
    supplemental_context: buildSupplementalToolFlowsContext(
      state,
      catalog,
      toolsRationale,
      toolReasonById,
    ),
    selectedToolIds: [...state.selected_tools],
  };
}

function buildToolsRecommendContextHash(state: FormBuilderState): string {
  return JSON.stringify({
    business_name: state.business_name,
    owner_name: state.owner_name,
    industry: state.industry,
    custom_industry: state.custom_industry,
    description: state.description,
    target_audience: state.target_audience,
    agent_description: state.agent_description,
    escalation_rules: state.escalation_rules,
    country: state.country,
    business_timezone: state.business_timezone,
    agent_name: state.agent_name,
    agent_personality: state.agent_personality,
    response_language: state.response_language,
    use_emojis: state.use_emojis,
    country_accent: state.country_accent,
    agent_signature: state.agent_signature,
    personality_traits: state.personality_traits,
    require_auth: state.require_auth,
    operational_context: buildOperationalContextNarrative(state),
  });
}

interface SectionProps {
  state: FormBuilderState;
  onChange: (updates: Partial<FormBuilderState>) => void;
  catalog: ToolsCatalogItem[];
  isSaving: boolean;
  userName?: string;
  onValidationError?: (section: string, error: string) => void;
  /** Tras guardar manualmente o alinear ref con un perfil cargado (evita duplicar POST al pulsar Siguiente). */
  onBusinessProfileSaved?: (payload: BuilderCompanyPayload) => void;
  /** ID del doc Firestore al cargar un perfil desde el listado; `null` = nuevo perfil. */
  editingSavedCompanyId?: string | null;
  onEditingSavedCompanyIdChange?: (id: string | null) => void;
  /** POST o PATCH según `editingSavedCompanyId`. */
  saveBusinessProfileToFirestore?: () => Promise<
    { ok: true; mode: "created" | "updated" } | { ok: false; error: string }
  >;
}


function sectionTitle(id: FormSectionId): string {
  return FORM_SECTIONS.find((s) => s.id === id)?.title ?? id;
}


type SectionFlowsProps = {
  state: FormBuilderState;
  onChange: (updates: Partial<FormBuilderState>) => void;
  isSaving: boolean;
  coreComplete: boolean;
  firstCoreIncomplete: FormSectionId | null;
  onGoToSection: (id: FormSectionId) => void;
  flowQuestionsLoading: boolean;
  flowQuestionsError: string | null;
  onRetryFlowQuestions: () => void;
  onRegenerateFlowQuestions: () => void;
};

type SectionToolsProps = {
  state: FormBuilderState;
  onChange: (updates: Partial<FormBuilderState>) => void;
  catalog: ToolsCatalogItem[];
  isSaving: boolean;
  prerequisitesMet: boolean;
  firstBlockedSection: FormSectionId | null;
  onGoToSection: (id: FormSectionId) => void;
  recommendLoading: boolean;
  recommendError: string | null;
  onRegenerateTools: () => void;
  toolsRationale: string | null;
  toolsWarnings: string[];
  toolReasonById: Record<string, string>;
  operationalSummary: string;
};


type SectionPipelinesProps = SectionProps;

function SectionPipelines({ state, onChange }: SectionPipelinesProps) {
  const pipelines = state.pipelines || [];

  const updatePipeline = useCallback(
    (pipelineIndex: number, updates: Partial<Pipeline>) => {
      const newPipelines = [...pipelines];
      newPipelines[pipelineIndex] = {
        ...newPipelines[pipelineIndex],
        ...updates,
      };
      onChange({ pipelines: newPipelines });
    },
    [pipelines, onChange],
  );

  if (pipelines.length === 0) {
    return (
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">
          No hay pipelines configurados. Se usará el pipeline predeterminado al
          crear el agente.
        </p>
        <Button
          type="button"
          variant="outline"
          onClick={() => {
            onChange({
              pipelines: [
                {
                  id: "default",
                  name: "Pipeline de Ventas",
                  description: "Pipeline principal",
                  isDefault: true,
                  stages: [],
                },
              ],
            });
          }}
        >
          <PlusIcon className="mr-2 size-4" />
          Crear Pipeline
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {pipelines.map((pipeline, pipelineIndex) => (
        <div
          key={pipeline.id || pipelineIndex}
          className="rounded-lg border p-4 space-y-4"
        >
          <div className="flex items-center justify-between">
            <div className="flex-1 space-y-2">
              <input
                type="text"
                value={pipeline.name}
                onChange={(e) =>
                  updatePipeline(pipelineIndex, { name: e.target.value })
                }
                placeholder="Nombre del pipeline"
                className="font-medium text-lg bg-transparent border-none focus:outline-none focus:ring-2 focus:ring-ring rounded px-2 py-1 -ml-2 w-full"
              />
              <input
                type="text"
                value={pipeline.description || ""}
                onChange={(e) =>
                  updatePipeline(pipelineIndex, { description: e.target.value })
                }
                placeholder="Descripción opcional"
                className="text-sm text-muted-foreground bg-transparent border-none focus:outline-none w-full"
              />
            </div>
            <div className="flex items-center gap-2 ml-4">
              {pipeline.isDefault && (
                <span className="text-xs bg-primary/10 text-primary px-2 py-1 rounded">
                  Default
                </span>
              )}
            </div>
          </div>

          <div className="space-y-3">
            <p className="text-sm font-medium">Etapas (Stages)</p>
            <div className="space-y-2">
              {pipeline.stages.map((stage, stageIndex) => (
                <div
                  key={stage.id || stageIndex}
                  className="flex items-center gap-2 p-3 rounded-md border bg-card"
                >
                  <span
                    className="flex items-center justify-center w-8 h-8 rounded text-lg"
                    style={{ backgroundColor: stage.color + "20" }}
                  >
                    {stage.icon}
                  </span>
                  <div className="flex-1 min-w-0">
                    <span className="font-medium text-sm">{stage.name}</span>
                    <div className="flex items-center gap-2 mt-1">
                      {stage.stageType && (
                        <span className="text-xs text-muted-foreground">
                          Tipo:{" "}
                          {STAGE_TYPES.find(
                            (st) => st.value === stage.stageType,
                          )?.label || stage.stageType}
                        </span>
                      )}
                    </div>
                  </div>
                  <div
                    className="w-4 h-4 rounded-full border"
                    style={{ backgroundColor: stage.color }}
                  />
                </div>
              ))}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function SectionReview({
  state,
  catalog,
  isSaving,
  onSubmit,
}: SectionProps & { onSubmit: () => void }) {
  const isComplete =
    !!state.business_name &&
    !!state.owner_name &&
    !!state.industry &&
    state.selected_tools.length > 0 &&
    !!state.agent_name;

  const missingFields: string[] = [];
  if (!state.business_name) missingFields.push("Nombre del negocio");
  if (!state.owner_name) missingFields.push("Responsable");
  if (!state.industry) missingFields.push("Industria");
  if (state.selected_tools.length === 0) {
    missingFields.push("Herramientas recomendadas por IA");
  }
  if (!state.agent_name) missingFields.push("Nombre del agente");

  return (
    <div className="space-y-6">
      {!isComplete && (
        <div className="rounded-lg border border-destructive/50 bg-destructive/5 p-4">
          <p className="mb-2 font-medium text-destructive">
            Para crear tu agente necesitas:
          </p>
          <ul className="space-y-1">
            {missingFields.map((field) => (
              <li
                key={field}
                className="flex items-center gap-2 text-sm text-destructive"
              >
                <XIcon className="size-4" />
                {field}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="rounded-lg border p-4">
        <p className="mb-3 font-medium">📋 Negocio</p>
        <dl className="space-y-2 text-sm">
          <div className="flex justify-between">
            <dt className="text-muted-foreground">Nombre:</dt>
            <dd>{state.business_name || "—"}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-muted-foreground">Industria:</dt>
            <dd>{state.industry || "—"}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-muted-foreground">Descripción:</dt>
            <dd className="max-w-[200px] truncate">
              {state.description || "—"}
            </dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-muted-foreground">País:</dt>
            <dd>{state.country || "—"}</dd>
          </div>
        </dl>
      </div>

      <div className="rounded-lg border p-4">
        <p className="mb-3 font-medium">
          🔧 Herramientas ({state.selected_tools.length})
        </p>
        {state.selected_tools.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No hay herramientas seleccionadas
          </p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {state.selected_tools.map((toolId) => {
              const tool = catalog.find((t) => t.id === toolId);
              return tool ? (
                <span
                  key={toolId}
                  className="flex items-center gap-1 rounded-full bg-muted px-2 py-1 text-xs"
                >
                  {tool.displayName || tool.name}
                </span>
              ) : null;
            })}
          </div>
        )}
      </div>

      <div className="rounded-lg border p-4">
        <p className="mb-3 font-medium">🎭 Personalidad</p>
        <dl className="space-y-2 text-sm">
          <div className="flex justify-between">
            <dt className="text-muted-foreground">Nombre:</dt>
            <dd>{state.agent_name || "—"}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-muted-foreground">Idioma:</dt>
            <dd>{state.response_language || "—"}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-muted-foreground">Emojis:</dt>
            <dd>{state.use_emojis || "—"}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-muted-foreground">Rasgos:</dt>
            <dd>{state.personality_traits.join(", ") || "—"}</dd>
          </div>
        </dl>
      </div>

      <Button
        onClick={onSubmit}
        disabled={!isComplete || isSaving}
        className="w-full"
        size="lg"
      >
        {isSaving ? (
          <>
            <Loader2Icon className="mr-2 size-4 animate-spin" />
            Creando agente...
          </>
        ) : (
          <>
            <CheckIcon className="mr-2 size-4" />
            Crear agente
          </>
        )}
      </Button>
    </div>
  );
}

function TemplatesSection({
  onChange,
  onNext,
}: {
  onChange: (updates: Partial<FormBuilderState>) => void;
  onNext?: () => void;
}) {
  const templates = [
    {
      id: "sales",
      label: "Asistente de Ventas",
      description:
        "Configuración completa para ventas, con gestión de clientes",
      icon: "🛒",
      industry: "Retail",
    },
    {
      id: "support",
      label: "Soporte Técnico",
      description: "Ayuda a clientes con problemas técnicos",
      icon: "📞",
      industry: "Servicios",
    },
    {
      id: "admin",
      label: "Asistente Admin",
      description: "Gestión de citas, agenda y tareas",
      icon: "💼",
      industry: "Servicios",
    },
    {
      id: "concierge",
      label: "Concierge",
      description: "Atención al cliente cálida y personalizada",
      icon: "🏨",
      industry: "Servicios",
    },
    {
      id: "custom",
      label: "Empezar desde cero",
      description: "Construye tu agente paso a paso",
      icon: "✨",
      industry: "",
    },
  ];

  return (
    <div className="grid gap-3">
      {templates.map((template) => (
        <button
          key={template.id}
          type="button"
          onClick={() => {
            if (template.id === "custom") {
              onChange({ industry: "" });
            } else {
              onChange({
                industry: template.industry || "Servicios",
                agent_description: `Soy un ${template.label.toLowerCase()} que ayuda a los clientes...`,
                agent_personality: "",
                use_emojis: "moderate",
                personality_traits: [],
              });
              toast.success(`Plantilla "${template.label}" aplicada`);
            }
            if (onNext) {
              setTimeout(() => onNext(), 300);
            }
          }}
          className="flex items-start gap-3 rounded-lg border border-border p-4 text-left transition-colors hover:bg-muted/50"
        >
          <span className="text-2xl">{template.icon}</span>
          <div>
            <p className="font-medium">{template.label}</p>
            <p className="text-sm text-muted-foreground">
              {template.description}
            </p>
          </div>
        </button>
      ))}
    </div>
  );
}

export function AgentFormBuilder() {
  const { session } = useAuth();
  const userName = session?.user?.name ?? session?.user?.email ?? "";
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);

  const [state, setState] = useState<FormBuilderState>(() => ({
    ...DEFAULT_FORM_STATE,
    owner_name: userName,
  }));
  const [currentSection, setCurrentSection] =
    useState<FormSectionId>("templates");
  const [completedSections, setCompletedSections] = useState<
    Set<FormSectionId>
  >(new Set());
  const [catalog, setCatalog] = useState<ToolsCatalogItem[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [isLoadingCatalog, setIsLoadingCatalog] = useState(true);
  const [dynamicQuestions, setDynamicQuestions] = useState<DynamicQuestion[]>(
    [],
  );
  const [dynamicAnswers, setDynamicAnswers] = useState<Record<string, string>>(
    {},
  );
  const [isAnalyzingAI, setIsAnalyzingAI] = useState(false);
  const [toolsRegenerateNonce, setToolsRegenerateNonce] = useState(0);
  const [toolsRecommendLoading, setToolsRecommendLoading] = useState(false);
  const [toolsRecommendError, setToolsRecommendError] = useState<string | null>(
    null,
  );
  const [toolsRationale, setToolsRationale] = useState<string | null>(null);
  const [toolsWarnings, setToolsWarnings] = useState<string[]>([]);
  const [toolReasonById, setToolReasonById] = useState<Record<string, string>>(
    {},
  );
  const lastToolsSuccessHashRef = useRef<string | null>(null);
  const lastToolsRegenNonceRef = useRef(0);
  const [isToolFlowDocStep, setIsToolFlowDocStep] = useState(false);
  const [toolManualOfferOpen, setToolManualOfferOpen] = useState(false);
  const [toolFlowsGenLoading, setToolFlowsGenLoading] = useState(false);
  /** Texto acumulado mientras el modelo escribe (SSE); el editor lo muestra en vivo. */
  const [toolFlowsGenStreamText, setToolFlowsGenStreamText] = useState("");
  const [rawViewToolFlows, setRawViewToolFlows] = useState(false);
  const [toolFlowsMarkdownRemount, setToolFlowsMarkdownRemount] = useState(0);
  const [regenerateToolFlowsOpen, setRegenerateToolFlowsOpen] = useState(false);
  const [updateToolFlowsOpen, setUpdateToolFlowsOpen] = useState(false);
  const [flowQuestionsLoading, setFlowQuestionsLoading] = useState(false);
  const [flowQuestionsError, setFlowQuestionsError] = useState<string | null>(
    null,
  );
  const [flowQuestionsRegenNonce, setFlowQuestionsRegenNonce] = useState(0);
  const lastFlowSuccessHashRef = useRef<string | null>(null);
  const lastFlowRegenNonceRef = useRef(0);
  /** Evita POST duplicado al pulsar Siguiente si el payload del negocio no cambió. */
  const lastAutoSavedBusinessPayloadRef = useRef<string | null>(null);

  const [editingSavedCompanyId, setEditingSavedCompanyId] = useState<
    string | null
  >(null);

  const onBusinessProfileSaved = useCallback(
    (payload: BuilderCompanyPayload) => {
      lastAutoSavedBusinessPayloadRef.current = JSON.stringify(payload);
    },
    [],
  );

  const handleEditingSavedCompanyIdChange = useCallback((id: string | null) => {
    setEditingSavedCompanyId(id);
    if (id === null) {
      lastAutoSavedBusinessPayloadRef.current = null;
    }
  }, []);

  const saveBusinessProfileToFirestore = useCallback(async (): Promise<
    { ok: true; mode: "created" | "updated" } | { ok: false; error: string }
  > => {
    if (!canPersistBuilderCompany(state)) {
      return {
        ok: false,
        error:
          "Completa los campos obligatorios del negocio antes de guardar el perfil.",
      };
    }
    const payload = formStateToBuilderCompanyPayload(state);
    if (editingSavedCompanyId) {
      const res = await patchSavedBuilderCompany(editingSavedCompanyId, {
        payload,
      });
      if (res.ok) {
        onBusinessProfileSaved(payload);
        return { ok: true, mode: "updated" };
      }
      return { ok: false, error: res.error };
    }
    const res = await postSavedBuilderCompany({ payload });
    if (res.ok) {
      setEditingSavedCompanyId(res.id);
      onBusinessProfileSaved(payload);
      return { ok: true, mode: "created" };
    }
    return { ok: false, error: res.error };
  }, [state, editingSavedCompanyId, onBusinessProfileSaved]);

  /* eslint-disable react-hooks/exhaustive-deps -- hash Flujos: campos que disparan nuevas preguntas */
  const flowQuestionsTriggerHash = useMemo(
    () => buildFlowQuestionsTriggerHash(state),
    [
      state.business_name,
      state.owner_name,
      state.industry,
      state.custom_industry,
      state.description,
      state.target_audience,
      state.agent_description,
      state.escalation_rules,
      state.country,
      state.business_timezone,
      state.agent_name,
      state.agent_personality,
      state.response_language,
      state.use_emojis,
      state.country_accent,
      state.agent_signature,
      state.personality_traits,
      state.require_auth,
    ],
  );

  /* eslint-disable react-hooks/exhaustive-deps -- recomendación tools: deps campo a campo alineados con buildToolsRecommendContextHash */
  const toolsContextHash = useMemo(
    () => buildToolsRecommendContextHash(state),
    [
      state.business_name,
      state.owner_name,
      state.industry,
      state.custom_industry,
      state.description,
      state.target_audience,
      state.agent_description,
      state.escalation_rules,
      state.country,
      state.business_timezone,
      state.agent_name,
      state.agent_personality,
      state.response_language,
      state.use_emojis,
      state.country_accent,
      state.agent_signature,
      state.personality_traits,
      state.require_auth,
      JSON.stringify(state.flow_answers),
      JSON.stringify(state.flow_questions),
    ],
  );

  useEffect(() => {
    void (async () => {
      const tools = await fetchToolsCatalog();
      setCatalog(tools ?? []);
      setIsLoadingCatalog(false);
    })();
  }, []);

  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (hasUnsavedChanges) {
        e.preventDefault();
        e.returnValue = "";
      }
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [hasUnsavedChanges]);

  useEffect(() => {
    if (currentSection !== "flows") return;
    if (!areCoreProfileComplete(state)) return;

    const h = flowQuestionsTriggerHash;
    const regen = flowQuestionsRegenNonce;

    const shouldFetch =
      regen > lastFlowRegenNonceRef.current ||
      lastFlowSuccessHashRef.current !== h ||
      state.flow_questions.length === 0;

    if (!shouldFetch) return;

    lastFlowRegenNonceRef.current = regen;

    let cancelled = false;
    setFlowQuestionsLoading(true);
    setFlowQuestionsError(null);

    void (async () => {
      const res = await fetchAgentFlowQuestions({
        business_name: state.business_name,
        owner_name: state.owner_name,
        industry: state.industry,
        custom_industry: state.custom_industry,
        description: state.description,
        target_audience: state.target_audience,
        agent_description: state.agent_description,
        escalation_rules: state.escalation_rules,
        country: state.country,
        business_timezone: state.business_timezone,
        agent_name: state.agent_name,
        agent_personality: state.agent_personality,
        response_language: state.response_language,
        business_hours: "",
        require_auth: state.require_auth,
      });

      if (cancelled) return;

      if (res.ok) {
        setState((prev) => ({
          ...prev,
          flow_questions: res.questions as AgentFlowQuestion[],
          flow_answers: {},
        }));
        lastFlowSuccessHashRef.current = h;
      } else {
        setFlowQuestionsError(res.error);
      }
      setFlowQuestionsLoading(false);
    })();

    return () => {
      cancelled = true;
      setFlowQuestionsLoading(false);
    };
  }, [
    currentSection,
    flowQuestionsTriggerHash,
    flowQuestionsRegenNonce,
    state.flow_questions.length,
    state.business_name,
    state.owner_name,
    state.industry,
    state.custom_industry,
    state.description,
    state.target_audience,
    state.agent_description,
    state.escalation_rules,
    state.country,
    state.business_timezone,
    state.agent_name,
    state.agent_personality,
    state.response_language,
    state.require_auth,
    state.use_emojis,
    state.country_accent,
    state.agent_signature,
    state.personality_traits,
  ]);

  useEffect(() => {
    if (currentSection !== "tools") return;
    if (!areToolsPrerequisitesMet(state)) return;
    if (catalog.length === 0) return;

    const hash = toolsContextHash;
    const regen = toolsRegenerateNonce;

    const shouldFetch =
      regen > lastToolsRegenNonceRef.current ||
      lastToolsSuccessHashRef.current !== hash ||
      state.selected_tools.length === 0;

    if (!shouldFetch) return;

    lastToolsRegenNonceRef.current = regen;

    let cancelled = false;
    setToolsRecommendLoading(true);
    setToolsRecommendError(null);

    void (async () => {
      const res = await recommendAgentTools({
        business_name: state.business_name,
        owner_name: state.owner_name,
        industry: state.industry,
        custom_industry: state.custom_industry,
        description: state.description,
        target_audience: state.target_audience,
        agent_description: state.agent_description,
        escalation_rules: state.escalation_rules,
        country: state.country,
        business_timezone: state.business_timezone,
        agent_name: state.agent_name,
        agent_personality: state.agent_personality,
        response_language: state.response_language,
        business_hours: "",
        require_auth: state.require_auth,
        operational_context: buildOperationalContextNarrative(state),
      });

      if (cancelled) return;

      if (res.ok) {
        setState((prev) => ({ ...prev, selected_tools: res.toolIds }));
        const map: Record<string, string> = {};
        for (const p of res.perTool) {
          map[p.id] = p.reason;
        }
        setToolReasonById(map);
        setToolsRationale(res.rationale);
        setToolsWarnings(res.warnings);
        lastToolsSuccessHashRef.current = hash;
      } else {
        setToolsRecommendError(res.error);
      }
      setToolsRecommendLoading(false);
    })();

    return () => {
      cancelled = true;
      setToolsRecommendLoading(false);
    };
  }, [
    currentSection,
    toolsContextHash,
    catalog.length,
    toolsRegenerateNonce,
    state.selected_tools.length,
    state.business_name,
    state.owner_name,
    state.industry,
    state.custom_industry,
    state.description,
    state.target_audience,
    state.agent_description,
    state.escalation_rules,
    state.country,
    state.business_timezone,
    state.agent_name,
    state.agent_personality,
    state.response_language,
    state.require_auth,
    JSON.stringify(state.flow_answers),
    JSON.stringify(state.flow_questions),
  ]);
  /* eslint-enable react-hooks/exhaustive-deps */

  useEffect(() => {
    if (currentSection !== "tools") {
      setIsToolFlowDocStep(false);
      setToolManualOfferOpen(false);
    }
  }, [currentSection]);

  const handleChange = useCallback((updates: Partial<FormBuilderState>) => {
    setState((prev) => ({ ...prev, ...updates }));
    setHasUnsavedChanges(true);
  }, []);

  const runToolFlowsMarkdown = useCallback(
    async (mode: "generate" | "update") => {
      if (state.selected_tools.length === 0) {
        toast.error("Selecciona al menos una herramienta.");
        return;
      }
      if (mode === "update" && !state.toolFlowsMarkdownEs.trim()) {
        toast.error(
          "No hay manual para actualizar. Genera uno primero o usa Regenerar.",
        );
        return;
      }
      setToolFlowsGenStreamText("");
      setToolFlowsGenLoading(true);
      try {
        const base = buildToolFlowsMarkdownPayload(
          state,
          catalog,
          toolsRationale,
          toolReasonById,
        );
        const res = await generateAgentToolFlowsMarkdown(
          {
            ...base,
            mode,
            ...(mode === "update"
              ? { existingMarkdownEs: state.toolFlowsMarkdownEs }
              : {}),
          },
          { onStreamDelta: (acc) => setToolFlowsGenStreamText(acc) },
        );
        if (res.ok) {
          setState((prev) => ({
            ...prev,
            toolFlowsMarkdownEs: res.markdown,
          }));
          setHasUnsavedChanges(true);
          toast.success(
            mode === "generate"
              ? "Manual generado"
              : "Manual actualizado según las herramientas",
          );
        } else {
          toast.error(res.error);
        }
      } finally {
        setToolFlowsGenLoading(false);
        setToolFlowsGenStreamText("");
      }
    },
    [state, catalog, toolsRationale, toolReasonById],
  );

  const handleDynamicAnswerChange = useCallback(
    (field: string, value: string) => {
      setDynamicAnswers((prev) => ({ ...prev, [field]: value }));
    },
    [],
  );

  const canProceed = useCallback(
    (section: FormSectionId): boolean => {
      switch (section) {
        case "business":
          return (
            !!state.business_name.trim() &&
            !!state.owner_name.trim() &&
            industryIsComplete(state) &&
            !!state.description.trim() &&
            !!state.target_audience.trim() &&
            !!state.agent_description.trim() &&
            !!state.escalation_rules.trim() &&
            !!state.country.trim()
          );
        case "personality":
          return (
            !!state.agent_name.trim() &&
            !!state.agent_personality.trim() &&
            !!state.response_language.trim() &&
            !!state.use_emojis
          );
        case "flows":
          return (
            areCoreProfileComplete(state) &&
            state.flow_questions.length > 0 &&
            isFlowsStepComplete(state)
          );
        case "tools":
          return state.selected_tools.length > 0;
        case "pipelines":
          return true; // Optional section
        case "review":
          return (
            !!state.business_name.trim() &&
            industryIsComplete(state) &&
            state.selected_tools.length > 0 &&
            !!state.agent_name.trim()
          );
        default:
          return true;
      }
    },
    [state],
  );

  const shouldAnalyzeWithAI = (section: FormSectionId): boolean => {
    if (section === "business") {
      return (
        !!state.industry ||
        !!state.description ||
        !!state.target_audience ||
        !!state.agent_description
      );
    }
    if (section === "personality")
      return !!state.agent_personality || !!state.agent_name;
    return false;
  };

  const advanceToNextSection = useCallback(() => {
    const sections = FORM_SECTIONS.map((s) => s.id);
    const currentIndex = sections.indexOf(currentSection);
    if (currentIndex < sections.length - 1) {
      const nextSection = sections[currentIndex + 1];
      setCurrentSection(nextSection);
      setCompletedSections((prev) => new Set([...prev, currentSection]));
    }
  }, [currentSection]);

  const handleNext = useCallback(async () => {
    if (!canProceed(currentSection)) {
      let errorMsg = "Completa los campos requeridos:";

      switch (currentSection) {
        case "business":
          if (!state.business_name) errorMsg += "\n• Nombre del negocio";
          if (!state.owner_name?.trim()) errorMsg += "\n• Responsable";
          if (!state.industry) errorMsg += "\n• Industria";
          if (state.industry === "Otro" && !state.custom_industry)
            errorMsg += "\n• Especifica tu industria";
          if (!state.description) errorMsg += "\n• Descripción del negocio";
          if (!state.target_audience) errorMsg += "\n• Audiencia objetivo";
          if (!state.agent_description) errorMsg += "\n• Rol del agente";
          if (!state.escalation_rules) errorMsg += "\n• Reglas de escalamiento";
          if (!state.country) errorMsg += "\n• País";
          break;
        case "personality":
          if (!state.agent_name) errorMsg += "\n• Nombre del agente";
          if (!state.agent_personality)
            errorMsg += "\n• Personalidad del agente";
          if (!state.response_language) errorMsg += "\n• Idioma";
          if (!state.use_emojis) errorMsg += "\n• Uso de emojis";
          if (!state.tone) errorMsg += "\n• Tono de voz";
          break;
        case "flows":
          if (state.flow_questions.length === 0) {
            errorMsg += "\n• Espera a que se generen las preguntas o reintenta";
          } else if (!isFlowsStepComplete(state)) {
            errorMsg += "\n• Responde todas las preguntas del paso Flujos";
          }
          break;
        case "tools":
          if (state.selected_tools.length === 0) {
            errorMsg += "\n• Genera o espera la recomendación de herramientas";
          }
          break;
      }

      alert(errorMsg);
      return;
    }

    if (currentSection === "tools" && !isToolFlowDocStep) {
      setToolManualOfferOpen(true);
      return;
    }

    if (currentSection === "business" && canPersistBuilderCompany(state)) {
      const payload = formStateToBuilderCompanyPayload(state);
      const serialized = JSON.stringify(payload);
      if (serialized !== lastAutoSavedBusinessPayloadRef.current) {
        try {
          const r = await saveBusinessProfileToFirestore();
          if (r.ok) {
            lastAutoSavedBusinessPayloadRef.current = serialized;
            toast.success("Perfil del negocio guardado", { duration: 2200 });
          } else {
            toast.error(r.error, { duration: 5000 });
          }
        } catch (e) {
          console.error("[AgentFormBuilder] auto-save business:", e);
        }
      }
    }

    // Analyze with AI for dynamic questions
    if (shouldAnalyzeWithAI(currentSection)) {
      setIsAnalyzingAI(true);
      try {
        const questions = await analyzeAgentWithAI(
          currentSection,
          state as unknown as Record<string, unknown>,
        );
        if (questions && questions.length > 0) {
          const relevantQuestions = questions.filter(
            (q) => q.section === currentSection,
          );
          if (relevantQuestions.length > 0) {
            setDynamicQuestions(relevantQuestions);
            setDynamicAnswers({});
            setIsAnalyzingAI(false);
            return; // Show dynamic questions instead of advancing
          }
        }
      } catch (error) {
        console.error("AI analysis error:", error);
      }
      setIsAnalyzingAI(false);
    }

    // No dynamic questions, advance normally
    const exitingToolFlowDoc = currentSection === "tools" && isToolFlowDocStep;
    advanceToNextSection();
    if (exitingToolFlowDoc) {
      setIsToolFlowDocStep(false);
    }
  }, [
    currentSection,
    canProceed,
    state,
    isToolFlowDocStep,
    advanceToNextSection,
    saveBusinessProfileToFirestore,
  ]);

  const handleSkipDynamicQuestions = useCallback(() => {
    setDynamicQuestions([]);
    setDynamicAnswers({});
    advanceToNextSection();
  }, [advanceToNextSection]);

  const handleSubmitDynamicAnswers = useCallback(() => {
    // Merge dynamic answers into state
    const updates: Partial<FormBuilderState> = {};
    Object.entries(dynamicAnswers).forEach(([field, value]) => {
      if (value.trim()) {
        (updates as Record<string, unknown>)[field] = value;
      }
    });
    setState((prev) => ({ ...prev, ...updates }));
    setDynamicQuestions([]);
    setDynamicAnswers({});
    advanceToNextSection();
  }, [dynamicAnswers, advanceToNextSection]);

  const handlePrev = useCallback(() => {
    if (isToolFlowDocStep) {
      setIsToolFlowDocStep(false);
      return;
    }
    const sections = FORM_SECTIONS.map((s) => s.id);
    const currentIndex = sections.indexOf(currentSection);
    if (currentIndex > 0) {
      setCurrentSection(sections[currentIndex - 1]);
    }
  }, [currentSection, isToolFlowDocStep]);

  const handleRegenerateTools = useCallback(() => {
    setToolsRegenerateNonce((n) => n + 1);
  }, []);

  const handleRegenerateFlowQuestions = useCallback(() => {
    setFlowQuestionsRegenNonce((n) => n + 1);
  }, []);

  const handleRetryFlowQuestions = useCallback(() => {
    setFlowQuestionsError(null);
    setFlowQuestionsRegenNonce((n) => n + 1);
  }, []);

  const toolsPrerequisitesMet = areToolsPrerequisitesMet(state);
  const toolsFirstBlocked = getFirstIncompleteSectionForTools(state);
  const coreProfileComplete = areCoreProfileComplete(state);
  const firstCoreIncomplete = getFirstCoreIncompleteSection(state);
  const operationalSummary = buildOperationalContextNarrative(state);

  const handleSubmit = useCallback(async () => {
    if (!canProceed("review")) {
      toast.error("Completa los campos requeridos");
      return;
    }

    setIsSaving(true);
    try {
      const created = await postAgentDraft({
        agent_name: state.agent_name.trim(),
        agent_personality: state.agent_personality.trim(),
      });

      if (!created.ok) {
        toast.error(created.error);
        return;
      }

      const draftId = created.id;

      await patchAgentDraft(draftId, {
        step: "business",
        business_name: state.business_name.trim(),
        owner_name: state.owner_name.trim(),
        industry: state.industry.trim(),
        custom_industry: state.custom_industry.trim(),
        description: state.description.trim(),
        agent_description: state.agent_description.trim(),
        target_audience: state.target_audience.trim(),
        escalation_rules: state.escalation_rules.trim(),
        country: state.country.trim(),
        business_timezone: state.business_timezone.trim(),
        business_hours: "",
        require_auth: state.require_auth,
        flow_answers: state.flow_answers,
        flow_questions: state.flow_questions,
        pipelines: state.pipelines as unknown as Array<Record<string, unknown>>,
        brand_values: state.brandValues,
        policies: state.policies.trim(),
        operating_hours: "",
        ai_model: state.ai_model.trim(),
        ai_temperature: state.ai_temperature,
        response_wait_time: state.response_wait_time,
        is_memory_enable: state.is_memory_enable,
        is_multi_message_response_enable:
          state.is_multi_message_response_enable,
        is_validator_agent_enable: state.is_validator_agent_enable,
        mcp_max_retries: state.mcp_max_retries,
        answer_not_support: state.answer_not_support.trim(),
      });

      await patchAgentDraft(draftId, {
        step: "tools",
        selected_tools: state.selected_tools,
        toolFlowsMarkdownEs: state.toolFlowsMarkdownEs,
      });

      await patchAgentDraft(draftId, {
        step: "personality",
        agent_name: state.agent_name.trim(),
        agent_personality: state.agent_personality.trim(),
        response_language: state.response_language.trim() || "Spanish",
        use_emojis: state.use_emojis,
        country_accent: state.country_accent.trim(),
        agent_signature: state.agent_signature.trim(),
        tone: state.tone,
        greeting_message: state.greetingMessage.trim(),
        response_length: state.responseLength,
        required_phrases: state.requiredPhrases,
        topics_to_avoid: state.topicsToAvoid,
        conversation_style: state.conversationStyle,
      });

      await patchAgentDraft(draftId, { step: "complete" });

      const promptDesignUrl = `/agents/${encodeURIComponent(draftId)}/prompt-design`;
      let didNavigate = false;
      let redirectTimeout: ReturnType<typeof setTimeout> | null = null;
      const goToPromptDesign = () => {
        if (didNavigate) return;
        didNavigate = true;
        if (redirectTimeout) {
          clearTimeout(redirectTimeout);
          redirectTimeout = null;
        }
        window.location.href = promptDesignUrl;
      };

      toast.success("¡Agente creado exitosamente! Ahora diseña tu prompt.", {
        duration: 3500,
        action: {
          label: "Ir a diseñar prompt",
          onClick: goToPromptDesign,
        },
      });

      // Mantiene el flujo automático para continuar con la configuración inicial.
      redirectTimeout = setTimeout(goToPromptDesign, 1600);
    } catch (error) {
      toast.error("Error al crear el agente");
      console.error(error);
    } finally {
      setIsSaving(false);
    }
  }, [state, canProceed]);

  const renderSection = () => {
    const sectionProps: SectionProps = {
      state,
      onChange: handleChange,
      catalog,
      isSaving,
      userName,
    };

    switch (currentSection) {
      case "templates":
        return (
          <TemplatesSection
            onChange={handleChange}
            onNext={() => handleNext()}
          />
        );
      case "business":
        return (
          <SectionBusiness
            {...sectionProps}
            onBusinessProfileSaved={onBusinessProfileSaved}
            editingSavedCompanyId={editingSavedCompanyId}
            onEditingSavedCompanyIdChange={handleEditingSavedCompanyIdChange}
            saveBusinessProfileToFirestore={saveBusinessProfileToFirestore}
          />
        );
      case "personality":
        return <SectionPersonality {...sectionProps} />;
      case "advanced":
        return <SectionAdvanced {...sectionProps} />;
      case "flows":
        return (
          <SectionFlows
            {...sectionProps}
            coreComplete={coreProfileComplete}
            firstCoreIncomplete={firstCoreIncomplete}
            onGoToSection={setCurrentSection}
            flowQuestionsLoading={flowQuestionsLoading}
            flowQuestionsError={flowQuestionsError}
            onRetryFlowQuestions={handleRetryFlowQuestions}
            onRegenerateFlowQuestions={handleRegenerateFlowQuestions}
          />
        );
      case "tools":
        if (isToolFlowDocStep) {
          return (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Documenta en español cómo debe el agente usar cada herramienta
                (disparadores, datos a pedir, qué decir al usuario con el
                resultado). La generación con IA usa tu negocio, el paso Flujos,
                las políticas de Avanzado y la justificación de la recomendación
                de herramientas. Este contenido se integrará al generar el
                prompt del sistema (traducido a inglés).
              </p>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={toolFlowsGenLoading}
                  onClick={() => setRegenerateToolFlowsOpen(true)}
                >
                  <RotateCcwIcon className="mr-2 size-4" />
                  Regenerar
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={toolFlowsGenLoading}
                  onClick={() => setUpdateToolFlowsOpen(true)}
                >
                  <RefreshCwIcon className="mr-2 size-4" />
                  Actualizar
                </Button>
              </div>
              <div className="flex items-center justify-end border-b pb-2">
                <PromptMarkdownViewToggle
                  rawView={rawViewToolFlows}
                  onRawViewChange={(raw) => {
                    setRawViewToolFlows(raw);
                    if (!raw) setToolFlowsMarkdownRemount((n) => n + 1);
                  }}
                  disabled={toolFlowsGenLoading}
                />
              </div>
              <PromptMarkdownEditor
                value={
                  toolFlowsGenLoading
                    ? toolFlowsGenStreamText
                    : state.toolFlowsMarkdownEs
                }
                onChange={(md) => handleChange({ toolFlowsMarkdownEs: md })}
                disabled={toolFlowsGenLoading}
                className="min-h-[320px] w-full text-sm"
                placeholder="# Manual de herramientas — describe flujos por herramienta"
                rawView={rawViewToolFlows}
                markdownPaneRemountKey={toolFlowsMarkdownRemount}
              />
              {toolFlowsGenLoading ? (
                <p className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                  <Loader2Icon className="size-4 shrink-0 animate-spin" />
                  <span>
                    Generando con IA… el texto aparece en vivo en el editor (no
                    es el borrador anterior).
                  </span>
                </p>
              ) : null}
            </div>
          );
        }
        return (
          <SectionTools
            {...sectionProps}
            prerequisitesMet={toolsPrerequisitesMet}
            firstBlockedSection={toolsFirstBlocked}
            onGoToSection={setCurrentSection}
            recommendLoading={toolsRecommendLoading}
            recommendError={toolsRecommendError}
            onRegenerateTools={handleRegenerateTools}
            toolsRationale={toolsRationale}
            toolsWarnings={toolsWarnings}
            toolReasonById={toolReasonById}
            operationalSummary={operationalSummary}
          />
        );
      case "pipelines":
        return <SectionPipelines {...sectionProps} />;
      case "review":
        return <SectionReview {...sectionProps} onSubmit={handleSubmit} />;
      default:
        return null;
    }
  };

  const sections = FORM_SECTIONS;
  const currentIndex = sections.findIndex((s) => s.id === currentSection);
  const stepTitle =
    currentSection === "tools" && isToolFlowDocStep
      ? "Manual de herramientas"
      : (sections[currentIndex]?.title ?? "");
  const stepDescription =
    currentSection === "tools" && isToolFlowDocStep
      ? "Markdown en español: cuándo y cómo usar cada herramienta. Incluye ejemplos del tipo «si el usuario pregunta X → usar la herramienta Y → responder con Z». Regenerar o Actualizar piden confirmación."
      : (sections[currentIndex]?.description ?? "");

  return (
    <div className="flex h-screen flex-col overflow-hidden">
      <Dialog open={toolManualOfferOpen} onOpenChange={setToolManualOfferOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>¿Revisar manual de herramientas?</DialogTitle>
            <DialogDescription>
              Puedes generar y editar un documento en español con los flujos de
              uso de las herramientas seleccionadas. Se usará al diseñar el
              prompt del agente (traducido a inglés). Si prefieres omitir este
              paso, pulsa No.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:justify-end">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setToolManualOfferOpen(false);
                advanceToNextSection();
              }}
            >
              No, continuar
            </Button>
            <Button
              type="button"
              onClick={() => {
                setToolManualOfferOpen(false);
                setIsToolFlowDocStep(true);
                if (!state.toolFlowsMarkdownEs.trim()) {
                  void runToolFlowsMarkdown("generate");
                }
              }}
            >
              Sí, revisar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmationDialog
        open={regenerateToolFlowsOpen}
        onOpenChange={setRegenerateToolFlowsOpen}
        title="¿Regenerar el manual?"
        description="Se generará de nuevo el markdown con IA. Si habías editado el texto a mano, esos cambios se perderán al sustituir el contenido."
        confirmText="Regenerar"
        onConfirm={() => {
          setRegenerateToolFlowsOpen(false);
          void runToolFlowsMarkdown("generate");
        }}
      />

      <ConfirmationDialog
        open={updateToolFlowsOpen}
        onOpenChange={setUpdateToolFlowsOpen}
        title="¿Actualizar el manual?"
        description="La IA ajustará el documento a la lista actual de herramientas y al contexto del negocio, conservando lo que siga siendo válido cuando sea posible."
        confirmText="Actualizar"
        onConfirm={() => {
          setUpdateToolFlowsOpen(false);
          void runToolFlowsMarkdown("update");
        }}
      />

      <div className="shrink-0 flex items-center gap-2 border-b px-4 py-3">
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <button
              type="button"
              className="flex items-center gap-2 rounded-full px-3 py-1.5 text-sm transition-colors bg-muted text-muted-foreground hover:bg-muted/80"
            >
              <HomeIcon className="size-4" />
              <span className="hidden sm:inline">Salir</span>
            </button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>¿Salir del constructor?</AlertDialogTitle>
              <AlertDialogDescription>
                Si sales ahora, perderás el progreso no guardado. ¿Estás seguro
                de que quieres salir?
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => {
                  setHasUnsavedChanges(false);
                  window.location.href = "/";
                }}
              >
                Salir
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
        {sections.map((section) => (
          <button
            key={section.id}
            type="button"
            onClick={() => setCurrentSection(section.id)}
            className={cn(
              "flex items-center gap-2 rounded-full px-3 py-1.5 text-sm transition-colors",
              section.id === currentSection
                ? "bg-primary text-primary-foreground"
                : completedSections.has(section.id)
                  ? "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-100"
                  : "bg-muted text-muted-foreground hover:bg-muted/80",
            )}
          >
            {ICONS[section.id]}
            <span className="hidden sm:inline">{section.title}</span>
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        <div
          className={cn(
            "mx-auto pb-4",
            currentSection === "tools" && isToolFlowDocStep
              ? "max-w-3xl"
              : "max-w-2xl",
          )}
        >
          <div className="mb-6">
            <h2
              className="text-xl font-semibold"
              data-testid="form-builder-section-title"
              data-section={currentSection}
            >
              {stepTitle}
            </h2>
            <p className="text-sm text-muted-foreground">{stepDescription}</p>
          </div>

          {isLoadingCatalog &&
          currentSection === "tools" &&
          !isToolFlowDocStep ? (
            <div className="flex items-center justify-center py-12">
              <Loader2Icon className="size-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <>
              {renderSection()}

              {dynamicQuestions.length > 0 && (
                <div className="mt-6 space-y-4 border-t pt-6">
                  <p className="text-sm font-medium text-muted-foreground">
                    Información adicional sugerida
                  </p>
                  {dynamicQuestions.map((question) => (
                    <div key={question.field}>
                      <label className="text-sm font-medium">
                        {question.label}
                        <span className="text-destructive ml-1">*</span>
                      </label>
                      {question.type === "select" && question.options ? (
                        <select
                          value={dynamicAnswers[question.field] || ""}
                          onChange={(e) =>
                            handleDynamicAnswerChange(
                              question.field,
                              e.target.value,
                            )
                          }
                          className="mt-1 flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                        >
                          <option value="">Selecciona una opción</option>
                          {question.options.map((opt) => (
                            <option key={opt} value={opt}>
                              {opt}
                            </option>
                          ))}
                        </select>
                      ) : question.type === "textarea" ? (
                        <textarea
                          value={dynamicAnswers[question.field] || ""}
                          onChange={(e) =>
                            handleDynamicAnswerChange(
                              question.field,
                              e.target.value,
                            )
                          }
                          placeholder={
                            question.placeholder || "Escribe tu respuesta..."
                          }
                          rows={3}
                          className="mt-1 flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                        />
                      ) : (
                        <input
                          type="text"
                          value={dynamicAnswers[question.field] || ""}
                          onChange={(e) =>
                            handleDynamicAnswerChange(
                              question.field,
                              e.target.value,
                            )
                          }
                          placeholder={
                            question.placeholder || "Escribe tu respuesta..."
                          }
                          className="mt-1 flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                        />
                      )}
                    </div>
                  ))}
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      data-testid="form-builder-dynamic-skip"
                      onClick={handleSkipDynamicQuestions}
                    >
                      Omitir
                    </Button>
                    <Button size="sm" onClick={handleSubmitDynamicAnswers}>
                      Guardar y continuar
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {currentSection !== "templates" &&
        currentSection !== "review" &&
        dynamicQuestions.length === 0 && (
          <div className="mt-auto flex items-center justify-between border-t px-4 py-3">
            <Button
              variant="outline"
              onClick={handlePrev}
              disabled={currentIndex === 0}
            >
              <ArrowLeftIcon className="mr-2 size-4" />
              Anterior
            </Button>
            <Button
              type="button"
              data-testid="form-builder-next"
              onClick={handleNext}
              disabled={
                !canProceed(currentSection) ||
                isAnalyzingAI ||
                (currentSection === "flows" &&
                  (flowQuestionsLoading ||
                    (state.flow_questions.length === 0 &&
                      !flowQuestionsError))) ||
                (currentSection === "tools" &&
                  !isToolFlowDocStep &&
                  toolsRecommendLoading) ||
                (currentSection === "tools" &&
                  isToolFlowDocStep &&
                  toolFlowsGenLoading)
              }
            >
              {isAnalyzingAI ? (
                <>
                  <Loader2Icon className="mr-2 size-4 animate-spin" />
                  Analizando...
                </>
              ) : (
                <>
                  Siguiente
                  <ArrowRightIcon className="ml-2 size-4" />
                </>
              )}
            </Button>
          </div>
        )}
    </div>
  );
}
