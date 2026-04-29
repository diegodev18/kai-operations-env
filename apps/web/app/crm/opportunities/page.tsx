"use client";

import { OperationsShell } from "@/components/operations";
import { OpportunitiesTable } from "@/components/crm";
import { useCrmCompanies } from "@/hooks";

export default function CrmOpportunitiesPage() {
  const { companies } = useCrmCompanies();

  return (
    <OperationsShell
      breadcrumb={[{ label: "CRM" }, { label: "Oportunidades" }]}
    >
      <div className="p-6">
        <OpportunitiesTable companies={companies} />
      </div>
    </OperationsShell>
  );
}
