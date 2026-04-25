import { CollectionsTreeSkeleton } from "@/components/agents/testing-data/collections-tree-skeleton";
import { DocumentsTableSkeleton } from "@/components/agents/testing-data/documents-table-skeleton";

export default function TestingDataLoading() {
  return (
    <div className="flex h-full min-h-0 flex-1 flex-col gap-4" aria-busy="true">
      <span className="sr-only">Cargando datos de testing</span>
      <div className="flex items-center gap-2">
        <div className="size-5 shrink-0 animate-pulse rounded bg-muted/50" aria-hidden />
        <div className="h-6 w-28 animate-pulse rounded bg-muted/50" aria-hidden />
      </div>

      <div className="flex min-h-0 flex-1 gap-4 overflow-hidden">
        <div className="flex w-64 shrink-0 flex-col gap-2">
          <div className="flex items-center justify-between">
            <div className="h-4 w-28 animate-pulse rounded bg-muted/50" aria-hidden />
            <div className="flex gap-1" aria-hidden>
              <div className="size-7 animate-pulse rounded-md bg-muted/40" />
              <div className="size-7 animate-pulse rounded-md bg-muted/40" />
            </div>
          </div>
          <div className="min-h-0 flex-1 overflow-hidden rounded-md border p-2">
            <CollectionsTreeSkeleton rows={6} />
          </div>
        </div>

        <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-2 overflow-hidden">
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-md border">
            <DocumentsTableSkeleton rows={7} />
          </div>
        </div>
      </div>
    </div>
  );
}
