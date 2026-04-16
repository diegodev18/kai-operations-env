"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import { Loader2Icon } from "lucide-react";

import {
  fetchAgentBuilderForm,
  fetchToolsCatalog,
  type ToolsCatalogItem,
} from "@/lib/agents-api";
import type { AgentBuilderFormResponse } from "@/types/agents-api";
import {
  FORM_SECTIONS,
  STAGE_TYPES,
  type AgentFlowQuestion,
  type FormSection,
  type FormSectionId,
  type Pipeline,
  type Stage,
  type StageType,
} from "@/lib/form-builder-constants";
import { PROPERTY_TITLES } from "@/lib/property-descriptions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

function formatScalar(v: unknown): string {
  if (v == null || v === "") return "—";
  if (typeof v === "boolean") return v ? "Sí" : "No";
  if (typeof v === "number") return String(v);
  if (typeof v === "string") return v.trim() || "—";
  if (Array.isArray(v)) {
    if (v.length === 0) return "—";
    return v.map((x) => (typeof x === "string" ? x : JSON.stringify(x))).join(", ");
  }
  try {
    return JSON.stringify(v, null, 2);
  } catch {
    return String(v);
  }
}

function FieldRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div
      className={cn(
        "grid gap-1 border-b border-border/50 py-3 last:border-0",
        "sm:grid-cols-[minmax(0,14rem)_1fr] sm:gap-4",
      )}
    >
      <dt className="text-sm font-medium text-muted-foreground">{label}</dt>
      <dd className="min-w-0 whitespace-pre-wrap break-words text-sm text-foreground">
        {value}
      </dd>
    </div>
  );
}

const BUSINESS_LABELS: Record<string, string> = {
  businessName: "Nombre del negocio",
  ownerName: "Responsable",
  industry: "Industria",
  customIndustry: "Industria (otro)",
  description: "Descripción del negocio",
  targetAudience: "Audiencia objetivo",
  agentDescription: "Rol del agente",
  escalationRules: "Reglas de escalamiento",
  country: "País",
  businessTimezone: "Zona horaria",
  brandValues: "Valores de marca",
  policies: "Políticas",
};

const PERSONALITY_LABELS: Record<string, string> = {
  agentName: "Nombre del agente",
  agentPersonality: "Personalidad (descripción)",
  responseLanguage: "Idioma de respuesta",
  useEmojis: "Uso de emojis",
  countryAccent: "Acento o región",
  agentSignature: "Firma",
  tone: "Tono",
  greetingMessage: "Mensaje de bienvenida",
  responseLength: "Longitud de respuesta",
  requiredPhrases: "Frases obligatorias",
  topicsToAvoid: "Temas a evitar",
  conversationStyle: "Estilo de conversación",
};

function renderDocFields(
  docKey: keyof typeof PROPERTY_TITLES,
  data: Record<string, unknown> | undefined,
): React.ReactNode[] {
  if (!data || typeof data !== "object") return [];
  const titles = PROPERTY_TITLES[docKey];
  const rows: React.ReactNode[] = [];
  for (const [k, val] of Object.entries(data)) {
    if (k === "thinking" && val && typeof val === "object") {
      const th = val as Record<string, unknown>;
      for (const [tk, tv] of Object.entries(th)) {
        const label =
          titles[`thinking.${tk}`] ?? `thinking.${tk}`;
        rows.push(
          <FieldRow key={`${k}.${tk}`} label={label} value={formatScalar(tv)} />,
        );
      }
      continue;
    }
    const label = titles[k] ?? k;
    rows.push(<FieldRow key={k} label={label} value={formatScalar(val)} />);
  }
  return rows;
}

function getFlowQuestions(
  root: Record<string, unknown>,
  business: Record<string, unknown> | null,
): AgentFlowQuestion[] {
  const b = business?.flowQuestions;
  if (Array.isArray(b)) return b as AgentFlowQuestion[];
  const r = root.flow_questions;
  if (Array.isArray(r)) return r as AgentFlowQuestion[];
  return [];
}

function getFlowAnswers(
  root: Record<string, unknown>,
  business: Record<string, unknown> | null,
): Record<string, string> {
  const b = business?.flowAnswers;
  if (b && typeof b === "object" && !Array.isArray(b)) {
    return b as Record<string, string>;
  }
  const r = root.flow_answers;
  if (r && typeof r === "object" && !Array.isArray(r)) {
    return r as Record<string, string>;
  }
  return {};
}

function getPipelines(
  root: Record<string, unknown>,
  business: Record<string, unknown> | null,
): unknown {
  const b = business?.pipelines;
  if (Array.isArray(b) && b.length > 0) return b;
  const r = root.pipelines;
  if (Array.isArray(r) && r.length > 0) return r;
  return null;
}

