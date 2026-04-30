"use client";

import { OperationsShell } from "@/components/operations/shell";
import { BonusesDashboard } from "@/components/bonuses";

export default function BonusesPage() {
  return (
    <OperationsShell breadcrumb={[{ label: "Bonificaciones" }]}>
      <BonusesDashboard />
    </OperationsShell>
  );
}
