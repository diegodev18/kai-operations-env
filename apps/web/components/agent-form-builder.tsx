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
  GripVerticalIcon,
  PlusIcon,
  PencilIcon,
  HomeIcon,
  ChevronDownIcon,
} from "lucide-react";
import { toast } from "sonner";
import { AGENT_BUILDER_MANDATORY_TOOL_NAMES } from "@kai/shared";

import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
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
  fetchAgentFlowQuestions,
  fetchSavedBuilderCompanies,
  postSavedBuilderCompany,
  patchSavedBuilderCompany,
  type ToolsCatalogItem,
  type DynamicQuestion,
  type BuilderCompanyPayload,
  type SavedBuilderCompany,
} from "@/lib/agents-api";
import {
  DEFAULT_FORM_STATE,
  FORM_SECTIONS,
  type FormBuilderState,
  type FormSectionId,
  type PersonalityTrait,
  type AgentFlowQuestion,
  type Pipeline,
  type Stage,
  STAGE_COLORS,
  STAGE_ICONS,
  STAGE_TYPES,
  PERSONALITY_PRESETS,
} from "@/lib/form-builder-constants";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/auth";

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
  if (state.brandValues.length > 0) payload.brandValues = [...state.brandValues];
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
    return !!(state.flow_answers[q.field]?.trim());
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
    business_hours: state.business_hours,
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
    business_hours: state.business_hours,
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
    | { ok: true; mode: "created" | "updated" }
    | { ok: false; error: string }
  >;
}