function stageTypeLabel(stageType: StageType | null): string {
  if (!stageType) return "";
  return STAGE_TYPES.find((st) => st.value === stageType)?.label ?? stageType;
}

/** Normaliza el JSON de Firestore al shape `Pipeline[]` del constructor. */
function parsePipelinesUnknown(raw: unknown): Pipeline[] {
  if (raw == null || !Array.isArray(raw)) return [];
  return raw.reduce<Pipeline[]>((acc, item, idx) => {
    if (item == null || typeof item !== "object" || Array.isArray(item)) {
      return acc;
    }

    const p = item as Record<string, unknown>;
    const stagesRaw = Array.isArray(p.stages) ? p.stages : [];
    const stages: Stage[] = stagesRaw
      .reduce<Stage[]>((stagesAcc, s, si) => {
        if (s == null || typeof s !== "object" || Array.isArray(s)) {
          return stagesAcc;
        }
        const st = s as Record<string, unknown>;
        const stageType =
          typeof st.stageType === "string" ? (st.stageType as StageType) : null;

        stagesAcc.push({
          id: typeof st.id === "string" ? st.id : `stage_${si}`,
          name: typeof st.name === "string" ? st.name : `Etapa ${si + 1}`,
          stageType,
          order:
            typeof st.order === "number" && Number.isFinite(st.order)
              ? st.order
              : si + 1,
          color: typeof st.color === "string" ? st.color : "#6B7280",
          icon: typeof st.icon === "string" ? st.icon : "📌",
          description:
            typeof st.description === "string" ? st.description : undefined,
          isClosedWon: st.isClosedWon === true,
          isClosedLost: st.isClosedLost === true,
          isDefault: st.isDefault === true,
        });

        return stagesAcc;
      }, [])
      .sort((a, b) => a.order - b.order);

    acc.push({
      id: typeof p.id === "string" ? p.id : `pipeline_${idx}`,
      name: typeof p.name === "string" ? p.name : "Pipeline",
      description: typeof p.description === "string" ? p.description : undefined,
      isDefault: p.isDefault === true,
      stages,
    });

    return acc;
  }, []);
}

