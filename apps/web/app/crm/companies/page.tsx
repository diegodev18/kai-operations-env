"use client";

import { OperationsShell } from "@/components/operations";
import { CompaniesTable } from "@/components/crm";

export default function CrmCompaniesPage() {
  return (
    <OperationsShell breadcrumb={[{ label: "CRM" }, { label: "Empresas" }]}>
      <div className="p-6">
        <CompaniesTable />
      </div>
    </OperationsShell>
  );
}