function parseEscalationRuleLines(raw: string): string[] {
  return raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

/** Lista editable; el valor persistido son las reglas unidas con saltos de línea. */
function EscalationRulesInput({
  value,
  onChange,
}: {
  value: string;
  onChange: (next: string) => void;
}) {
  const items = useMemo(() => parseEscalationRuleLines(value), [value]);
  const [draft, setDraft] = useState("");

  const setItems = (next: string[]) => {
    onChange(next.join("\n"));
  };

  const addRule = () => {
    const t = draft.trim();
    if (!t) return;
    setItems([...items, t]);
    setDraft("");
  };

  const removeAt = (index: number) => {
    setItems(items.filter((_, i) => i !== index));
  };

  return (
    <div className="mt-1 space-y-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <input
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              addRule();
            }
          }}
          placeholder="Ej: Si pide hablar con un humano, ofrecer transferencia"
          className="flex h-10 min-w-0 flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm"
        />
        <Button type="button" variant="secondary" className="shrink-0" onClick={addRule}>
          Añadir
        </Button>
      </div>
      {items.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          Escribe una regla y pulsa Añadir o Enter. Puedes tener varias y quitar las que no apliquen.
        </p>
      ) : (
        <ul className="space-y-2 rounded-md border border-input bg-muted/30 p-2">
          {items.map((item, index) => (
            <li
              key={`${index}-${item.slice(0, 48)}`}
              className="flex items-start gap-2 rounded-md border border-border/60 bg-background px-3 py-2 text-sm"
            >
              <span className="mt-0.5 shrink-0 font-medium text-muted-foreground">{index + 1}.</span>
              <span className="min-w-0 flex-1 break-words">{item}</span>
              <button
                type="button"
                onClick={() => removeAt(index)}
                className="shrink-0 rounded-md p-1 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                aria-label={`Eliminar regla ${index + 1}`}
              >
                <XIcon className="size-4" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Lista editable de strings; el valor persistido son los items unidos con saltos de línea. */
function StringListInput({
  value,
  onChange,
  placeholder,
  maxItems = 10,
}: {
  value: string[];
  onChange: (next: string[]) => void;
  placeholder: string;
  maxItems?: number;
}) {
  const [draft, setDraft] = useState("");

  const addItem = () => {
    const t = draft.trim();
    if (!t || value.length >= maxItems) return;
    onChange([...value, t]);
    setDraft("");
  };

  const removeAt = (index: number) => {
    onChange(value.filter((_, i) => i !== index));
  };

  return (
    <div className="mt-1 space-y-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <input
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              addItem();
            }
          }}
          placeholder={value.length >= maxItems ? `Máximo ${maxItems} items` : placeholder}
          disabled={value.length >= maxItems}
          className="flex h-10 min-w-0 flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm"
        />
        <Button type="button" variant="secondary" className="shrink-0" onClick={addItem} disabled={value.length >= maxItems}>
          Añadir
        </Button>
      </div>
      {value.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          Escribe un valor y pulsa Añadir o Enter.
        </p>
      ) : (
        <ul className="flex flex-wrap gap-2">
          {value.map((item, index) => (
            <li
              key={`${index}-${item.slice(0, 48)}`}
              className="flex items-center gap-1 rounded-full border border-border bg-muted/30 px-3 py-1 text-sm"
            >
              <span className="break-words">{item}</span>
              <button
                type="button"
                onClick={() => removeAt(index)}
                className="rounded-md p-0.5 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                aria-label={`Eliminar ${item}`}
              >
                <XIcon className="size-3" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function SectionBusiness({
  state,
  onChange,
  userName,
  onBusinessProfileSaved,
  editingSavedCompanyId,
  onEditingSavedCompanyIdChange,
  saveBusinessProfileToFirestore,
}: SectionProps) {
  const [savedCompanies, setSavedCompanies] = useState<SavedBuilderCompany[]>(
    [],
  );
  const [savedLoading, setSavedLoading] = useState(true);
  const [savedSearch, setSavedSearch] = useState("");
  const [savingCompany, setSavingCompany] = useState(false);
  const [savedMenuOpen, setSavedMenuOpen] = useState(false);

  useEffect(() => {
    if (userName && !state.owner_name) {
      onChange({ owner_name: userName });
    }
  }, [userName, state.owner_name, onChange]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setSavedLoading(true);
      const res = await fetchSavedBuilderCompanies();
      if (cancelled) return;
      setSavedLoading(false);
      if (res.ok) {
        setSavedCompanies(res.companies);
      } else {
        toast.error(res.error);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const filteredSavedCompanies = useMemo(() => {
    const q = savedSearch.trim().toLowerCase();
    if (!q) return savedCompanies;
    return savedCompanies.filter((c) => {
      if (c.name.toLowerCase().includes(q)) return true;
      const desc = (c.payload.description ?? "").toLowerCase();
      if (desc.includes(q)) return true;
      const blob =
        `${c.payload.businessName ?? ""} ${c.payload.industry ?? ""}`.toLowerCase();
      return blob.includes(q);
    });
  }, [savedCompanies, savedSearch]);

  const applySavedCompany = useCallback(
    (c: SavedBuilderCompany) => {
      onChange(builderCompanyPayloadToPartialState(c.payload));
      onBusinessProfileSaved?.(c.payload);
      onEditingSavedCompanyIdChange?.(c.id);
      toast.success(`Datos de «${c.name}» cargados`);
      setSavedMenuOpen(false);
    },
    [onChange, onBusinessProfileSaved, onEditingSavedCompanyIdChange],
  );

  const editingLabel = useMemo(() => {
    if (!editingSavedCompanyId) return null;
    return savedCompanies.find((s) => s.id === editingSavedCompanyId)?.name ?? null;
  }, [editingSavedCompanyId, savedCompanies]);

  const handleSaveCompanyProfile = useCallback(async () => {
    if (!saveBusinessProfileToFirestore) return;
    setSavingCompany(true);
    try {
      const result = await saveBusinessProfileToFirestore();
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(
        result.mode === "updated" ? "Empresa actualizada" : "Empresa guardada",
      );
      const list = await fetchSavedBuilderCompanies();
      if (list.ok) setSavedCompanies(list.companies);
    } finally {
      setSavingCompany(false);
    }
  }, [saveBusinessProfileToFirestore]);

  return (
    <div className="space-y-4">
      <div className="space-y-3 rounded-lg border border-border bg-muted/20 p-3">
        <p className="text-sm font-medium">Empresas guardadas</p>
        {editingSavedCompanyId && editingLabel ? (
          <p className="text-xs font-medium text-foreground">
            Editando: {editingLabel}
          </p>
        ) : null}
        <p className="text-xs text-muted-foreground">
          Carga un perfil ya guardado o guarda el negocio actual. También se guarda automáticamente al
          pulsar Siguiente si los datos cambiaron.
        </p>
        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
          <DropdownMenu open={savedMenuOpen} onOpenChange={setSavedMenuOpen}>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                variant="outline"
                className="h-10 w-full justify-between gap-2 sm:w-[min(100%,20rem)]"
                disabled={savedLoading}
              >
                {savedLoading ? (
                  <>
                    <Loader2Icon className="size-4 animate-spin" />
                    Cargando…
                  </>
                ) : (
                  <>
                    Buscar y cargar empresa
                    <ChevronDownIcon className="size-4 opacity-60" />
                  </>
                )}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              className="w-[min(calc(100vw-2rem),22rem)] p-0"
              align="start"
              onCloseAutoFocus={(e) => e.preventDefault()}
            >
              <div className="border-b border-border p-2">
                <Input
                  placeholder="Filtrar por nombre o descripción…"
                  value={savedSearch}
                  onChange={(e) => setSavedSearch(e.target.value)}
                  className="h-9"
                  onKeyDown={(e) => e.stopPropagation()}
                />
              </div>
              <div className="max-h-64 overflow-y-auto p-1">
                {filteredSavedCompanies.length === 0 ? (
                  <p className="px-2 py-3 text-center text-sm text-muted-foreground">
                    {savedCompanies.length === 0
                      ? "Aún no hay empresas guardadas."
                      : "Sin coincidencias."}
                  </p>
                ) : (
                  filteredSavedCompanies.map((c) => {
                    const desc = (c.payload.description ?? "").trim();
                    return (
                      <button
                        key={c.id}
                        type="button"
                        className="w-full rounded-md px-2 py-2 text-left hover:bg-accent/50"
                        onClick={() => applySavedCompany(c)}
                      >
                        <span className="block font-medium leading-tight">{c.name}</span>
                        {desc ? (
                          <span className="mt-0.5 line-clamp-2 block text-xs text-muted-foreground">
                            {desc}
                          </span>
                        ) : null}
                      </button>
                    );
                  })
                )}
              </div>
            </DropdownMenuContent>
          </DropdownMenu>
          <Button
            type="button"
            variant="secondary"
            className="h-10 w-full sm:w-auto"
            disabled={savedLoading || savingCompany}
            onClick={() => void handleSaveCompanyProfile()}
          >
            {savingCompany ? (
              <Loader2Icon className="mr-2 size-4 animate-spin" />
            ) : null}
            {editingSavedCompanyId ? "Actualizar empresa" : "Guardar empresa actual"}
          </Button>
          {editingSavedCompanyId ? (
            <Button
              type="button"
              variant="ghost"
              className="h-10 w-full text-muted-foreground sm:w-auto"
              disabled={savedLoading || savingCompany}
              onClick={() => onEditingSavedCompanyIdChange?.(null)}
            >
              Guardar como nuevo
            </Button>
          ) : null}
        </div>
      </div>

      <div>
        <label className="text-sm font-medium">
          Nombre del negocio <span className="text-destructive">*</span>
        </label>
        <input
          type="text"
          value={state.business_name}
          onChange={(e) => onChange({ business_name: e.target.value })}
          placeholder="Ej: Tienda de Ropa Moda Elegante"
          className="mt-1 flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
        />
      </div>
      <div>
        <label className="text-sm font-medium">
          Responsable <span className="text-destructive">*</span>
        </label>
        <input
          type="text"
          value={state.owner_name}
          readOnly
          className="mt-1 flex h-10 w-full rounded-md border border-input bg-muted px-3 py-2 text-sm text-muted-foreground"
        />
      </div>
      <div>
        <label className="text-sm font-medium">
          Industria <span className="text-destructive">*</span>
        </label>
        <select
          value={state.industry}
          onChange={(e) => onChange({ industry: e.target.value })}
          className="mt-1 flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
        >
          <option value="">Selecciona una industria</option>
          <option value="Retail">Retail / Tienda</option>
          <option value="Restaurantes">Restaurantes</option>
          <option value="Servicios">Servicios</option>
          <option value="Tecnología">Tecnología</option>
          <option value="Salud">Salud</option>
          <option value="Educación">Educación</option>
          <option value="Finanzas">Finanzas</option>
          <option value="Inmobiliaria">Inmobiliaria</option>
          <option value="Otro">Otro</option>
        </select>
        {state.industry === "Otro" && (
          <div className="mt-2">
            <input
              type="text"
              value={state.custom_industry}
              onChange={(e) => onChange({ custom_industry: e.target.value })}
              placeholder="Especifica tu industria"
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            />
          </div>
        )}
      </div>

      <div>
        <label className="text-sm font-medium">
          Descripción del negocio <span className="text-destructive">*</span>
        </label>
        <textarea
          value={state.description}
          onChange={(e) => onChange({ description: e.target.value })}
          placeholder="¿Qué problema principal resuelve tu negocio? ¿Qué productos o servicios ofreces?"
          rows={3}
          className="mt-1 flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
        />
      </div>

      <div>
        <label className="text-sm font-medium">
          Audiencia objetivo <span className="text-destructive">*</span>
        </label>
        <textarea
          value={state.target_audience}
          onChange={(e) => onChange({ target_audience: e.target.value })}
          placeholder="¿Quiénes son tus clientes ideales? ¿Qué edad tienen? ¿Cuáles son sus principales necesidades?"
          rows={3}
          className="mt-1 flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
        />
      </div>

      <div>
        <label className="text-sm font-medium">
          Rol del agente <span className="text-destructive">*</span>
        </label>
        <textarea
          value={state.agent_description}
          onChange={(e) => onChange({ agent_description: e.target.value })}
          placeholder="¿Cómo debería comportarse el agente? ¿Cuál es su objetivo principal?"
          rows={3}
          className="mt-1 flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
        />
      </div>

      <div>
        <label className="text-sm font-medium">
          Reglas de escalamiento <span className="text-destructive">*</span>
        </label>
        <p className="mt-1 text-xs text-muted-foreground">
          Añade una fila por situación (transferir a humano, temas sensibles, etc.). Se guardan como texto
          separado por líneas.
        </p>
        <EscalationRulesInput
          value={state.escalation_rules}
          onChange={(escalation_rules) => onChange({ escalation_rules })}
        />
      </div>

      <div>
        <label className="text-sm font-medium">
          País <span className="text-destructive">*</span>
        </label>
        <select
          value={state.country}
          onChange={(e) => onChange({ country: e.target.value })}
          className="mt-1 flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
        >
          <option value="">Selecciona un país</option>
          <option value="MX">México</option>
          <option value="CO">Colombia</option>
          <option value="AR">Argentina</option>
          <option value="CL">Chile</option>
          <option value="PE">Perú</option>
          <option value="US">Estados Unidos</option>
          <option value="ES">España</option>
        </select>
      </div>

      <div>
        <label className="text-sm font-medium">Zona horaria</label>
        <select
          value={state.business_timezone}
          onChange={(e) => onChange({ business_timezone: e.target.value })}
          className="mt-1 flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
        >
          <option value="">Selecciona zona horaria</option>
          {state.country === "MX" && <option value="America/Mexico_City">Ciudad de México (GMT-6)</option>}
          {state.country === "CO" && <option value="America/Bogota">Bogotá (GMT-5)</option>}
          {state.country === "AR" && <option value="America/Argentina/Buenos_Aires">Buenos Aires (GMT-3)</option>}
          {state.country === "CL" && <option value="America/Santiago">Santiago (GMT-4)</option>}
          {state.country === "PE" && <option value="America/Lima">Lima (GMT-5)</option>}
          {state.country === "US" && <option value="America/New_York">Nueva York (GMT-5)</option>}
          {state.country === "ES" && <option value="Europe/Madrid">Madrid (GMT+1)</option>}
        </select>
      </div>

      <div>
        <label className="text-sm font-medium">Valores de marca</label>
        <StringListInput
          value={state.brandValues}
          onChange={(v) => onChange({ brandValues: v })}
          placeholder="Ej: calidad, innovación"
        />
      </div>

      <div>
        <label className="text-sm font-medium">Políticas internas</label>
        <textarea
          value={state.policies}
          onChange={(e) => onChange({ policies: e.target.value })}
          placeholder="Ej: Política de devoluciones: 30 días. Garantía: 1 año."
          rows={3}
          className="mt-1 flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
        />
      </div>
    </div>
  );
}

function sectionTitle(id: FormSectionId): string {
  return FORM_SECTIONS.find((s) => s.id === id)?.title ?? id;
}

const FLOW_SELECT_OTRO = "\nOtro:";
const FLOW_SUGGEST_EXTRA_SEP = " | ";

function parseFlowSelectValue(value: string, options: string[]) {
  const i = value.indexOf(FLOW_SELECT_OTRO);
  if (i >= 0) {
    const main = value.slice(0, i).trim();
    const rest = value.slice(i + FLOW_SELECT_OTRO.length).trim();
    if (options.includes(main)) return { main, other: rest };
    return { main: "", other: value.trim() };
  }
  const t = value.trim();
  if (options.includes(t)) return { main: t, other: "" };
  return { main: "", other: t };
}

function composeFlowSelect(main: string, other: string) {
  const o = other.trim();
  if (!main && !o) return "";
  if (main && o) return `${main}${FLOW_SELECT_OTRO}${o}`;
  if (main) return main;
  return o;
}

function parseFlowSuggestionsMulti(value: string, suggestions: string[]) {
  const idx = value.indexOf(FLOW_SUGGEST_EXTRA_SEP);
  const head = (idx < 0 ? value : value.slice(0, idx)).trim();
  const extra = idx < 0 ? "" : value.slice(idx + FLOW_SUGGEST_EXTRA_SEP.length).trim();
  const tokens = head ? head.split(";").map((s) => s.trim()).filter(Boolean) : [];
  const picked = tokens.filter((t) => suggestions.includes(t));
  const stray = tokens.filter((t) => !suggestions.includes(t));
  const mergedExtra = [stray.join("; "), extra].filter(Boolean).join("; ").trim();
  return { picked: new Set(picked), extra: mergedExtra };
}

function composeFlowSuggestionsMulti(picked: Set<string>, extra: string) {
  const chips = [...picked].join("; ");
  const e = extra.trim();
  if (chips && e) return `${chips}${FLOW_SUGGEST_EXTRA_SEP}${e}`;
  if (chips) return chips;
  return e;
}

function parseFlowSuggestionsSingle(value: string, suggestions: string[]) {
  const idx = value.indexOf(FLOW_SUGGEST_EXTRA_SEP);
  const head = (idx < 0 ? value : value.slice(0, idx)).trim();
  const extra = idx < 0 ? "" : value.slice(idx + FLOW_SUGGEST_EXTRA_SEP.length).trim();
  if (suggestions.includes(head)) return { picked: head, extra };
  return { picked: "", extra: value.trim() };
}

function composeFlowSuggestionsSingle(picked: string, extra: string) {
  const e = extra.trim();
  if (picked && e) return `${picked}${FLOW_SUGGEST_EXTRA_SEP}${e}`;
  return picked || e;
}

function FlowSelectChips({
  options,
  value,
  onChange,
  disabled,
}: {
  options: string[];
  value: string;
  onChange: (v: string) => void;
  disabled: boolean;
}) {
  const { main, other } = parseFlowSelectValue(value, options);
  return (
    <div className="mt-1 space-y-3">
      <p className="text-xs text-muted-foreground">
        Elige una opción (puedes pulsar un ejemplo). Opcional: detalle u otra respuesta abajo.
      </p>
      <div className="flex flex-wrap gap-2">
        {options.map((opt) => (
          <button
            key={opt}
            type="button"
            disabled={disabled}
            onClick={() =>
              onChange(composeFlowSelect(main === opt ? "" : opt, other))
            }
            className={cn(
              "rounded-full border px-3 py-1.5 text-left text-sm transition-colors",
              main === opt
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border bg-background hover:bg-muted/80",
            )}
          >
            {opt}
          </button>
        ))}
      </div>
      <div>
        <label className="text-xs font-medium text-muted-foreground">Otro / aclarar</label>
        <textarea
          value={other}
          onChange={(e) => onChange(composeFlowSelect(main, e.target.value))}
          disabled={disabled}
          rows={2}
          placeholder="Texto libre si ninguna opción encaja del todo…"
          className="mt-1 flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
        />
      </div>
    </div>
  );
}

function FlowSuggestionsMulti({
  suggestions,
  value,
  onChange,
  disabled,
  rows,
}: {
  suggestions: string[];
  value: string;
  onChange: (v: string) => void;
  disabled: boolean;
  rows: number;
}) {
  const { picked, extra } = useMemo(
    () => parseFlowSuggestionsMulti(value, suggestions),
    [value, suggestions],
  );
  const toggle = (label: string) => {
    const next = new Set(picked);
    if (next.has(label)) next.delete(label);
    else next.add(label);
    onChange(composeFlowSuggestionsMulti(next, extra));
  };
  return (
    <div className="mt-1 space-y-3">
      <p className="text-xs text-muted-foreground">
        Puedes elegir varias respuestas ejemplo. Añade detalle u otra información abajo.
      </p>
      <div className="flex flex-wrap gap-2">
        {suggestions.map((s) => (
          <button
            key={s}
            type="button"
            disabled={disabled}
            onClick={() => toggle(s)}
            className={cn(
              "rounded-full border px-3 py-1.5 text-left text-sm transition-colors",
              picked.has(s)
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border bg-background hover:bg-muted/80",
            )}
          >
            {s}
          </button>
        ))}
      </div>
      <textarea
        value={extra}
        onChange={(e) => onChange(composeFlowSuggestionsMulti(picked, e.target.value))}
        disabled={disabled}
        rows={rows}
        placeholder="Otro contexto o detalle adicional…"
        className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
      />
    </div>
  );
}

function FlowSuggestionsSingle({
  suggestions,
  value,
  onChange,
  disabled,
  rows,
}: {
  suggestions: string[];
  value: string;
  onChange: (v: string) => void;
  disabled: boolean;
  rows: number;
}) {
  const { picked, extra } = useMemo(
    () => parseFlowSuggestionsSingle(value, suggestions),
    [value, suggestions],
  );
  return (
    <div className="mt-1 space-y-3">
      <p className="text-xs text-muted-foreground">
        Una respuesta ejemplo, o escribe en &quot;Otro&quot; abajo.
      </p>
      <div className="flex flex-wrap gap-2">
        {suggestions.map((s) => (
          <button
            key={s}
            type="button"
            disabled={disabled}
            onClick={() =>
              onChange(composeFlowSuggestionsSingle(picked === s ? "" : s, extra))
            }
            className={cn(
              "rounded-full border px-3 py-1.5 text-left text-sm transition-colors",
              picked === s
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border bg-background hover:bg-muted/80",
            )}
          >
            {s}
          </button>
        ))}
      </div>
      <textarea
        value={extra}
        onChange={(e) =>
          onChange(composeFlowSuggestionsSingle(picked, e.target.value))
        }
        disabled={disabled}
        rows={rows}
        placeholder="Otro / complementar la respuesta…"
        className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
      />
    </div>
  );
}

function FlowQuestionField({
  q,
  value,
  onChange,
  disabled,
}: {
  q: AgentFlowQuestion;
  value: string;
  onChange: (v: string) => void;
  disabled: boolean;
}) {
  if (q.type === "select" && q.options?.length) {
    return (
      <FlowSelectChips
        options={q.options}
        value={value}
        onChange={onChange}
        disabled={disabled}
      />
    );
  }
  if (
    (q.type === "text" || q.type === "textarea") &&
    q.suggestions?.length
  ) {
    const mode =
      q.suggestion_mode ?? (q.type === "textarea" ? "multi" : "single");
    const rows = q.type === "textarea" ? 3 : 2;
    return mode === "multi" ? (
      <FlowSuggestionsMulti
        suggestions={q.suggestions}
        value={value}
        onChange={onChange}
        disabled={disabled}
        rows={rows}
      />
    ) : (
      <FlowSuggestionsSingle
        suggestions={q.suggestions}
        value={value}
        onChange={onChange}
        disabled={disabled}
        rows={rows}
      />
    );
  }
  if (q.type === "textarea") {
    return (
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={q.placeholder}
        rows={3}
        disabled={disabled}
        className="mt-1 flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
      />
    );
  }
  return (
    <input
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={q.placeholder}
      disabled={disabled}
      className="mt-1 flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
    />
  );
}

type SectionFlowsProps = SectionProps & {
  coreComplete: boolean;
  firstCoreIncomplete: FormSectionId | null;
  onGoToSection: (id: FormSectionId) => void;
  flowQuestionsLoading: boolean;
  flowQuestionsError: string | null;
  onRetryFlowQuestions: () => void;
  onRegenerateFlowQuestions: () => void;
};

function SectionFlows({
  state,
  onChange,
  isSaving,
  coreComplete,
  firstCoreIncomplete,
  onGoToSection,
  flowQuestionsLoading,
  flowQuestionsError,
  onRetryFlowQuestions,
  onRegenerateFlowQuestions,
}: SectionFlowsProps) {
  const setAnswer = useCallback(
    (field: string, value: string) => {
      onChange({
        flow_answers: { ...state.flow_answers, [field]: value },
      });
    },
    [onChange, state.flow_answers],
  );

  if (!coreComplete) {
    return (
      <div className="space-y-4 rounded-lg border border-amber-500/40 bg-amber-500/5 p-4">
        <p className="text-sm font-medium text-amber-900 dark:text-amber-100">
          Para generar preguntas sobre cómo trabajará tu asistente, completa primero los pasos
          anteriores.
        </p>
        {firstCoreIncomplete ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => onGoToSection(firstCoreIncomplete)}
          >
            Ir a {sectionTitle(firstCoreIncomplete)}
          </Button>
        ) : null}
      </div>
    );
  }

  if (flowQuestionsLoading && state.flow_questions.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-12 text-sm text-muted-foreground">
        <Loader2Icon className="size-8 animate-spin" />
        <p>Preparando preguntas adaptadas a tu negocio…</p>
      </div>
    );
  }

  if (flowQuestionsError && state.flow_questions.length === 0) {
    return (
      <div className="space-y-4">
        <div className="rounded-md border border-destructive/50 bg-destructive/5 p-3 text-sm text-destructive">
          {flowQuestionsError}
        </div>
        <Button type="button" variant="outline" size="sm" onClick={onRetryFlowQuestions}>
          Reintentar
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <p className="text-sm text-muted-foreground">
        Son unas preguntas cortas, en lenguaje sencillo, pensadas para tu tipo de negocio. Tus
        respuestas ayudan a elegir las mejores funciones para el asistente.
      </p>

      {state.flow_questions.map((q: AgentFlowQuestion) => (
        <div key={q.field}>
          <label className="text-sm font-medium">
            {q.label}
            {q.required !== false ? (
              <span className="text-destructive ml-1">*</span>
            ) : null}
          </label>
          <FlowQuestionField
            q={q}
            value={state.flow_answers[q.field] ?? ""}
            onChange={(v) => setAnswer(q.field, v)}
            disabled={isSaving || flowQuestionsLoading}
          />
        </div>
      ))}

      <div className="flex flex-wrap gap-2 border-t pt-4">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={onRegenerateFlowQuestions}
          disabled={isSaving || flowQuestionsLoading}
        >
          {flowQuestionsLoading ? (
            <>
              <Loader2Icon className="mr-2 size-4 animate-spin" />
              Generando…
            </>
          ) : (
            "Generar otras preguntas"
          )}
        </Button>
        <p className="w-full text-xs text-muted-foreground">
          Si cambias de idea, puedes regenerar; se borrarán las respuestas actuales y obtendrás un
          nuevo cuestionario.
        </p>
      </div>
    </div>
  );
}

type SectionToolsProps = SectionProps & {
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

function SectionTools({
  state,
  onChange: _onChange,
  catalog,
  isSaving,
  prerequisitesMet,
  firstBlockedSection,
  onGoToSection,
  recommendLoading,
  recommendError,
  onRegenerateTools,
  toolsRationale,
  toolsWarnings,
  toolReasonById,
  operationalSummary,
}: SectionToolsProps) {
  const mandatoryToolNames = new Set<string>(AGENT_BUILDER_MANDATORY_TOOL_NAMES);
  const canRemove = (toolId: string) => {
    const tool = catalog.find((t) => t.id === toolId);
    const toolName = tool?.name || "";
    return !mandatoryToolNames.has(toolName);
  };

  const confirmRemoveTool = (toolId: string) => {
    _onChange({ selected_tools: state.selected_tools.filter((id) => id !== toolId) });
  };

  if (!prerequisitesMet) {
    return (
      <div className="space-y-4 rounded-lg border border-amber-500/40 bg-amber-500/5 p-4">
        <p className="text-sm font-medium text-amber-900 dark:text-amber-100">
          Para recomendar herramientas con IA, completa primero los pasos anteriores.
        </p>
        <p className="text-sm text-muted-foreground">
          Faltan datos en:{" "}
          {firstBlockedSection ? sectionTitle(firstBlockedSection) : "pasos previos"}.
        </p>
        {firstBlockedSection ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => onGoToSection(firstBlockedSection)}
          >
            Ir a {sectionTitle(firstBlockedSection)}
          </Button>
        ) : null}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <p className="text-sm text-muted-foreground">
        Usamos lo que contaste en <strong>Flujos</strong> más tu negocio y personalidad. Puedes
        regenerar la lista si cambias algo en pasos anteriores.
      </p>

      {operationalSummary.trim() ? (
        <div className="rounded-lg border bg-muted/20 p-3 text-xs text-muted-foreground">
          <p className="mb-1 font-medium text-foreground">Resumen de lo que nos contaste en Flujos</p>
          <pre className="max-h-40 overflow-y-auto whitespace-pre-wrap font-sans">
            {operationalSummary}
          </pre>
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={onRegenerateTools}
          disabled={isSaving || recommendLoading || catalog.length === 0}
        >
          {recommendLoading ? (
            <>
              <Loader2Icon className="mr-2 size-4 animate-spin" />
              Generando…
            </>
          ) : (
            "Regenerar recomendación"
          )}
        </Button>
      </div>

      {recommendError ? (
        <div className="rounded-md border border-destructive/50 bg-destructive/5 p-3 text-sm text-destructive">
          {recommendError}
        </div>
      ) : null}

      {toolsWarnings.length > 0 ? (
        <div className="rounded-md border border-amber-500/40 bg-amber-500/5 p-3 text-sm text-amber-900 dark:text-amber-100">
          <p className="font-medium">Avisos</p>
          <ul className="mt-1 list-inside list-disc">
            {toolsWarnings.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {toolsRationale ? (
        <div className="rounded-lg border bg-muted/30 p-3 text-sm">
          <p className="font-medium text-foreground">Resumen</p>
          <p className="mt-1 text-muted-foreground">{toolsRationale}</p>
        </div>
      ) : null}

      {recommendLoading && state.selected_tools.length === 0 ? (
        <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
          <Loader2Icon className="size-5 animate-spin" />
          Generando herramientas recomendadas…
        </div>
      ) : null}

      {state.selected_tools.length > 0 ? (
        <div className="space-y-2">
          <p className="text-sm font-medium">
            Herramientas propuestas ({state.selected_tools.length})
          </p>
          <div className="max-h-[360px] space-y-2 overflow-y-auto">
            {state.selected_tools.map((toolId) => {
              const tool = catalog.find((t) => t.id === toolId);
              const reason = toolReasonById[toolId];
              return (
                <div
                  key={toolId}
                  className="flex items-start justify-between gap-2 rounded-lg border border-border bg-card p-3 text-sm"
                >
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">
                      {tool?.displayName || tool?.name || toolId}
                    </p>
                    {reason ? (
                      <p className="mt-1 text-muted-foreground">{reason}</p>
                    ) : tool?.description ? (
                      <p className="mt-1 text-muted-foreground">{tool.description}</p>
                    ) : null}
                  </div>
                  {canRemove(toolId) ? (
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <button
                          type="button"
                          className="shrink-0 rounded-md p-1 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                          aria-label={`Eliminar ${tool?.displayName || tool?.name || toolId}`}
                        >
                          <XIcon className="size-4" />
                        </button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>¿Eliminar herramienta?</AlertDialogTitle>
                          <AlertDialogDescription>
                            ¿Estás seguro de que quieres eliminar &quot;{tool?.displayName || tool?.name || toolId}&quot;?
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancelar</AlertDialogCancel>
                          <AlertDialogAction onClick={() => confirmRemoveTool(toolId)}>Eliminar</AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  ) : (
                    <button
                      type="button"
                      disabled
                      className="shrink-0 rounded-md p-1 text-muted-foreground/50 cursor-not-allowed"
                      aria-label={`${tool?.displayName || tool?.name || toolId} no se puede eliminar`}
                    >
                      <XIcon className="size-4" />
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ) : !recommendLoading ? (
        <p className="text-sm text-muted-foreground">
          Aún no hay herramientas. Pulsa &quot;Regenerar recomendación&quot; o espera a que se
          genere automáticamente.
        </p>
      ) : null}
    </div>
  );
}

function SectionPersonality({ state, onChange, isSaving }: SectionProps) {
  const [showPresetConfirm, setShowPresetConfirm] = useState<string | null>(null);

  const applyPreset = useCallback(
    (presetId: string) => {
      const preset = PERSONALITY_PRESETS.find((p) => p.id === presetId);
      if (preset) {
        onChange({
          agent_personality: preset.agent_personality,
          use_emojis: preset.use_emojis,
          personality_traits: preset.traits,
        });
        toast.success(`Preset "${preset.label}" aplicado`);
      }
    },
    [onChange]
  );

  return (
    <div className="space-y-6">
      <div>
        <p className="mb-3 text-sm font-medium">¿Quieres empezar con un preset?</p>
        <div className="grid grid-cols-2 gap-2">
          {PERSONALITY_PRESETS.map((preset) => (
            <button
              key={preset.id}
              type="button"
              onClick={() => applyPreset(preset.id)}
              disabled={isSaving}
              className="flex items-start gap-2 rounded-lg border border-border p-3 text-left transition-colors hover:bg-muted/50"
            >
              <span className="text-xl">{preset.icon}</span>
              <div>
                <p className="font-medium">{preset.label}</p>
                <p className="text-xs text-muted-foreground">{preset.description}</p>
              </div>
            </button>
          ))}
        </div>
      </div>

      <div className="border-t pt-4">
        <div>
          <label className="text-sm font-medium">
            Nombre del agente <span className="text-destructive">*</span>
          </label>
          <input
            type="text"
            value={state.agent_name}
            onChange={(e) => onChange({ agent_name: e.target.value })}
            placeholder="Ej: Asistente de Tienda Moda"
            className="mt-1 flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          />
        </div>
      </div>

      <div>
        <label className="text-sm font-medium">
          Personalidad <span className="text-destructive">*</span>
        </label>
        <textarea
          value={state.agent_personality}
          onChange={(e) => onChange({ agent_personality: e.target.value })}
          placeholder="Describe cómo quieres que se comporte tu agente. Ej: Soy un asesor amigable y profesional que ayuda a los clientes a encontrar los productos perfectos..."
          rows={4}
          className="mt-1 flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
        />
      </div>

      <div>
        <label className="text-sm font-medium">Rasgos de personalidad</label>
        <div className="mt-2 flex flex-wrap gap-2">
          {[
            { id: "friendly", label: "Amigable", emoji: "😄" },
            { id: "professional", label: "Profesional", emoji: "💼" },
            { id: "humorous", label: "Con humor", emoji: "😄" },
            { id: "empathetic", label: "Empático", emoji: "🤝" },
            { id: "direct", label: "Directo", emoji: "🎯" },
            { id: "close", label: "Cercano", emoji: "👋" },
            { id: "patient", label: "Paciente", emoji: "⏰" },
            { id: "proactive", label: "Proactivo", emoji: "💡" },
            { id: "technical", label: "Técnico", emoji: "🔧" },
          ].map((trait) => (
            <button
              key={trait.id}
              type="button"
              onClick={() => {
                const newTraits = state.personality_traits.includes(trait.id as PersonalityTrait)
                  ? state.personality_traits.filter((t) => t !== trait.id)
                  : [...state.personality_traits, trait.id as PersonalityTrait];
                onChange({ personality_traits: newTraits });
              }}
              className={cn(
                "flex items-center gap-1 rounded-full border px-3 py-1 text-sm transition-colors",
                state.personality_traits.includes(trait.id as PersonalityTrait)
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-background hover:bg-muted"
              )}
            >
              <span>{trait.emoji}</span>
              <span>{trait.label}</span>
            </button>
          ))}
        </div>
      </div>

      <div>
        <label className="text-sm font-medium">
          Idioma <span className="text-destructive">*</span>
        </label>
        <select
          value={state.response_language}
          onChange={(e) => onChange({ response_language: e.target.value })}
          className="mt-1 flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
        >
          <option value="Spanish">Español</option>
          <option value="English">Inglés</option>
          <option value="Portuguese">Portugués</option>
        </select>
      </div>

      <div>
        <label className="text-sm font-medium">
          Uso de emojis <span className="text-destructive">*</span>
        </label>
        <div className="mt-2 flex gap-2">
          {(["never", "moderate", "always"] as const).map((pref) => (
            <button
              key={pref}
              type="button"
              onClick={() => onChange({ use_emojis: pref })}
              className={cn(
                "flex-1 rounded-lg border py-2 text-sm transition-colors",
                state.use_emojis === pref
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border hover:bg-muted"
              )}
            >
              {pref === "never" ? "Nunca" : pref === "moderate" ? "Moderados" : "Siempre"}
            </button>
          ))}
        </div>
      </div>

      <div>
        <label className="text-sm font-medium">Acento / Dialecto</label>
        <select
          value={state.country_accent}
          onChange={(e) => onChange({ country_accent: e.target.value })}
          className="mt-1 flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
        >
          <option value="">Selecciona un acento</option>
          <option value="Español de México">Español de México</option>
          <option value="Español de España">Español de España</option>
          <option value="Español de Colombia">Español de Colombia</option>
          <option value="Español de Argentina">Español de Argentina</option>
          <option value="Español de Chile">Español de Chile</option>
        </select>
      </div>

      <div>
        <label className="text-sm font-medium">Firma / Despedida</label>
        <input
          type="text"
          value={state.agent_signature}
          onChange={(e) => onChange({ agent_signature: e.target.value })}
          placeholder="Ej: ¡Saludos! Que tengas un excelente día."
          className="mt-1 flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
        />
      </div>

      <div>
        <label className="text-sm font-medium">
          Tono de voz <span className="text-destructive">*</span>
        </label>
        <select
          value={state.tone}
          onChange={(e) => onChange({ tone: e.target.value as "formal" | "casual" | "professional" | "friendly" })}
          className="mt-1 flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
        >
          <option value="friendly">Amigable</option>
          <option value="professional">Profesional</option>
          <option value="formal">Formal</option>
          <option value="casual">Casual</option>
        </select>
      </div>

      <div>
        <label className="text-sm font-medium">Mensaje de saludo</label>
        <input
          type="text"
          value={state.greetingMessage}
          onChange={(e) => onChange({ greetingMessage: e.target.value })}
          placeholder="Ej: ¡Hola! Bienvenido a nuestra tienda. ¿En qué puedo ayudarte?"
          className="mt-1 flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
        />
      </div>

      <div>
        <label className="text-sm font-medium">Longitud de respuestas</label>
        <select
          value={state.responseLength}
          onChange={(e) => onChange({ responseLength: e.target.value as "short" | "medium" | "long" })}
          className="mt-1 flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
        >
          <option value="short">Cortas</option>
          <option value="medium">Medias</option>
          <option value="long">Largas</option>
        </select>
      </div>

      <div>
        <label className="text-sm font-medium">Frases obligatorias</label>
        <StringListInput
          value={state.requiredPhrases}
          onChange={(v) => onChange({ requiredPhrases: v })}
          placeholder="Ej: ¡Con mucho gusto!"
        />
      </div>

      <div>
        <label className="text-sm font-medium">Temas a evitar</label>
        <StringListInput
          value={state.topicsToAvoid}
          onChange={(v) => onChange({ topicsToAvoid: v })}
          placeholder="Ej: política"
        />
      </div>

      <div>
        <label className="text-sm font-medium">Estilo conversacional</label>
        <select
          value={state.conversationStyle}
          onChange={(e) => onChange({ conversationStyle: e.target.value as "interrogative" | "informative" })}
          className="mt-1 flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
        >
          <option value="informative">Informativo (da respuestas directas)</option>
          <option value="interrogative">Interrogativo (hace preguntas para entender mejor)</option>
        </select>
      </div>
    </div>
  );
}

function SectionAdvanced({ state, onChange }: SectionProps) {
  return (
    <div className="space-y-6">
      <div>
        <label className="text-sm font-medium">Horario de atención</label>
        <select
          value={state.business_hours}
          onChange={(e) => onChange({ business_hours: e.target.value })}
          className="mt-1 flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
        >
          <option value="">Selecciona horario</option>
          <option value="L-V 9-18">Lunes a viernes 9am-6pm</option>
          <option value="L-V 8-17">Lunes a viernes 8am-5pm</option>
          <option value="L-V 10-19">Lunes a viernes 10am-7pm</option>
          <option value="L-S 9-18">Lunes a sábado 9am-6pm</option>
          <option value="24/7">24/7</option>
          <option value="custom">Personalizado</option>
        </select>
      </div>

      <div>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={state.require_auth}
            onChange={(e) => onChange({ require_auth: e.target.checked })}
            className="size-4"
          />
          <span className="text-sm font-medium">Requiere autenticación</span>
        </label>
        <p className="mt-1 text-xs text-muted-foreground">
          Los usuarios deberán iniciar sesión para usar el agente
        </p>
      </div>
    </div>
  );
}

type SectionPipelinesProps = SectionProps;

function SectionPipelines({ state, onChange }: SectionPipelinesProps) {
  const pipelines = state.pipelines || [];

  const updatePipeline = useCallback(
    (pipelineIndex: number, updates: Partial<Pipeline>) => {
      const newPipelines = [...pipelines];
      newPipelines[pipelineIndex] = { ...newPipelines[pipelineIndex], ...updates };
      onChange({ pipelines: newPipelines });
    },
    [pipelines, onChange],
  );

  const updateStage = useCallback(
    (pipelineIndex: number, stageIndex: number, updates: Partial<Stage>) => {
      const newPipelines = [...pipelines];
      const stages = [...newPipelines[pipelineIndex].stages];
      stages[stageIndex] = { ...stages[stageIndex], ...updates };
      newPipelines[pipelineIndex] = { ...newPipelines[pipelineIndex], stages };
      onChange({ pipelines: newPipelines });
    },
    [pipelines, onChange],
  );

  if (pipelines.length === 0) {
    return (
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">
          No hay pipelines configurados. Se usará el pipeline predeterminado al crear el agente.
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
        <div key={pipeline.id || pipelineIndex} className="rounded-lg border p-4 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex-1 space-y-2">
              <input
                type="text"
                value={pipeline.name}
                onChange={(e) => updatePipeline(pipelineIndex, { name: e.target.value })}
                placeholder="Nombre del pipeline"
                className="font-medium text-lg bg-transparent border-none focus:outline-none focus:ring-2 focus:ring-ring rounded px-2 py-1 -ml-2 w-full"
              />
              <input
                type="text"
                value={pipeline.description || ""}
                onChange={(e) => updatePipeline(pipelineIndex, { description: e.target.value })}
                placeholder="Descripción opcional"
                className="text-sm text-muted-foreground bg-transparent border-none focus:outline-none w-full"
              />
            </div>
            <div className="flex items-center gap-2 ml-4">
              {pipeline.isDefault && (
                <span className="text-xs bg-primary/10 text-primary px-2 py-1 rounded">Default</span>
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
                          Tipo: {STAGE_TYPES.find((st) => st.value === stage.stageType)?.label || stage.stageType}
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

function SectionReview({ state, catalog, isSaving, onSubmit }: SectionProps & { onSubmit: () => void }) {
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
          <p className="mb-2 font-medium text-destructive">Para crear tu agente necesitas:</p>
          <ul className="space-y-1">
            {missingFields.map((field) => (
              <li key={field} className="flex items-center gap-2 text-sm text-destructive">
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
            <dd className="max-w-[200px] truncate">{state.description || "—"}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-muted-foreground">País:</dt>
            <dd>{state.country || "—"}</dd>
          </div>
        </dl>
      </div>

      <div className="rounded-lg border p-4">
        <p className="mb-3 font-medium">🔧 Herramientas ({state.selected_tools.length})</p>
        {state.selected_tools.length === 0 ? (
          <p className="text-sm text-muted-foreground">No hay herramientas seleccionadas</p>
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
      description: "Configuración completa para ventas, con gestión de clientes",
      icon: "🛒",
      industry: "Retail",
      personalityPreset: "sales",
    },
    {
      id: "support",
      label: "Soporte Técnico",
      description: "Ayuda a clientes con problemas técnicos",
      icon: "📞",
      industry: "Servicios",
      personalityPreset: "support",
    },
    {
      id: "admin",
      label: "Asistente Admin",
      description: "Gestión de citas, agenda y tareas",
      icon: "💼",
      industry: "Servicios",
      personalityPreset: "admin",
    },
    {
      id: "concierge",
      label: "Concierge",
      description: "Atención al cliente cálida y personalizada",
      icon: "🏨",
      industry: "Servicios",
      personalityPreset: "concierge",
    },
    {
      id: "custom",
      label: "Empezar desde cero",
      description: "Construye tu agente paso a paso",
      icon: "✨",
      industry: "",
      personalityPreset: null,
    },
  ];

  return (
    <div className="grid gap-3">
      {templates.map((template) => (
        <button
          key={template.id}
          type="button"
          onClick={() => {
            const preset = template.personalityPreset 
              ? PERSONALITY_PRESETS.find(p => p.id === template.personalityPreset)
              : null;
            
            if (template.id === "custom") {
              onChange({ industry: "" });
            } else {
              onChange({
                industry: template.industry || "Servicios",
                agent_description: `Soy un ${template.label.toLowerCase()} que ayuda a los clientes...`,
                agent_personality: preset?.agent_personality || "",
                use_emojis: preset?.use_emojis || "moderate",
                personality_traits: preset?.traits || [],
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
            <p className="text-sm text-muted-foreground">{template.description}</p>
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
  const [currentSection, setCurrentSection] = useState<FormSectionId>("templates");
  const [completedSections, setCompletedSections] = useState<Set<FormSectionId>>(new Set());
  const [catalog, setCatalog] = useState<ToolsCatalogItem[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [isLoadingCatalog, setIsLoadingCatalog] = useState(true);
  const [dynamicQuestions, setDynamicQuestions] = useState<DynamicQuestion[]>([]);
  const [dynamicAnswers, setDynamicAnswers] = useState<Record<string, string>>({});
  const [isAnalyzingAI, setIsAnalyzingAI] = useState(false);
  const [toolsRegenerateNonce, setToolsRegenerateNonce] = useState(0);
  const [toolsRecommendLoading, setToolsRecommendLoading] = useState(false);
  const [toolsRecommendError, setToolsRecommendError] = useState<string | null>(null);
  const [toolsRationale, setToolsRationale] = useState<string | null>(null);
  const [toolsWarnings, setToolsWarnings] = useState<string[]>([]);
  const [toolReasonById, setToolReasonById] = useState<Record<string, string>>({});
  const lastToolsSuccessHashRef = useRef<string | null>(null);
  const lastToolsRegenNonceRef = useRef(0);
  const [flowQuestionsLoading, setFlowQuestionsLoading] = useState(false);
  const [flowQuestionsError, setFlowQuestionsError] = useState<string | null>(null);
  const [flowQuestionsRegenNonce, setFlowQuestionsRegenNonce] = useState(0);
  const lastFlowSuccessHashRef = useRef<string | null>(null);
  const lastFlowRegenNonceRef = useRef(0);
  /** Evita POST duplicado al pulsar Siguiente si el payload del negocio no cambió. */
  const lastAutoSavedBusinessPayloadRef = useRef<string | null>(null);

  const [editingSavedCompanyId, setEditingSavedCompanyId] = useState<string | null>(
    null,
  );

  const onBusinessProfileSaved = useCallback((payload: BuilderCompanyPayload) => {
    lastAutoSavedBusinessPayloadRef.current = JSON.stringify(payload);
  }, []);

  const handleEditingSavedCompanyIdChange = useCallback((id: string | null) => {
    setEditingSavedCompanyId(id);
    if (id === null) {
      lastAutoSavedBusinessPayloadRef.current = null;
    }
  }, []);

  const saveBusinessProfileToFirestore = useCallback(async (): Promise<
    | { ok: true; mode: "created" | "updated" }
    | { ok: false; error: string }
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
      state.business_hours,
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
      state.business_hours,
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
        business_hours: state.business_hours,
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
    state.business_hours,
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
        business_hours: state.business_hours,
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
    state.business_hours,
    state.require_auth,
    JSON.stringify(state.flow_answers),
    JSON.stringify(state.flow_questions),
  ]);
  /* eslint-enable react-hooks/exhaustive-deps */

  const handleChange = useCallback((updates: Partial<FormBuilderState>) => {
    setState((prev) => ({ ...prev, ...updates }));
    setHasUnsavedChanges(true);
  }, []);

  const handleDynamicAnswerChange = useCallback((field: string, value: string) => {
    setDynamicAnswers((prev) => ({ ...prev, [field]: value }));
  }, []);

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
    if (section === "personality") return !!state.agent_personality || !!state.agent_name;
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
          if (state.industry === "Otro" && !state.custom_industry) errorMsg += "\n• Especifica tu industria";
          if (!state.description) errorMsg += "\n• Descripción del negocio";
          if (!state.target_audience) errorMsg += "\n• Audiencia objetivo";
          if (!state.agent_description) errorMsg += "\n• Rol del agente";
          if (!state.escalation_rules) errorMsg += "\n• Reglas de escalamiento";
          if (!state.country) errorMsg += "\n• País";
          break;
        case "personality":
          if (!state.agent_name) errorMsg += "\n• Nombre del agente";
          if (!state.agent_personality) errorMsg += "\n• Personalidad del agente";
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
        const questions = await analyzeAgentWithAI(currentSection, state as unknown as Record<string, unknown>);
        if (questions && questions.length > 0) {
          const relevantQuestions = questions.filter((q) => q.section === currentSection);
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
    advanceToNextSection();
  }, [
    currentSection,
    canProceed,
    state,
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
    const sections = FORM_SECTIONS.map((s) => s.id);
    const currentIndex = sections.indexOf(currentSection);
    if (currentIndex > 0) {
      setCurrentSection(sections[currentIndex - 1]);
    }
  }, [currentSection]);

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
        business_hours: state.business_hours.trim(),
        require_auth: state.require_auth,
        flow_answers: state.flow_answers,
        flow_questions: state.flow_questions,
        pipelines: state.pipelines as unknown as Array<Record<string, unknown>>,
        brand_values: state.brandValues,
        policies: state.policies.trim(),
        operating_hours: state.business_hours.trim(),
      });

      await patchAgentDraft(draftId, {
        step: "tools",
        selected_tools: state.selected_tools,
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

      toast.success("¡Agente creado exitosamente!");
      window.location.href = `/agents/${encodeURIComponent(draftId)}/prompt-design`;
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
        return <TemplatesSection onChange={handleChange} onNext={() => handleNext()} />;
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

  return (
    <div className="flex h-screen flex-col overflow-hidden">
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
                Si sales ahora, perderás el progreso no guardado. ¿Estás seguro de que quieres salir?
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction onClick={() => { setHasUnsavedChanges(false); window.location.href = "/"; }}>
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
                  : "bg-muted text-muted-foreground hover:bg-muted/80"
            )}
          >
            {ICONS[section.id]}
            <span className="hidden sm:inline">{section.title}</span>
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        <div className="mx-auto max-w-2xl pb-4">
          <div className="mb-6">
            <h2 className="text-xl font-semibold">{sections[currentIndex]?.title}</h2>
            <p className="text-sm text-muted-foreground">
              {sections[currentIndex]?.description}
            </p>
          </div>

          {isLoadingCatalog && currentSection === "tools" ? (
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
                          onChange={(e) => handleDynamicAnswerChange(question.field, e.target.value)}
                          className="mt-1 flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                        >
                          <option value="">Selecciona una opción</option>
                          {question.options.map((opt) => (
                            <option key={opt} value={opt}>{opt}</option>
                          ))}
                        </select>
                      ) : question.type === "textarea" ? (
                        <textarea
                          value={dynamicAnswers[question.field] || ""}
                          onChange={(e) => handleDynamicAnswerChange(question.field, e.target.value)}
                          placeholder={question.placeholder || "Escribe tu respuesta..."}
                          rows={3}
                          className="mt-1 flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                        />
                      ) : (
                        <input
                          type="text"
                          value={dynamicAnswers[question.field] || ""}
                          onChange={(e) => handleDynamicAnswerChange(question.field, e.target.value)}
                          placeholder={question.placeholder || "Escribe tu respuesta..."}
                          className="mt-1 flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                        />
                      )}
                    </div>
                  ))}
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={handleSkipDynamicQuestions}>
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

      {currentSection !== "templates" && currentSection !== "review" && dynamicQuestions.length === 0 && (
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
            onClick={handleNext}
            disabled={
              !canProceed(currentSection) ||
              isAnalyzingAI ||
              (currentSection === "flows" &&
                (flowQuestionsLoading ||
                  (state.flow_questions.length === 0 && !flowQuestionsError))) ||
              (currentSection === "tools" && toolsRecommendLoading)
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