/** Misma estructura visual que `SectionPipelines` en agent-form-builder (solo lectura). */
function PipelinesReadonlyView({ pipelines }: { pipelines: Pipeline[] }) {
  if (pipelines.length === 0) {
    return <p className="text-sm text-muted-foreground">—</p>;
  }
  return (
    <div className="space-y-6">
      {pipelines.map((pipeline, pipelineIndex) => (
        <div
          key={pipeline.id || pipelineIndex}
          className="space-y-4 rounded-lg border p-4"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1 space-y-1">
              <p className="text-lg font-medium leading-tight">{pipeline.name}</p>
              {pipeline.description ? (
                <p className="text-sm text-muted-foreground">
                  {pipeline.description}
                </p>
              ) : null}
            </div>
            {pipeline.isDefault ? (
              <span className="shrink-0 rounded bg-primary/10 px-2 py-1 text-xs text-primary">
                Default
              </span>
            ) : null}
          </div>

          <div className="space-y-3">
            <p className="text-sm font-medium">Etapas (Stages)</p>
            <div className="space-y-2">
              {pipeline.stages.length === 0 ? (
                <p className="text-sm text-muted-foreground">Sin etapas</p>
              ) : (
                pipeline.stages.map((stage, stageIndex) => (
                  <div
                    key={stage.id || stageIndex}
                    className="flex items-center gap-2 rounded-md border bg-card p-3"
                  >
                    <span
                      className="flex h-8 w-8 shrink-0 items-center justify-center rounded text-lg"
                      style={{
                        backgroundColor: `${stage.color}20`,
                      }}
                    >
                      {stage.icon}
                    </span>
                    <div className="min-w-0 flex-1">
                      <span className="text-sm font-medium">{stage.name}</span>
                      <div className="mt-1 flex flex-wrap items-center gap-2">
                        {stage.stageType ? (
                          <span className="text-xs text-muted-foreground">
                            Tipo:{" "}
                            {stageTypeLabel(stage.stageType) || stage.stageType}
                          </span>
                        ) : null}
                      </div>
                      {stage.description ? (
                        <p className="mt-1 line-clamp-3 text-xs text-muted-foreground">
                          {stage.description}
                        </p>
                      ) : null}
                    </div>
                    <div
                      className="h-4 w-4 shrink-0 rounded-full border"
                      style={{ backgroundColor: stage.color }}
                      title={stage.color}
                    />
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function getSelectedToolIds(root: Record<string, unknown>): string[] {
  const s = root.selected_tools;
  if (!Array.isArray(s)) return [];
  return s.filter((x): x is string => typeof x === "string" && x.length > 0);
}

/** Orden fijo: mitad izquierda (perfil / flujos) vs mitad derecha (técnico / cierre). */
const LEFT_COLUMN_IDS: FormSectionId[] = [
  "templates",
  "business",
  "personality",
  "flows",
];
const RIGHT_COLUMN_IDS: FormSectionId[] = [
  "advanced",
  "tools",
  "pipelines",
  "review",
];

function sectionsInOrder(ids: FormSectionId[]): FormSection[] {
  const byId = new Map(FORM_SECTIONS.map((s) => [s.id, s]));
  return ids.map((id) => byId.get(id)).filter((s): s is FormSection => s != null);
}

export function AgentBuilderFormReadonly({ agentId }: { agentId: string }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [payload, setPayload] = useState<AgentBuilderFormResponse | null>(null);
  const [catalog, setCatalog] = useState<ToolsCatalogItem[] | null>(null);

  useEffect(() => {
    if (!agentId) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    void (async () => {
      try {
        const [formRes, tools] = await Promise.all([
          fetchAgentBuilderForm(agentId),
          fetchToolsCatalog(),
        ]);
        if (cancelled) return;
        if (!formRes) {
          setError("No se pudo cargar el formulario del agente.");
          setPayload(null);
        } else {
          setPayload(formRes);
        }
        setCatalog(tools ?? []);
      } catch {
        if (!cancelled) {
          setError("Error al cargar el formulario.");
          setPayload(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [agentId]);

  const toolNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const t of catalog ?? []) {
      if (t.id) {
        map.set(t.id, t.displayName || t.name || t.id);
      }
    }
    return map;
  }, [catalog]);

  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center gap-2 text-muted-foreground">
        <Loader2Icon className="size-5 animate-spin" />
        <span className="text-sm">Cargando formulario…</span>
      </div>
    );
  }

  if (error || !payload) {
    return (
      <p className="text-sm text-destructive">{error ?? "Sin datos."}</p>
    );
  }

  const snapshot =
    payload.initial ??
    payload.live ?? {
      root: payload.root,
      personality: payload.personality,
      business: payload.business,
      advanced: payload.advanced,
    };
  const { root, personality, business, advanced } = snapshot;
  const hasInitialSnapshot = Boolean(payload.has_initial_snapshot);
  const initialSavedAt =
    payload.initial?.saved_at != null && payload.initial.saved_at !== ""
      ? payload.initial.saved_at
      : null;

  const flowQuestions = getFlowQuestions(root, business);
  const flowAnswers = getFlowAnswers(root, business);
  const pipelines = getPipelines(root, business);
  const toolIds = getSelectedToolIds(root);

  const renderSectionCard = (section: FormSection): React.ReactNode => {
    if (section.id === "templates") {
      return (
        <Card className="h-fit shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">
              {section.icon} {section.title}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              No registrado (las plantillas no se guardan como dato persistente).
            </p>
          </CardContent>
        </Card>
      );
    }

    if (section.id === "business") {
      const src = business ?? {};
      const keys = [
        "businessName",
        "ownerName",
        "industry",
        "customIndustry",
        "description",
        "targetAudience",
        "agentDescription",
        "escalationRules",
        "country",
        "businessTimezone",
        "brandValues",
        "policies",
      ] as const;
      const rootFallback: Record<(typeof keys)[number], string> = {
        businessName: "business_name",
        ownerName: "owner_name",
        industry: "industry",
        customIndustry: "custom_industry",
        description: "description",
        targetAudience: "target_audience",
        agentDescription: "agent_description",
        escalationRules: "escalation_rules",
        country: "country",
        businessTimezone: "business_timezone",
        brandValues: "brand_values",
        policies: "policies",
      };
      return (
        <Card className="h-fit shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">
              {section.icon} {section.title}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-0">
            <dl>
              {keys.map((key) => {
                const fromBusiness = src[key as keyof typeof src];
                const alt = root[rootFallback[key]];
                const val =
                  fromBusiness !== undefined && fromBusiness !== ""
                    ? fromBusiness
                    : alt;
                return (
                  <FieldRow
                    key={key}
                    label={BUSINESS_LABELS[key] ?? key}
                    value={formatScalar(val)}
                  />
                );
              })}
            </dl>
          </CardContent>
        </Card>
      );
    }

    if (section.id === "personality") {
      const src = personality ?? {};
      const keys = Object.keys(PERSONALITY_LABELS) as Array<
        keyof typeof PERSONALITY_LABELS
      >;
      return (
        <Card className="h-fit shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">
              {section.icon} {section.title}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <dl>
              {keys.map((key) => {
                const fromDoc = src[key as string];
                const rootAlt =
                  key === "agentName"
                    ? root.agent_name
                    : key === "agentPersonality"
                      ? root.agent_personality
                      : undefined;
                const val =
                  fromDoc !== undefined && fromDoc !== ""
                    ? fromDoc
                    : rootAlt;
                return (
                  <FieldRow
                    key={key}
                    label={PERSONALITY_LABELS[key]}
                    value={formatScalar(val)}
                  />
                );
              })}
            </dl>
          </CardContent>
        </Card>
      );
    }

    if (section.id === "advanced") {
      return (
        <Card className="h-fit shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">
              {section.icon} {section.title}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            {(
              [
                ["agent", advanced.agent],
                ["ai", advanced.ai],
                ["answer", advanced.answer],
                ["response", advanced.response],
                ["time", advanced.time],
                ["mcp", advanced.mcp],
              ] as const
            ).map(([docId, doc]) => (
              <div key={docId}>
                <h4 className="mb-2 text-sm font-semibold capitalize text-foreground">
                  {docId}
                </h4>
                <dl>
                  {renderDocFields(
                    docId as keyof typeof PROPERTY_TITLES,
                    doc,
                  )}
                </dl>
              </div>
            ))}
          </CardContent>
        </Card>
      );
    }

    if (section.id === "flows") {
      return (
        <Card className="h-fit shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">
              {section.icon} {section.title}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {flowQuestions.length === 0 ? (
              <p className="text-sm text-muted-foreground">—</p>
            ) : (
              <dl>
                {flowQuestions.map((q) => {
                  const ans = flowAnswers[q.field];
                  return (
                    <FieldRow
                      key={q.field}
                      label={q.label || q.field}
                      value={formatScalar(ans)}
                    />
                  );
                })}
              </dl>
            )}
          </CardContent>
        </Card>
      );
    }

    if (section.id === "tools") {
      return (
        <Card className="h-fit shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">
              {section.icon} {section.title}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {toolIds.length === 0 ? (
              <p className="text-sm text-muted-foreground">—</p>
            ) : (
              <ul className="list-inside list-disc space-y-1 text-sm">
                {toolIds.map((id) => (
                  <li key={id}>
                    <span className="font-medium">
                      {toolNameById.get(id) ?? id}
                    </span>
                    <span className="ml-2 text-xs text-muted-foreground">
                      ({id})
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      );
    }

    if (section.id === "pipelines") {
      const pipelineList =
        pipelines == null ? [] : parsePipelinesUnknown(pipelines);
      return (
        <Card className="h-fit shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">
              {section.icon} {section.title}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {pipelines == null || pipelineList.length === 0 ? (
              <p className="text-sm text-muted-foreground">—</p>
            ) : (
              <PipelinesReadonlyView pipelines={pipelineList} />
            )}
          </CardContent>
        </Card>
      );
    }

    if (section.id === "review") {
      return (
        <Card className="h-fit shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">
              {section.icon} {section.title}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <dl>
              <FieldRow
                label="Paso de creación"
                value={formatScalar(root.creation_step)}
              />
              <FieldRow
                label="Estado"
                value={formatScalar(root.status)}
              />
            </dl>
          </CardContent>
        </Card>
      );
    }

    return null;
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-auto">
      <div className="shrink-0 space-y-1 text-sm text-muted-foreground">
        {hasInitialSnapshot ? (
          <>
            <p>
              Se muestran los datos del <strong className="text-foreground">primer envío</strong>{" "}
              al crear el agente (solo lectura).
            </p>
            {initialSavedAt ? (
              <p className="text-xs">
                Guardado el{" "}
                {new Date(initialSavedAt).toLocaleString("es-MX", {
                  dateStyle: "short",
                  timeStyle: "short",
                })}
              </p>
            ) : null}
          </>
        ) : (
          <p>
            Este agente no tiene snapshot del primer envío (creado antes de esta función o
            sin completar el paso final). Se muestra el{" "}
            <strong className="text-foreground">estado actual</strong> guardado en el sistema.
          </p>
        )}
      </div>

      <div
        className={cn(
          "grid min-h-0 flex-1 grid-cols-1 content-start gap-4",
          "lg:grid-cols-2 lg:items-start lg:gap-x-5 lg:gap-y-4",
        )}
      >
        <div className="flex min-h-0 min-w-0 flex-col gap-4">
          {sectionsInOrder(LEFT_COLUMN_IDS).map((s) => (
            <Fragment key={s.id}>{renderSectionCard(s)}</Fragment>
          ))}
        </div>
        <div className="flex min-h-0 min-w-0 flex-col gap-4">
          {sectionsInOrder(RIGHT_COLUMN_IDS).map((s) => (
            <Fragment key={s.id}>{renderSectionCard(s)}</Fragment>
          ))}
        </div>
      </div>
    </div>
  );
}
