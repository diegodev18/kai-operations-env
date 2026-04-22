import { useMemo } from "react";
import { Button } from "@/components/ui/button";
import { CheckIcon, Undo2Icon } from "lucide-react";
import type { DiffLine, PromptDiffViewProps } from "@/types";
import {
  buildPairedContentMap,
  buildTextWithRevertedHunks,
  computeDiffLines,
  getWordDiffSegments,
} from "@/utils/prompt-diff";

const lineStyles: Record<DiffLine["type"], string> = {
  removed:
    "before:content-['-'] before:text-red-400 before:mr-2 before:font-bold",
  added:
    "before:content-['+'] before:text-green-400 before:mr-2 before:font-bold",
  unchanged: "before:content-['\\00a0'] before:mr-2",
};

const lineNumberStyles: Record<DiffLine["type"], string> = {
  removed: "text-red-400/60",
  added: "text-green-400/60",
  unchanged: "text-muted-foreground/40",
};

export function PromptDiffView({
  oldText,
  newText,
  onRevertHunk,
  rejectedSuggestionHunkIds = new Set(),
  onRejectSuggestionHunk,
  onAcceptSuggestionHunk,
}: PromptDiffViewProps) {
  const lines = useMemo(() => computeDiffLines(oldText, newText), [oldText, newText]);
  const pairedContentMap = useMemo(() => buildPairedContentMap(lines), [lines]);

  const maxOldLine = lines.reduce(
    (max, l) => (l.oldLineNo != null && l.oldLineNo > max ? l.oldLineNo : max),
    0,
  );
  const maxNewLine = lines.reduce(
    (max, l) => (l.newLineNo != null && l.newLineNo > max ? l.newLineNo : max),
    0,
  );
  const gutterWidth = Math.max(String(maxOldLine).length, String(maxNewLine).length, 2);

  const isRevertMode = typeof onRevertHunk === "function";
  const isSuggestionMode =
    typeof onRejectSuggestionHunk === "function" ||
    typeof onAcceptSuggestionHunk === "function";
  const showHunkActions = isRevertMode || isSuggestionMode;

  const handleRevertHunk = (hunkId: number) => {
    const newText = buildTextWithRevertedHunks(lines, new Set([hunkId]));
    onRevertHunk?.(newText);
  };

  return (
    <div className="h-full overflow-auto rounded-md border bg-background font-mono text-sm">
      <div className="min-w-0">
        {lines.map((line, i) => {
          const isFirstLineOfHunk =
            showHunkActions &&
            line.hunkId != null &&
            (i === 0 || lines[i - 1]!.hunkId !== line.hunkId);
          const isRejected =
            isFirstLineOfHunk && rejectedSuggestionHunkIds.has(line.hunkId!);

          return (
            <div key={i}>
              {isFirstLineOfHunk && (
                <div className="flex items-center gap-2 px-2 py-1 border-b border-border/50 bg-muted/30 sticky top-0 z-10">
                  {isRevertMode ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 text-xs gap-1"
                      onClick={() => handleRevertHunk(line.hunkId!)}
                    >
                      <Undo2Icon className="w-3 h-3" />
                      Rechazar sección
                    </Button>
                  ) : isSuggestionMode ? (
                    isRejected ? (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 text-xs gap-1"
                        onClick={() => onAcceptSuggestionHunk?.(line.hunkId!)}
                      >
                        <CheckIcon className="w-3 h-3" />
                        Aceptar sección
                      </Button>
                    ) : (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 text-xs gap-1"
                        onClick={() => onRejectSuggestionHunk?.(line.hunkId!)}
                      >
                        <Undo2Icon className="w-3 h-3" />
                        Rechazar sección
                      </Button>
                    )
                  ) : null}
                </div>
              )}
              <div className={`flex ${lineStyles[line.type]}`}>
                <span
                  className={`shrink-0 select-none px-2 text-right ${lineNumberStyles[line.type]}`}
                  style={{ minWidth: `${gutterWidth + 1}ch` }}
                >
                  {line.oldLineNo ?? ""}
                </span>
                <span
                  className={`shrink-0 select-none px-2 text-right border-r border-border/30 ${lineNumberStyles[line.type]}`}
                  style={{ minWidth: `${gutterWidth + 1}ch` }}
                >
                  {line.newLineNo ?? ""}
                </span>
                <span className="px-3 whitespace-pre-wrap break-all flex-1">
                  {(() => {
                    const paired = pairedContentMap.get(i);
                    if (paired != null && (line.type === "removed" || line.type === "added")) {
                      const { oldSegments, newSegments } = getWordDiffSegments(
                        line.type === "removed" ? line.content : paired,
                        line.type === "added" ? line.content : paired,
                      );
                      const segments = line.type === "removed" ? oldSegments : newSegments;
                      return (
                        <>
                          {segments.map((seg, k) => {
                            if (seg.type === "unchanged") {
                              return <span key={k}>{seg.text || "\u00a0"}</span>;
                            }
                            if (seg.type === "removed") {
                              return (
                                <span key={k} className="bg-red-500/20 text-red-300 rounded-sm">
                                  {seg.text}
                                </span>
                              );
                            }
                            return (
                              <span key={k} className="bg-green-500/20 text-green-300 rounded-sm">
                                {seg.text}
                              </span>
                            );
                          })}
                        </>
                      );
                    }
                    if (line.type === "removed") {
                      return (
                        <span className="bg-red-500/15 text-red-300">
                          {line.content || "\u00a0"}
                        </span>
                      );
                    }
                    if (line.type === "added") {
                      return (
                        <span className="bg-green-500/15 text-green-300">
                          {line.content || "\u00a0"}
                        </span>
                      );
                    }
                    return <>{line.content || "\u00a0"}</>;
                  })()}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
