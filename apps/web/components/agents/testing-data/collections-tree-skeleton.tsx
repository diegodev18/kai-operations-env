export function CollectionsTreeSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="space-y-2.5 p-1" aria-hidden>
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex items-center gap-2.5 py-1">
          <div className="size-4 shrink-0 animate-pulse rounded-sm bg-muted/50" />
          <div
            className="h-3.5 animate-pulse rounded bg-muted/40"
            style={{ width: `${60 + (i % 3) * 18}%` }}
          />
        </div>
      ))}
    </div>
  );
}
