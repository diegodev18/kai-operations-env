import { Loader2Icon, RefreshCwIcon } from "lucide-react";
import { Button } from "@/components/ui/button";

export function PanelLoading() {
  return (
    <div className="flex items-center justify-center py-16">
      <Loader2Icon className="size-8 animate-spin text-muted-foreground" />
    </div>
  );
}

export function PanelError({
  message,
  onRetry,
}: {
  message: string;
  onRetry?: () => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
      <p className="max-w-sm text-sm text-muted-foreground">{message}</p>
      {onRetry && (
        <Button variant="outline" size="sm" onClick={onRetry}>
          <RefreshCwIcon className="mr-2 size-3.5" />
          Reintentar
        </Button>
      )}
    </div>
  );
}
