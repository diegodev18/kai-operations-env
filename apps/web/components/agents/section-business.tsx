"use client";

import { useEffect, useState, useMemo, useCallback } from "react";
import { Loader2Icon, ChevronDownIcon } from "lucide-react";
import { toast } from "sonner";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  fetchSavedBuilderCompanies,
  type BuilderCompanyPayload,
  type SavedBuilderCompany,
  type ToolsCatalogItem,
} from "@/services/agents-api";
import { EscalationRulesInput, StringListInput } from "@/components/shared";
import type { FormBuilderState } from "@/types";

interface SectionBusinessProps {
  state: FormBuilderState;
  onChange: (updates: Partial<FormBuilderState>) => void;
  catalog: ToolsCatalogItem[];
  isSaving: boolean;
  userName?: string;
  onBusinessProfileSaved?: (payload: BuilderCompanyPayload) => void;
  editingSavedCompanyId?: string | null;
  onEditingSavedCompanyIdChange?: (id: string | null) => void;
  saveBusinessProfileToFirestore?: () => Promise<
    { ok: true; mode: "created" | "updated" } | { ok: false; error: string }
  >;
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

export function SectionBusiness({
  state,
  onChange,
  userName,
  onBusinessProfileSaved,
  editingSavedCompanyId,
  onEditingSavedCompanyIdChange,
  saveBusinessProfileToFirestore,
}: SectionBusinessProps) {
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
    return (
      savedCompanies.find((s) => s.id === editingSavedCompanyId)?.name ?? null
    );
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
          Carga un perfil ya guardado o guarda el negocio actual. También se
          guarda automáticamente al pulsar Siguiente si los datos cambiaron.
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
                        <span className="block font-medium leading-tight">
                          {c.name}
                        </span>
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
            {editingSavedCompanyId
              ? "Actualizar empresa"
              : "Guardar empresa actual"}
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
          data-testid="form-builder-owner-name"
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
          Añade una fila por situación (transferir a humano, temas sensibles,
          etc.). Se guardan como texto separado por líneas.
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
          {state.country === "MX" && (
            <option value="America/Mexico_City">
              Ciudad de México (GMT-6)
            </option>
          )}
          {state.country === "CO" && (
            <option value="America/Bogota">Bogotá (GMT-5)</option>
          )}
          {state.country === "AR" && (
            <option value="America/Argentina/Buenos_Aires">
              Buenos Aires (GMT-3)
            </option>
          )}
          {state.country === "CL" && (
            <option value="America/Santiago">Santiago (GMT-4)</option>
          )}
          {state.country === "PE" && (
            <option value="America/Lima">Lima (GMT-5)</option>
          )}
          {state.country === "US" && (
            <option value="America/New_York">Nueva York (GMT-5)</option>
          )}
          {state.country === "ES" && (
            <option value="Europe/Madrid">Madrid (GMT+1)</option>
          )}
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
