"use client";

import { use } from "react";
import { OperationsShell } from "@/components/operations";
import { CompanyDetail } from "@/components/crm";

export default function CrmCompanyDetailPage({
  params,
}: {
  params: Promise<{ companyId: string }>;
}) {
  const { companyId } = use(params);

  return (
    <OperationsShell
      breadcrumb={[
        { label: "CRM" },
        { label: "Empresas", href: "/crm/companies" },
        { label: "Detalle" },
      ]}
    >
      <div className="p-6">
        <CompanyDetail companyId={companyId} />
      </div>
    </OperationsShell>
  );
}
