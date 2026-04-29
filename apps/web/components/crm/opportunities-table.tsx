"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { PlusIcon, Loader2Icon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { CrmCompany, CrmOpportunity, CrmOpportunityInput } from "@/types";
import {
  CRM_OPPORTUNITY_STAGE_LABELS,
  CRM_OPPORTUNITY_STAGE_COLORS,
} from "@/types";
import { useCrmOpportunities } from "@/hooks";
import { OpportunityFormDialog } from "@/components/crm/opportunity-form";
import { cn } from "@/lib/utils";

function StageBadge({ stage }: { stage: CrmOpportunity["stage"] }) {
  return (
    <span
      className={cn(
        "rounded-full px-2 py-0.5 text-xs font-medium",
        CRM_OPPORTUNITY_STAGE_COLORS[stage],
      )}
    >
      {CRM_OPPORTUNITY_STAGE_LABELS[stage]}
    </span>
  );
}

function MrrBadge({ mrr }: { mrr?: number }) {
  if (!mrr) return <span className="text-muted-foreground">—</span>;
  const fmt =
    mrr >= 1000 ? `${(mrr / 1000).toFixed(mrr % 1000 === 0 ? 0 : 1)}k` : String(mrr);
  return <span className="font-mono text-xs">{fmt}</span>;
}

interface OpportunitiesTableProps {
  companies?: CrmCompany[];
  defaultCompanyId?: string;
}

export function OpportunitiesTable({
  companies = [],
  defaultCompanyId,
}: OpportunitiesTableProps) {
  const router = useRouter();
  const { opportunities, isLoading, error, create } =
    useCrmOpportunities(defaultCompanyId);
  const [search, setSearch] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const filtered = opportunities.filter(
    (o) =>
      o.name.toLowerCase().includes(search.toLowerCase()) ||
      o.companyName.toLowerCase().includes(search.toLowerCase()) ||
      (o.contactName ?? "").toLowerCase().includes(search.toLowerCase()),
  );

  const handleCreate = async (input: CrmOpportunityInput) => {
    setIsSaving(true);
    const res = await create(input);
    setIsSaving(false);
    if (res.ok) {
      toast.success("Oportunidad creada");
      setFormOpen(false);
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

  if (error) {
    return (
      <div className="py-8 text-center text-sm text-destructive">{error}</div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm font-medium text-muted-foreground">
          All Oportunidades · {opportunities.length}
        </span>
        <div className="flex items-center gap-2">
          <Input
            className="h-8 w-48 text-sm"
            placeholder="Buscar…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <Button size="sm" onClick={() => setFormOpen(true)}>
            <PlusIcon className="mr-1.5 size-4" />
            Nueva oportunidad
          </Button>
        </div>
      </div>

      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/30 text-xs text-muted-foreground">
              <th className="px-4 py-2.5 text-left font-medium">Nombre</th>
              {!defaultCompanyId && (
                <th className="px-4 py-2.5 text-left font-medium">Compañía</th>
              )}
              <th className="px-4 py-2.5 text-left font-medium">Contacto</th>
              <th className="px-4 py-2.5 text-left font-medium">Etapa</th>
              <th className="px-4 py-2.5 text-right font-medium">MRR</th>
              <th className="px-4 py-2.5 text-left font-medium">Implementador</th>
              <th className="px-4 py-2.5 text-left font-medium">Funciones</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td
                  colSpan={defaultCompanyId ? 6 : 7}
                  className="px-4 py-8 text-center text-muted-foreground"
                >
                  {search ? "Sin resultados" : "No hay oportunidades todavía"}
                </td>
              </tr>
            ) : (
              filtered.map((op) => (
                <tr
                  key={op.id}
                  className="cursor-pointer border-b transition-colors last:border-0 hover:bg-muted/40"
                  onClick={() => router.push(`/crm/opportunities/${op.id}`)}
                >
                  <td className="px-4 py-2.5 font-medium">{op.name}</td>
                  {!defaultCompanyId && (
                    <td className="px-4 py-2.5 text-muted-foreground">
                      {op.companyName}
                    </td>
                  )}
                  <td className="px-4 py-2.5 text-muted-foreground">
                    {op.contactName || "—"}
                  </td>
                  <td className="px-4 py-2.5">
                    <StageBadge stage={op.stage} />
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <MrrBadge mrr={op.mrr} />
                  </td>
                  <td className="px-4 py-2.5 text-muted-foreground">
                    {op.implementerName || "—"}
                  </td>
                  <td className="px-4 py-2.5">
                    <div className="flex flex-wrap gap-1">
                      {(op.featuresToImplement ?? []).slice(0, 3).map((f) => (
                        <span
                          key={f}
                          className="rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground"
                        >
                          {f}
                        </span>
                      ))}
                      {(op.featuresToImplement ?? []).length > 3 && (
                        <span className="text-xs text-muted-foreground">
                          +{(op.featuresToImplement ?? []).length - 3}
                        </span>
                      )}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <OpportunityFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        companies={companies}
        defaultCompanyId={defaultCompanyId}
        onSave={handleCreate}
        isSaving={isSaving}
      />
    </div>
  );
}
