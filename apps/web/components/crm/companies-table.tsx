"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { PlusIcon, Loader2Icon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { CrmCompany, CrmCompanyInput } from "@/types";
import {
  CRM_COMPANY_STATUS_LABELS,
  CRM_COMPANY_STATUS_COLORS,
} from "@/types";
import { useCrmCompanies } from "@/hooks";
import { CompanyFormDialog } from "@/components/crm/company-form";
import { cn } from "@/lib/utils";

function MrrBadge({ mrr }: { mrr?: number }) {
  if (!mrr) return <span className="text-muted-foreground">—</span>;
  const fmt =
    mrr >= 1000 ? `${(mrr / 1000).toFixed(mrr % 1000 === 0 ? 0 : 1)}k` : String(mrr);
  return <span className="font-mono text-xs">{fmt}</span>;
}

function StatusBadge({ status }: { status: CrmCompany["status"] }) {
  return (
    <span
      className={cn(
        "rounded-full px-2 py-0.5 text-xs font-medium",
        CRM_COMPANY_STATUS_COLORS[status],
      )}
    >
      {CRM_COMPANY_STATUS_LABELS[status]}
    </span>
  );
}

function CompanyInitial({ name }: { name: string }) {
  const initial = name.trim().charAt(0).toUpperCase();
  const colors = [
    "bg-blue-500",
    "bg-green-500",
    "bg-purple-500",
    "bg-orange-500",
    "bg-pink-500",
    "bg-cyan-500",
    "bg-yellow-500",
    "bg-red-500",
  ];
  const color = colors[initial.charCodeAt(0) % colors.length];
  return (
    <span
      className={cn(
        "flex size-6 shrink-0 items-center justify-center rounded text-xs font-semibold text-white",
        color,
      )}
    >
      {initial}
    </span>
  );
}

export function CompaniesTable() {
  const router = useRouter();
  const { companies, isLoading, error, create } = useCrmCompanies();
  const [search, setSearch] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const filtered = companies.filter((c) =>
    c.name.toLowerCase().includes(search.toLowerCase()) ||
    (c.industry ?? "").toLowerCase().includes(search.toLowerCase()) ||
    (c.ownerName ?? "").toLowerCase().includes(search.toLowerCase()),
  );

  const handleCreate = async (input: CrmCompanyInput) => {
    setIsSaving(true);
    const res = await create(input);
    setIsSaving(false);
    if (res.ok) {
      toast.success("Empresa creada");
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
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-muted-foreground">
            All Compañías · {companies.length}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <Input
            className="h-8 w-48 text-sm"
            placeholder="Buscar…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <Button size="sm" onClick={() => setFormOpen(true)}>
            <PlusIcon className="mr-1.5 size-4" />
            Nueva empresa
          </Button>
        </div>
      </div>

      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/30 text-xs text-muted-foreground">
              <th className="px-4 py-2.5 text-left font-medium">Nombre</th>
              <th className="px-4 py-2.5 text-left font-medium">Owner</th>
              <th className="px-4 py-2.5 text-left font-medium">Grower</th>
              <th className="px-4 py-2.5 text-left font-medium">Status</th>
              <th className="px-4 py-2.5 text-right font-medium">MRR</th>
              <th className="px-4 py-2.5 text-left font-medium">Sector</th>
              <th className="px-4 py-2.5 text-left font-medium">Notas</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td
                  colSpan={7}
                  className="px-4 py-8 text-center text-muted-foreground"
                >
                  {search ? "Sin resultados" : "No hay empresas todavía"}
                </td>
              </tr>
            ) : (
              filtered.map((company) => (
                <tr
                  key={company.id}
                  className="cursor-pointer border-b transition-colors last:border-0 hover:bg-muted/40"
                  onClick={() => router.push(`/crm/companies/${company.id}`)}
                >
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-2">
                      <CompanyInitial name={company.name} />
                      <span className="font-medium">{company.name}</span>
                    </div>
                  </td>
                  <td className="px-4 py-2.5 text-muted-foreground">
                    {company.ownerName || "—"}
                  </td>
                  <td className="px-4 py-2.5 text-muted-foreground">
                    {company.growerName || "—"}
                  </td>
                  <td className="px-4 py-2.5">
                    <StatusBadge status={company.status} />
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <MrrBadge mrr={company.mrr} />
                  </td>
                  <td className="px-4 py-2.5 text-muted-foreground">
                    {company.industry || "—"}
                  </td>
                  <td className="max-w-[200px] truncate px-4 py-2.5 text-muted-foreground">
                    {company.notes || "—"}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <CompanyFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        onSave={handleCreate}
        isSaving={isSaving}
      />
    </div>
  );
}
