export function DocumentsTableSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div className="h-full overflow-hidden" aria-hidden>
      <div className="sticky top-0 border-b bg-background px-3 py-2">
        <div className="flex gap-8">
          <div className="h-3 w-8 animate-pulse rounded bg-muted/50" />
          <div className="h-3 w-16 animate-pulse rounded bg-muted/50" />
        </div>
      </div>
      <div className="divide-y">
        {Array.from({ length: rows }, (_, i) => (
          <div key={i} className="flex gap-3 px-3 py-2.5">
            <div className="h-3.5 w-20 shrink-0 animate-pulse rounded bg-muted/45" />
            <div className="flex min-w-0 flex-1 flex-wrap gap-2">
              <div className="h-5 w-24 animate-pulse rounded bg-muted/35" />
              <div className="h-5 w-32 animate-pulse rounded bg-muted/35" />
              <div className="h-5 w-20 animate-pulse rounded bg-muted/35" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
