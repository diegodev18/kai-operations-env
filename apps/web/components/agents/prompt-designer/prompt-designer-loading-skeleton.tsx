export function PromptDesignerLoadingSkeleton() {
  return (
    <div className="flex min-h-0 w-full flex-1 flex-col overflow-hidden">
      <div className="flex min-h-0 flex-1 overflow-hidden rounded-lg border">
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex-1 space-y-4 p-3">
            <div className="h-4 w-36 animate-pulse rounded bg-muted/50" />
            <div className="h-[45%] w-full animate-pulse rounded border bg-muted/40" />
            <div className="h-[35%] w-full animate-pulse rounded border bg-muted/40" />
          </div>
          <div className="flex gap-2 border-t p-3">
            <div className="h-9 w-28 animate-pulse rounded bg-muted/50" />
            <div className="ml-auto h-9 w-24 animate-pulse rounded bg-muted/50" />
            <div className="h-9 w-20 animate-pulse rounded bg-muted/50" />
            <div className="h-9 w-36 animate-pulse rounded bg-muted/50" />
          </div>
        </div>

        <div className="w-2 shrink-0 border-l bg-muted/30" />
        <div className="w-[340px] shrink-0 border-l p-3">
          <div className="h-5 w-24 animate-pulse rounded bg-muted/50" />
          <div className="mt-3 h-[70%] w-full animate-pulse rounded border bg-muted/40" />
          <div className="mt-3 h-20 w-full animate-pulse rounded bg-muted/40" />
        </div>
      </div>
    </div>
  );
}
