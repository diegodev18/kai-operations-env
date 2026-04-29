"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeftIcon,
  Loader2Icon,
  PencilIcon,
  PlusIcon,
  Trash2Icon,
  ExternalLinkIcon,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import type { CrmCompany, CrmCompanyInput, CrmOpportunityInput } from "@/types";
import {
  CRM_COMPANY_STATUS_LABELS,
  CRM_COMPANY_STATUS_COLORS,
  CRM_OPPORTUNITY_STAGE_LABELS,
  CRM_OPPORTUNITY_STAGE_COLORS,
} from "@/types";
import { useCrmCompanyDetail, useCrmCompanies, useCrmOpportunities } from "@/hooks";
import { CompanyFormDialog } from "@/components/crm/company-form";
import { OpportunityFormDialog } from "@/components/crm/opportunity-form";
import { deleteCrmCompany } from "@/services/crm-api";
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

export function CompanyDetail({ companyId }: { companyId: string }) {
  const router = useRouter();
  const { company, isLoading, error, refetch, update } =
    useCrmCompanyDetail(companyId);
  const { companies } = useCrmCompanies();
  const {
    opportunities,
    isLoading: opLoading,
    create: createOp,
  } = useCrmOpportunities(companyId);

  const [editOpen, setEditOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [opFormOpen, setOpFormOpen] = useState(false);
  const [isOpSaving, setIsOpSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const handleUpdate = async (input: CrmCompanyInput) => {
    setIsSaving(true);
    const res = await update(input);
    setIsSaving(false);
    if (res.ok) {
      toast.success("Empresa actualizada");
      setEditOpen(false);
      await refetch();
    } else {
      toast.error(res.error);
    }
  };

  const handleDelete = async () => {
    if (!confirm("¿Eliminar esta empresa? Esta acción no se puede deshacer."))
      return;
    setIsDeleting(true);
    const res = await deleteCrmCompany(companyId);
    setIsDeleting(false);
    if (res.ok) {
      toast.success("Empresa eliminada");
      router.push("/crm/companies");
    } else {
      toast.error(res.error);
    }
  };

  const handleCreateOp = async (input: CrmOpportunityInput) => {
    setIsOpSaving(true);
    const res = await createOp(input);
    setIsOpSaving(false);
    if (res.ok) {
      toast.success("Oportunidad creada");
      setOpFormOpen(false);
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

  if (error || !company) {
    return (
      <div className="py-8 text-center text-sm text-destructive">
        {error ?? "Empresa no encontrada"}
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
            onClick={() => router.push("/crm/companies")}
          >
            <ArrowLeftIcon className="size-4" />
          </Button>
          <div>
            <h1 className="text-xl font-semibold">{company.name}</h1>
            <div className="mt-1 flex items-center gap-2">
              <span
                className={cn(
                  "rounded-full px-2 py-0.5 text-xs font-medium",
                  CRM_COMPANY_STATUS_COLORS[company.status],
                )}
              >
                {CRM_COMPANY_STATUS_LABELS[company.status]}
              </span>
              {company.industry && (
                <span className="rounded bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                  {company.industry}
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              const params = new URLSearchParams({ mode: "form", crmCompanyId: companyId });
              router.push(`/agents/new?${params.toString()}`);
            }}
          >
            <ExternalLinkIcon className="mr-1.5 size-4" />
            Crear agente
          </Button>
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

      {/* Info cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="rounded-lg border p-4">
          <h3 className="mb-3 text-sm font-medium">Información general</h3>
          <dl className="space-y-2">
            <Field label="Owner" value={company.ownerName} />
            <Field label="Grower" value={company.growerName} />
            <Field
              label="MRR"
              value={
                company.mrr
                  ? company.mrr >= 1000
                    ? `$${(company.mrr / 1000).toFixed(company.mrr % 1000 === 0 ? 0 : 1)}k`
                    : `$${company.mrr}`
                  : null
              }
            />
            <Field label="País" value={company.country} />
            <Field label="Zona horaria" value={company.businessTimezone} />
          </dl>
        </div>

        <div className="rounded-lg border p-4">
          <h3 className="mb-3 text-sm font-medium">Perfil del negocio</h3>
          <dl className="space-y-2">
            <Field label="Descripción" value={company.description} />
            <Field label="Audiencia objetivo" value={company.targetAudience} />
            <Field label="Rol del agente" value={company.agentDescription} />
            <Field label="Reglas de escalamiento" value={company.escalationRules} />
          </dl>
        </div>

        {company.notes && (
          <div className="rounded-lg border p-4 sm:col-span-2">
            <h3 className="mb-2 text-sm font-medium">Notas</h3>
            <p className="text-sm text-muted-foreground">{company.notes}</p>
          </div>
        )}
      </div>

      {/* Opportunities */}
      <div>
        <div className="mb-3 flex items-center justify-between">
          <h3 className="font-medium">
            Oportunidades ({opportunities.length})
          </h3>
          <Button
            size="sm"
            variant="outline"
            onClick={() => setOpFormOpen(true)}
          >
            <PlusIcon className="mr-1.5 size-4" />
            Nueva oportunidad
          </Button>
        </div>

        {opLoading ? (
          <div className="flex items-center justify-center py-6">
            <Loader2Icon className="size-4 animate-spin text-muted-foreground" />
          </div>
        ) : opportunities.length === 0 ? (
          <p className="text-sm text-muted-foreground">Sin oportunidades todavía.</p>
        ) : (
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/30 text-xs text-muted-foreground">
                  <th className="px-4 py-2 text-left font-medium">Nombre</th>
                  <th className="px-4 py-2 text-left font-medium">Etapa</th>
                  <th className="px-4 py-2 text-right font-medium">MRR</th>
                  <th className="px-4 py-2 text-left font-medium">Implementador</th>
                  <th className="px-4 py-2 text-left font-medium">Funciones</th>
                </tr>
              </thead>
              <tbody>
                {opportunities.map((op) => (
                  <tr
                    key={op.id}
                    className="cursor-pointer border-b transition-colors last:border-0 hover:bg-muted/40"
                    onClick={() =>
                      router.push(`/crm/opportunities/${op.id}`)
                    }
                  >
                    <td className="px-4 py-2 font-medium">{op.name}</td>
                    <td className="px-4 py-2">
                      <span
                        className={cn(
                          "rounded-full px-2 py-0.5 text-xs font-medium",
                          CRM_OPPORTUNITY_STAGE_COLORS[op.stage],
                        )}
                      >
                        {CRM_OPPORTUNITY_STAGE_LABELS[op.stage]}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-right font-mono text-xs">
                      {op.mrr ? `${op.mrr >= 1000 ? `${(op.mrr / 1000).toFixed(0)}k` : op.mrr}` : "—"}
                    </td>
                    <td className="px-4 py-2 text-muted-foreground">
                      {op.implementerName || "—"}
                    </td>
                    <td className="px-4 py-2">
                      <div className="flex flex-wrap gap-1">
                        {(op.featuresToImplement ?? []).slice(0, 2).map((f) => (
                          <span
                            key={f}
                            className="rounded bg-muted px-1.5 py-0.5 text-xs"
                          >
                            {f}
                          </span>
                        ))}
                        {(op.featuresToImplement ?? []).length > 2 && (
                          <span className="text-xs text-muted-foreground">
                            +{(op.featuresToImplement ?? []).length - 2}
                          </span>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <CompanyFormDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        initial={company as CrmCompany}
        onSave={handleUpdate}
        isSaving={isSaving}
      />

      <OpportunityFormDialog
        open={opFormOpen}
        onOpenChange={setOpFormOpen}
        companies={companies}
        defaultCompanyId={companyId}
        onSave={handleCreateOp}
        isSaving={isOpSaving}
      />
    </div>
  );
}
