"use client";

import { Suspense } from "react";
import { OperationsShell, TasksDashboard } from "@/components/operations";

export default function GlobalTasksPage() {
  return (
    <OperationsShell breadcrumb={[{ label: "Inicio", href: "/" }, { label: "Tareas" }]}>
      <div className="flex min-h-0 flex-1 flex-col px-4 py-4 sm:px-5 lg:px-6">
        <Suspense fallback={<div className="text-sm text-muted-foreground">Cargando…</div>}>
          <TasksDashboard />
        </Suspense>
      </div>
    </OperationsShell>
  );
}
