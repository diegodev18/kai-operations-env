"use client";

import { useCallback, useEffect, useState } from "react";
import {
  ArrowLeftIcon,
  ArrowRightIcon,
  CheckIcon,
  Loader2Icon,
  PlusIcon,
  XIcon,
  BuildingIcon,
  WrenchIcon,
  UserIcon,
  SettingsIcon,
  RocketIcon,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  postAgentDraft,
  patchAgentDraft,
  fetchToolsCatalog,
  analyzeAgentWithAI,
  type ToolsCatalogItem,
  type DynamicQuestion,
} from "@/lib/agents-api";
import { DEFAULT_FORM_STATE, FORM_SECTIONS, type FormBuilderState, type FormSectionId, type PersonalityTrait, type EmojiPreference, type AgentTemplate, PERSONALITY_PRESETS } from "@/lib/form-builder-constants";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/auth";

const ICONS: Record<string, React.ReactNode> = {
  templates: <RocketIcon className="size-5" />,
  basics: <BuildingIcon className="size-5" />,
  business: <BuildingIcon className="size-5" />,
  tools: <WrenchIcon className="size-5" />,
  personality: <UserIcon className="size-5" />,
  advanced: <SettingsIcon className="size-5" />,
  review: <CheckIcon className="size-5" />,
};

interface SectionProps {
  state: FormBuilderState;
  onChange: (updates: Partial<FormBuilderState>) => void;
  catalog: ToolsCatalogItem[];
  isSaving: boolean;
  userName?: string;
  onValidationError?: (section: string, error: string) => void;
}

function SectionBasics({ state, onChange, isSaving, userName }: SectionProps) {
  useEffect(() => {
    if (userName && !state.owner_name) {
      onChange({ owner_name: userName });
    }
  }, [userName, state.owner_name, onChange]);
  
  return (
    <div className="space-y-4">
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
    </div>
  );
}

function SectionBusiness({ state, onChange }: SectionProps) {
  const hasIndustry = !!state.industry;
  const hasAudience = !!state.target_audience;
  const hasRole = !!state.agent_description;
  const hasCountry = !!state.country;

  return (
    <div className="space-y-4">
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

      {hasIndustry && (
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
      )}

      {hasAudience && (
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
      )}

      {hasRole && (
        <div>
          <label className="text-sm font-medium">
            Reglas de escalamiento <span className="text-destructive">*</span>
          </label>
          <textarea
            value={state.escalation_rules}
            onChange={(e) => onChange({ escalation_rules: e.target.value })}
            placeholder="¿En qué situaciones debe transferir a un humano? ¿Qué hace el agente cuando no puede resolver un problema?"
            rows={3}
            className="mt-1 flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          />
        </div>
      )}

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

      {hasCountry && (
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
      )}

      {!hasIndustry && (
        <p className="text-sm text-muted-foreground">
          Completa la sección de Datos Básicos para ver más preguntas sobre tu negocio
        </p>
      )}
    </div>
  );
}

