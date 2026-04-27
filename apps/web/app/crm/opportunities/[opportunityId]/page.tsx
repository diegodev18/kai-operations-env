"use client";

import { use } from "react";
import { OperationsShell } from "@/components/operations";
import { OpportunityDetail } from "@/components/crm";

export default function CrmOpportunityDetailPage({
  params,
}: {
  params: Promise<{ opportunityId: string }>;
}) {
  const { opportunityId } = use(params);

  return (
    <OperationsShell
      breadcrumb={[
        { label: "CRM" },
        { label: "Oportunidades", href: "/crm/opportunities" },
        { label: "Detalle" },
      ]}
    >
      <div className="p-6">
        <OpportunityDetail opportunityId={opportunityId} />
      </div>
    </OperationsShell>
  );
}
