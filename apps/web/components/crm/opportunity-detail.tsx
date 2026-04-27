"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeftIcon,
  Loader2Icon,
  PencilIcon,
  Trash2Icon,
  ExternalLinkIcon,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import type { CrmOpportunityInput } from "@/types";
import {
  CRM_OPPORTUNITY_STAGE_LABELS,
  CRM_OPPORTUNITY_STAGE_COLORS,
} from "@/types";
import {
  useCrmOpportunityDetail,
  useCrmCompanies,
} from "@/hooks";
import { OpportunityFormDialog } from "@/components/crm/opportunity-form";
import { deleteCrmOpportunity } from "@/services/crm-api";
import { cn } from "@/lib/utils";

function Field({
  label,
  value,
}: {
  label: string;
  value?: string | number | null;
}) {
  if (!value) return null;
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 text-sm">{value}</dd>
    </div>
  );
}

export function OpportunityDetail({
  opportunityId,
}: {
  opportunityId: string;
}) {
  const router = useRouter();
  const { opportunity, isLoading, error, refetch, update } =
    useCrmOpportunityDetail(opportunityId);
  const { companies } = useCrmCompanies();

  const [editOpen, setEditOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const handleUpdate = async (input: CrmOpportunityInput) => {
    setIsSaving(true);
    const res = await update(input);
    setIsSaving(false);
    if (res.ok) {
      toast.success("Oportunidad actualizada");
      setEditOpen(false);
      await refetch();
    } else {
      toast.error(res.error);
    }
  };

  const handleDelete = async () => {
    if (!confirm("¿Eliminar esta oportunidad? Esta acción no se puede deshacer."))
      return;
    setIsDeleting(true);
    const res = await deleteCrmOpportunity(opportunityId);
    setIsDeleting(false);
    if (res.ok) {
      toast.success("Oportunidad eliminada");
      router.push("/crm/opportunities");
    } else {
      toast.error(res.error);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2Icon className="size-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error || !opportunity) {
    return (
      <div className="py-8 text-center text-sm text-destructive">
        {error ?? "Oportunidad no encontrada"}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => router.push("/crm/opportunities")}
          >
            <ArrowLeftIcon className="size-4" />
          </Button>
          <div>
            <h1 className="text-xl font-semibold">{opportunity.name}</h1>
            <div className="mt-1 flex items-center gap-2">
              <span
                className={cn(
                  "rounded-full px-2 py-0.5 text-xs font-medium",
                  CRM_OPPORTUNITY_STAGE_COLORS[opportunity.stage],
                )}
              >
                {CRM_OPPORTUNITY_STAGE_LABELS[opportunity.stage]}
              </span>
              <button
                type="button"
                className="text-xs text-muted-foreground underline-offset-2 hover:underline"
                onClick={() =>
                  router.push(`/crm/companies/${opportunity.companyId}`)
                }
              >
                {opportunity.companyName}
              </button>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {!opportunity.agentId && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                const params = new URLSearchParams({
                  mode: "form",
                  crmCompanyId: opportunity.companyId,
                  crmOpportunityId: opportunityId,
                });
                router.push(`/agents/new?${params.toString()}`);
              }}
            >
              <ExternalLinkIcon className="mr-1.5 size-4" />
              Crear agente
            </Button>
          )}
          {opportunity.agentId && (
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                router.push(
                  `/agents/${encodeURIComponent(opportunity.agentId!)}`,
                )
              }
            >
              <ExternalLinkIcon className="mr-1.5 size-4" />
              Ver agente
            </Button>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={() => setEditOpen(true)}
          >
            <PencilIcon className="mr-1.5 size-4" />
            Editar
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="text-destructive hover:bg-destructive/10"
            disabled={isDeleting}
            onClick={() => void handleDelete()}
          >
            <Trash2Icon className="mr-1.5 size-4" />
            Eliminar
          </Button>
        </div>
      </div>

      {/* Info */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="rounded-lg border p-4">
          <h3 className="mb-3 text-sm font-medium">Detalle</h3>
          <dl className="space-y-2">
            <Field label="Empresa" value={opportunity.companyName} />
            <Field label="Contacto" value={opportunity.contactName} />
            <Field label="Teléfono" value={opportunity.contactPhone} />
            <Field label="Implementador" value={opportunity.implementerName} />
            <Field
              label="MRR"
              value={
                opportunity.mrr
                  ? opportunity.mrr >= 1000
                    ? `$${(opportunity.mrr / 1000).toFixed(opportunity.mrr % 1000 === 0 ? 0 : 1)}k`
                    : `$${opportunity.mrr}`
                  : null
              }
            />
          </dl>
        </div>

        <div className="rounded-lg border p-4">
          <h3 className="mb-3 text-sm font-medium">Funciones a implementar</h3>
          {(opportunity.featuresToImplement ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground">Sin funciones definidas.</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {(opportunity.featuresToImplement ?? []).map((f) => (
                <span
                  key={f}
                  className="rounded-full bg-muted px-2.5 py-0.5 text-xs text-muted-foreground"
                >
                  {f}
                </span>
              ))}
            </div>
          )}
        </div>

        {opportunity.notes && (
          <div className="rounded-lg border p-4 sm:col-span-2">
            <h3 className="mb-2 text-sm font-medium">Notas</h3>
            <p className="text-sm text-muted-foreground">{opportunity.notes}</p>
          </div>
        )}

        {opportunity.agentId && (
          <div className="rounded-lg border border-green-200 bg-green-50 p-4 dark:border-green-900 dark:bg-green-950 sm:col-span-2">
            <p className="text-sm font-medium text-green-700 dark:text-green-300">
              Agente vinculado:{" "}
              <span className="font-mono text-xs">{opportunity.agentId}</span>
            </p>
          </div>
        )}
      </div>

      <OpportunityFormDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        initial={opportunity}
        companies={companies}
        onSave={handleUpdate}
        isSaving={isSaving}
      />
    </div>
  );
}