function SectionTools({ state, onChange, catalog, isSaving }: SectionProps) {
  const [search, setSearch] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);

  const filteredTools = catalog.filter((tool) => {
    const matchesSearch =
      !search ||
      tool.name.toLowerCase().includes(search.toLowerCase()) ||
      tool.displayName.toLowerCase().includes(search.toLowerCase()) ||
      tool.description.toLowerCase().includes(search.toLowerCase());
    const matchesCategory = !selectedCategory || tool.category === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  const toggleTool = useCallback(
    (toolId: string) => {
      const newTools = state.selected_tools.includes(toolId)
        ? state.selected_tools.filter((id) => id !== toolId)
        : [...state.selected_tools, toolId];
      onChange({ selected_tools: newTools });
    },
    [state.selected_tools, onChange]
  );

  const categories = [...new Set(catalog.map((t) => t.category).filter(Boolean))];

  return (
    <div className="space-y-4">
      <div>
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="🔍 ¿Qué necesita hacer tu agente? (ej: guardar clientes, enviar correos)"
          className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
        />
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setSelectedCategory(null)}
          className={cn(
            "rounded-full px-3 py-1 text-xs font-medium transition-colors",
            !selectedCategory
              ? "bg-primary text-primary-foreground"
              : "bg-muted text-muted-foreground hover:bg-muted/80"
          )}
        >
          Todas
        </button>
        {categories.map((cat) => (
          <button
            key={cat}
            type="button"
            onClick={() => setSelectedCategory(cat)}
            className={cn(
              "rounded-full px-3 py-1 text-xs font-medium transition-colors",
              selectedCategory === cat
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground hover:bg-muted/80"
            )}
          >
            {cat}
          </button>
        ))}
      </div>

      <div className="max-h-[300px] space-y-2 overflow-y-auto">
        {filteredTools.length === 0 ? (
          <p className="py-4 text-center text-sm text-muted-foreground">
            No se encontraron herramientas
          </p>
        ) : (
          filteredTools.map((tool) => (
            <div
              key={tool.id}
              className={cn(
                "flex items-center justify-between rounded-lg border p-3 transition-colors",
                state.selected_tools.includes(tool.id)
                  ? "border-primary bg-primary/5"
                  : "border-border hover:bg-muted/50"
              )}
            >
              <div className="flex-1">
                <p className="font-medium">{tool.displayName || tool.name}</p>
                <p className="text-sm text-muted-foreground">{tool.description}</p>
              </div>
              <Button
                type="button"
                size="sm"
                variant={state.selected_tools.includes(tool.id) ? "default" : "outline"}
                onClick={() => toggleTool(tool.id)}
                disabled={isSaving}
              >
                {state.selected_tools.includes(tool.id) ? (
                  <>
                    <CheckIcon className="mr-1 size-4" /> Agregado
                  </>
                ) : (
                  <>
                    <PlusIcon className="mr-1 size-4" /> Agregar
                  </>
                )}
              </Button>
            </div>
          ))
        )}
      </div>

      {state.selected_tools.length > 0 && (
        <div className="rounded-lg border bg-muted/30 p-3">
          <p className="mb-2 text-sm font-medium">
            Herramientas seleccionadas ({state.selected_tools.length}):
          </p>
          <div className="flex flex-wrap gap-2">
            {state.selected_tools.map((toolId) => {
              const tool = catalog.find((t) => t.id === toolId);
              return tool ? (
                <span
                  key={toolId}
                  className="flex items-center gap-1 rounded-full bg-primary/10 px-2 py-1 text-xs"
                >
                  {tool.displayName || tool.name}
                  <button
                    type="button"
                    onClick={() => toggleTool(toolId)}
                    className="ml-1 text-muted-foreground hover:text-destructive"
                  >
                    <XIcon className="size-3" />
                  </button>
                </span>
              ) : null;
            })}
          </div>
        </div>
      )}
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
  if (state.selected_tools.length === 0) missingFields.push("Seleccionar al menos 1 herramienta");
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
                <span key={toolId} className="rounded-full bg-muted px-2 py-1 text-xs">
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
  state,
  onChange,
  onNext,
}: {
  state: FormBuilderState;
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

  useEffect(() => {
    void (async () => {
      const tools = await fetchToolsCatalog();
      setCatalog(tools ?? []);
      setIsLoadingCatalog(false);
    })();
  }, []);

  const handleChange = useCallback((updates: Partial<FormBuilderState>) => {
    setState((prev) => ({ ...prev, ...updates }));
  }, []);

  const handleDynamicAnswerChange = useCallback((field: string, value: string) => {
    setDynamicAnswers((prev) => ({ ...prev, [field]: value }));
  }, []);

  const canProceed = useCallback(
    (section: FormSectionId): boolean => {
      switch (section) {
        case "basics":
          const industryValid = state.industry === "Otro" 
            ? !!state.custom_industry 
            : !!state.industry;
          return !!state.business_name && !!state.owner_name && industryValid;
        case "business":
          const businessValid = state.industry === "Otro" 
            ? !!state.custom_industry 
            : !!state.industry;
          return businessValid && !!state.description && !!state.target_audience && !!state.agent_description && !!state.escalation_rules && !!state.country;
        case "personality":
          return !!state.agent_name && !!state.agent_personality && !!state.response_language && !!state.use_emojis;
        case "tools":
          return state.selected_tools.length > 0;
        case "review":
          const reviewIndustryValid = state.industry === "Otro" 
            ? !!state.custom_industry 
            : !!state.industry;
          return (
            !!state.business_name &&
            reviewIndustryValid &&
            state.selected_tools.length > 0 &&
            !!state.agent_name
          );
        default:
          return true;
      }
    },
    [state]
  );

  const shouldAnalyzeWithAI = (section: FormSectionId): boolean => {
    if (section === "basics") return !!state.industry;
    if (section === "business") return !!state.description || !!state.target_audience || !!state.agent_description;
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
        case "basics":
          if (!state.business_name) errorMsg += "\n• Nombre del negocio";
          if (!state.industry) errorMsg += "\n• Industria";
          if (state.industry === "Otro" && !state.custom_industry) errorMsg += "\n• Especifica tu industria";
          break;
        case "business":
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
          break;
        case "tools":
          if (state.selected_tools.length === 0) errorMsg += "\n• Selecciona al menos una herramienta";
          break;
      }
      
      alert(errorMsg);
      return;
    }
    
    // Analyze with AI for dynamic questions
    if (shouldAnalyzeWithAI(currentSection)) {
      setIsAnalyzingAI(true);
      try {
        const questions = await analyzeAgentWithAI(currentSection, state as unknown as Record<string, unknown>);
        if (questions && questions.length > 0) {
          const relevantQuestions = questions.filter(q => 
            q.section === currentSection || 
            (currentSection === "basics" && q.section === "business")
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
    advanceToNextSection();
  }, [currentSection, canProceed, state, advanceToNextSection]);

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
        description: state.description.trim(),
        agent_description: state.agent_description.trim(),
        target_audience: state.target_audience.trim(),
        escalation_rules: state.escalation_rules.trim(),
        country: state.country.trim(),
        business_timezone: state.business_timezone.trim(),
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
        return <TemplatesSection state={state} onChange={handleChange} onNext={() => handleNext()} />;
      case "basics":
        return <SectionBasics {...sectionProps} />;
      case "business":
        return <SectionBusiness {...sectionProps} />;
      case "personality":
        return <SectionPersonality {...sectionProps} />;
      case "tools":
        return <SectionTools {...sectionProps} />;
      case "advanced":
        return <SectionAdvanced {...sectionProps} />;
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
        {sections.map((section, index) => (
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
          <Button onClick={handleNext} disabled={!canProceed(currentSection) || isAnalyzingAI}>
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
