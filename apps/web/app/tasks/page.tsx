"use client";

import { OperationsShell, TasksDashboard } from "@/components/operations";

export default function GlobalTasksPage() {
  return (
    <OperationsShell breadcrumb={[{ label: "Inicio", href: "/" }, { label: "Tareas" }]}>
      <div className="flex min-h-0 flex-1 flex-col px-4 py-4 sm:px-5 lg:px-6">
        <TasksDashboard />
      </div>
    </OperationsShell>
  );
}
