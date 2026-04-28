import { useMemo } from "react";
import type { AgentPropertiesResponse, PropertyDocumentId } from "@/types";
import { Button } from "@/components/ui/button";
import { FileEditIcon, RotateCcwIcon } from "lucide-react";
import { formatFirestoreValue } from "@/utils/firestore-value-format";
import { DOCUMENT_LABELS } from "./constants";
import {
  buildPayloadForDocument,
  getChangedFieldPathsForDocument,
  getPendingDocumentIds,
  getValueAtPath,
} from "./helpers";

export function PendingLocalChangesList({
  formState,
  originalData,
  onRevertDoc,
}: {
  formState: AgentPropertiesResponse;
  originalData: AgentPropertiesResponse;
  onRevertDoc?: (docId: PropertyDocumentId) => void;
}) {
  const pendingIds = useMemo(
    () => getPendingDocumentIds(formState, originalData),
    [formState, originalData],
  );

  if (pendingIds.length === 0) return null;

  return (
    <div className="max-h-[min(60vh,24rem)] space-y-3 overflow-y-auto rounded-md border bg-muted/30 px-3 py-2">
      {pendingIds.map((docId) => {
        const fieldPaths = getChangedFieldPathsForDocument(
          docId,
          formState,
          originalData,
        );
        const formPayload = buildPayloadForDocument(
          docId,
          formState,
        ) as Record<string, unknown>;
        const origPayload = buildPayloadForDocument(
          docId,
          originalData,
        ) as Record<string, unknown>;
        return (
          <div
            key={docId}
            className="space-y-1.5 border-b border-border/60 pb-3 last:border-0 last:pb-0"
          >
            <div className="flex items-center justify-between gap-2 text-sm font-medium text-foreground">
              <div className="flex min-w-0 items-center gap-2">
                <FileEditIcon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                <span className="truncate">{DOCUMENT_LABELS[docId]}</span>
                <span className="shrink-0 text-xs font-normal text-muted-foreground">
                  ({fieldPaths.length} cambio{fieldPaths.length === 1 ? "" : "s"})
                </span>
              </div>
              {onRevertDoc ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => onRevertDoc(docId)}
                  className="size-7 shrink-0"
                  title={`Restablecer "${DOCUMENT_LABELS[docId]}" a su valor original`}
                >
                  <RotateCcwIcon className="h-3.5 w-3.5" />
                </Button>
              ) : null}
            </div>
            <ul className="space-y-1.5 pl-1">
              {fieldPaths.map((path) => {
                const beforeVal = getValueAtPath(origPayload, path);
                const afterVal = getValueAtPath(formPayload, path);
                return (
                  <li key={path} className="text-xs">
                    <code className="break-all font-mono text-foreground">
                      {path}
                    </code>
                    <div className="mt-0.5 max-h-24 overflow-y-auto rounded bg-background/50 px-1.5 py-1 font-mono text-[11px] leading-snug text-muted-foreground">
                      <span className="opacity-80">
                        {formatFirestoreValue(beforeVal)}
                      </span>
                      <span className="mx-1 text-foreground/50">→</span>
                      <span>{formatFirestoreValue(afterVal)}</span>
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}
    </div>
  );
}
