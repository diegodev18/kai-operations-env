export default function AgentFormLoading() {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex min-h-0 flex-1 flex-col gap-4 p-4">
        <div className="h-8 w-56 animate-pulse rounded bg-muted/50" />
        <div className="h-24 w-full animate-pulse rounded-lg border bg-muted/40" />
        <div className="grid gap-4 md:grid-cols-2">
          <div className="h-64 animate-pulse rounded-lg border bg-muted/40" />
          <div className="h-64 animate-pulse rounded-lg border bg-muted/40" />
        </div>
        <div className="h-72 w-full animate-pulse rounded-lg border bg-muted/40" />
      </div>
    </div>
  );
}
