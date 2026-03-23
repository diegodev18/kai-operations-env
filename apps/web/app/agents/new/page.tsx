"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  Suspense,
} from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeftIcon, CheckIcon, Loader2Icon } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LoginPage } from "@/components/login-page";
import { useAuth } from "@/hooks/auth";
import {
  fetchAgentDraft,
  fetchToolsCatalog,
  patchAgentDraft,
  postAgentDraft,
  type ToolsCatalogItem,
} from "@/lib/agents-api";
import { cn } from "@/lib/utils";

const STEPS = [
  { id: 0, title: "Personalidad", short: "1" },
  { id: 1, title: "Propiedades generales", short: "2" },
  { id: 2, title: "Tools", short: "3" },
] as const;

const textareaClass =
  "min-h-[120px] w-full rounded-lg border border-input bg-transparent px-2.5 py-2 text-base transition-colors outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 md:text-sm dark:bg-input/30";

function str(v: unknown): string {
  return typeof v === "string" ? v : "";
}

function NewAgentWizardContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const draftFromUrl = searchParams.get("draft")?.trim() ?? "";

  const [step, setStep] = useState(0);
  const [draftId, setDraftId] = useState("");
  const [loadingDraft, setLoadingDraft] = useState(Boolean(draftFromUrl));
  const [saving, setSaving] = useState(false);
  const [finished, setFinished] = useState(false);

  const [agentName, setAgentName] = useState("");
  const [agentPersonality, setAgentPersonality] = useState("");

  const [businessName, setBusinessName] = useState("");
  const [ownerName, setOwnerName] = useState("");
  const [industry, setIndustry] = useState("");
  const [description, setDescription] = useState("");
  const [agentDescription, setAgentDescription] = useState("");
  const [targetAudience, setTargetAudience] = useState("");
  const [escalationRules, setEscalationRules] = useState("");
  const [country, setCountry] = useState("");

  const [catalog, setCatalog] = useState<ToolsCatalogItem[]>([]);
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [toolSearch, setToolSearch] = useState("");
  const [selectedToolIds, setSelectedToolIds] = useState<Set<string>>(
    () => new Set(),
  );

  const applyDraftToForms = useCallback((d: Record<string, unknown>) => {
    setAgentName(str(d.agent_name));
    setAgentPersonality(str(d.agent_personality));
    setBusinessName(str(d.business_name));
    setOwnerName(str(d.owner_name));
    setIndustry(str(d.industry));
    setDescription(str(d.description));
    setAgentDescription(str(d.agent_description));
    setTargetAudience(str(d.target_audience));
    setEscalationRules(str(d.escalation_rules));
    setCountry(str(d.country));
    const st = d.selected_tools;
    if (Array.isArray(st)) {
      const ids = st.filter((x): x is string => typeof x === "string");
      setSelectedToolIds(new Set(ids));
    }
  }, []);

  const setStepFromCreationStep = useCallback(
    (creationStep: string | undefined) => {
      switch (creationStep) {
        case "business":
          setStep(1);
          break;
        case "tools":
          setStep(2);
          break;
        case "complete":
          setFinished(true);
          setStep(2);
          break;
        default:
          setStep(0);
      }
    },
    [],
  );

  useEffect(() => {
    if (!draftFromUrl) {
      setLoadingDraft(false);
      setDraftId("");
      return;
    }
    let cancelled = false;
    setLoadingDraft(true);
    void (async () => {
      const res = await fetchAgentDraft(draftFromUrl);
      if (cancelled) return;
      setLoadingDraft(false);
      if (!res.ok) {
        toast.error(res.error);
        router.replace("/agents/new");
        return;
      }
      setDraftId(res.id);
      applyDraftToForms(res.draft);
      setStepFromCreationStep(str(res.draft.creation_step));
      if (str(res.draft.creation_step) === "complete") {
        setFinished(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [draftFromUrl, router, applyDraftToForms, setStepFromCreationStep]);

  useEffect(() => {
    if (step !== 2) return;
    let cancelled = false;
    setCatalogLoading(true);
    void (async () => {
      const list = await fetchToolsCatalog();
      if (cancelled) return;
      setCatalogLoading(false);
      if (list === null) {
        toast.error("No se pudo cargar el catálogo de herramientas");
        setCatalog([]);
        return;
      }
      setCatalog(list);
    })();
    return () => {
      cancelled = true;
    };
  }, [step]);

  const filteredCatalog = useMemo(() => {
    const q = toolSearch.trim().toLowerCase();
    if (!q) return catalog;
    return catalog.filter(
      (t) =>
        t.name.toLowerCase().includes(q) ||
        t.displayName.toLowerCase().includes(q) ||
        t.description.toLowerCase().includes(q),
    );
  }, [catalog, toolSearch]);

  const toggleTool = (id: string) => {
    setSelectedToolIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const goStep0Next = async () => {
    if (!agentName.trim() || !agentPersonality.trim()) {
      toast.error("Completa nombre y personalidad del agente");
      return;
    }
    setSaving(true);
    try {
      if (!draftId) {
        const res = await postAgentDraft({
          agent_name: agentName.trim(),
          agent_personality: agentPersonality.trim(),
        });
        if (!res.ok) {
          toast.error(res.error);
          return;
        }
        setDraftId(res.id);
        router.replace(`/agents/new?draft=${encodeURIComponent(res.id)}`);
      } else {
        const res = await patchAgentDraft(draftId, {
          step: "personality",
          agent_name: agentName.trim(),
          agent_personality: agentPersonality.trim(),
        });
        if (!res.ok) {
          toast.error(res.error);
          return;
        }
      }
      setStep(1);
    } finally {
      setSaving(false);
    }
  };

  const goStep1Next = async () => {
    if (
      !businessName.trim() ||
      !ownerName.trim() ||
      !industry.trim() ||
      !description.trim() ||
      !agentDescription.trim() ||
      !targetAudience.trim() ||
      !escalationRules.trim()
    ) {
      toast.error("Completa todos los campos obligatorios del negocio");
      return;
    }
    if (!draftId) {
      toast.error("Falta el borrador; vuelve al paso 1");
      return;
    }
    setSaving(true);
    try {
      const res = await patchAgentDraft(draftId, {
        step: "business",
        business_name: businessName.trim(),
        owner_name: ownerName.trim(),
        industry: industry.trim(),
        description: description.trim(),
        agent_description: agentDescription.trim(),
        target_audience: targetAudience.trim(),
        escalation_rules: escalationRules.trim(),
        ...(country.trim() ? { country: country.trim() } : {}),
      });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      setStep(2);
    } finally {
      setSaving(false);
    }
  };

  const finalizeWizard = async () => {
    if (!draftId) {
      toast.error("Falta el borrador");
      return;
    }
    if (selectedToolIds.size === 0) {
      toast.error("Selecciona al menos una herramienta");
      return;
    }
    setSaving(true);
    try {
      const toolsRes = await patchAgentDraft(draftId, {
        step: "tools",
        selected_tools: Array.from(selectedToolIds),
      });
      if (!toolsRes.ok) {
        toast.error(toolsRes.error);
        return;
      }
      const doneRes = await patchAgentDraft(draftId, { step: "complete" });
      if (!doneRes.ok) {
        toast.error(doneRes.error);
        return;
      }
      setFinished(true);
      toast.success("Borrador completado (agent_drafts)");
    } finally {
      setSaving(false);
    }
  };

  if (loadingDraft) {
    return (
      <div className="flex min-h-[50vh] flex-col items-center justify-center gap-2 text-muted-foreground">
        <Loader2Icon className="size-8 animate-spin" />
        Cargando borrador…
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-8 p-6 pb-16">
      <div className="flex items-center gap-4">
        <Button variant="outline" size="icon" asChild>
          <Link href="/" aria-label="Volver al panel">
            <ArrowLeftIcon className="size-4" />
          </Link>
        </Button>
        <div>
          <h1 className="text-xl font-semibold tracking-tight">
            Nuevo agente (borrador)
          </h1>
          <p className="text-sm text-muted-foreground">
            Tres pasos: personalidad, datos del negocio y herramientas. Se
            guarda en <code className="text-xs">agent_drafts</code>.
          </p>
        </div>
      </div>

      <nav className="flex flex-wrap gap-2" aria-label="Pasos">
        {STEPS.map((s, i) => (
          <div
            key={s.id}
            className={cn(
              "flex items-center gap-2 rounded-full border px-3 py-1 text-sm",
              step === i
                ? "border-primary bg-primary/10 text-foreground"
                : "border-border text-muted-foreground",
            )}
          >
            <span className="font-medium">{s.short}</span>
            {s.title}
          </div>
        ))}
      </nav>

      {finished ? (
        <div className="rounded-xl border border-border bg-card p-6">
          <div className="flex items-start gap-3">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary">
              <CheckIcon className="size-5" />
            </div>
            <div>
              <h2 className="font-semibold">Wizard completado</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                ID del borrador:{" "}
                <code className="rounded bg-muted px-1 py-0.5 text-xs">
                  {draftId || draftFromUrl}
                </code>
                . No aparece en el listado de agentes de producción hasta
                promoción.
              </p>
              <Button className="mt-4" asChild>
                <Link href="/">Volver al dashboard</Link>
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      {!finished && step === 0 ? (
        <section className="space-y-4 rounded-xl border border-border bg-card p-6">
          <h2 className="text-lg font-medium">Personalidad</h2>
          <p className="text-sm text-muted-foreground">
            Nombre público del agente y cómo debe comportarse (tono, estilo),
            alineado a construye con kAI.
          </p>
          <div className="space-y-2">
            <Label htmlFor="agent_name">Nombre del agente</Label>
            <Input
              id="agent_name"
              value={agentName}
              onChange={(e) => setAgentName(e.target.value)}
              placeholder="Ej. Asistente Ventanito"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="agent_personality">Personalidad</Label>
            <textarea
              id="agent_personality"
              className={textareaClass}
              value={agentPersonality}
              onChange={(e) => setAgentPersonality(e.target.value)}
              placeholder="Cómo debe hablar, emojis, formal/informal…"
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button
              type="button"
              onClick={() => void goStep0Next()}
              disabled={saving}
            >
              {saving ? (
                <Loader2Icon className="size-4 animate-spin" />
              ) : (
                "Siguiente"
              )}
            </Button>
          </div>
        </section>
      ) : null}

      {!finished && step === 1 ? (
        <section className="space-y-4 rounded-xl border border-border bg-card p-6">
          <h2 className="text-lg font-medium">Propiedades generales</h2>
          <p className="text-sm text-muted-foreground">
            Información del negocio (equivalente a{" "}
            <code className="text-xs">captureBusinessInfo</code> en CCK). Al
            continuar se crean los documentos por defecto en{" "}
            <code className="text-xs">properties</code>.
          </p>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="business_name">Nombre del negocio</Label>
              <Input
                id="business_name"
                value={businessName}
                onChange={(e) => setBusinessName(e.target.value)}
              />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="owner_name">Nombre del dueño</Label>
              <Input
                id="owner_name"
                value={ownerName}
                onChange={(e) => setOwnerName(e.target.value)}
              />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="industry">Industria</Label>
              <Input
                id="industry"
                value={industry}
                onChange={(e) => setIndustry(e.target.value)}
              />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="description">Descripción del negocio</Label>
              <textarea
                id="description"
                className={textareaClass}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="agent_description">Rol / objetivos del agente</Label>
              <textarea
                id="agent_description"
                className={textareaClass}
                value={agentDescription}
                onChange={(e) => setAgentDescription(e.target.value)}
              />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="target_audience">Audiencia objetivo</Label>
              <textarea
                id="target_audience"
                className={textareaClass}
                value={targetAudience}
                onChange={(e) => setTargetAudience(e.target.value)}
              />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="escalation_rules">Reglas de escalamiento</Label>
              <textarea
                id="escalation_rules"
                className={textareaClass}
                value={escalationRules}
                onChange={(e) => setEscalationRules(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="country">País (opcional)</Label>
              <Input
                id="country"
                value={country}
                onChange={(e) => setCountry(e.target.value)}
                placeholder="Ej. México"
              />
            </div>
          </div>
          <div className="flex justify-between gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setStep(0)}
              disabled={saving}
            >
              Atrás
            </Button>
            <Button
              type="button"
              onClick={() => void goStep1Next()}
              disabled={saving}
            >
              {saving ? (
                <Loader2Icon className="size-4 animate-spin" />
              ) : (
                "Siguiente"
              )}
            </Button>
          </div>
        </section>
      ) : null}

      {!finished && step === 2 ? (
        <section className="space-y-4 rounded-xl border border-border bg-card p-6">
          <h2 className="text-lg font-medium">Tools</h2>
          <p className="text-sm text-muted-foreground">
            Selecciona herramientas del catálogo Firestore{" "}
            <code className="text-xs">toolsCatalog</code>. Se guardan en{" "}
            <code className="text-xs">agent_drafts/.../tools</code>.
          </p>
          <div className="relative">
            <Input
              placeholder="Buscar por nombre o descripción…"
              value={toolSearch}
              onChange={(e) => setToolSearch(e.target.value)}
              className="max-w-md"
            />
          </div>
          {catalogLoading ? (
            <div className="flex items-center gap-2 text-muted-foreground">
              <Loader2Icon className="size-5 animate-spin" />
              Cargando catálogo…
            </div>
          ) : (
            <ul className="max-h-[420px] space-y-2 overflow-y-auto rounded-lg border border-border p-2">
              {filteredCatalog.length === 0 ? (
                <li className="p-4 text-sm text-muted-foreground">
                  No hay herramientas que coincidan.
                </li>
              ) : (
                filteredCatalog.map((t) => (
                  <li
                    key={t.id}
                    className="flex gap-3 rounded-md border border-transparent p-2 hover:bg-muted/40"
                  >
                    <Checkbox
                      id={`tool-${t.id}`}
                      checked={selectedToolIds.has(t.id)}
                      onCheckedChange={() => toggleTool(t.id)}
                      className="mt-1"
                    />
                    <label
                      htmlFor={`tool-${t.id}`}
                      className="min-w-0 flex-1 cursor-pointer"
                    >
                      <span className="font-medium">
                        {t.displayName || t.name}
                      </span>
                      <span className="ml-2 text-xs text-muted-foreground">
                        {t.name}
                      </span>
                      {t.description ? (
                        <p className="mt-0.5 text-sm text-muted-foreground">
                          {t.description}
                        </p>
                      ) : null}
                    </label>
                  </li>
                ))
              )}
            </ul>
          )}
          <div className="flex justify-between gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setStep(1)}
              disabled={saving}
            >
              Atrás
            </Button>
            <Button
              type="button"
              onClick={() => void finalizeWizard()}
              disabled={saving || catalogLoading}
            >
              {saving ? (
                <Loader2Icon className="size-4 animate-spin" />
              ) : (
                "Guardar y finalizar"
              )}
            </Button>
          </div>
        </section>
      ) : null}
    </div>
  );
}

function NewAgentPageInner() {
  const { session, isPending } = useAuth();

  if (isPending) {
    return (
      <div className="flex min-h-screen items-center justify-center text-muted-foreground">
        Cargando…
      </div>
    );
  }

  if (!session?.user) {
    return <LoginPage />;
  }

  return <NewAgentWizardContent />;
}

export default function NewAgentPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center text-muted-foreground">
          Cargando…
        </div>
      }
    >
      <NewAgentPageInner />
    </Suspense>
  );
}
