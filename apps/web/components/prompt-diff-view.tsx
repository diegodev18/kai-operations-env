import { useMemo } from "react";
import { diffLines, diffWordsWithSpace, type Change } from "diff";
import { Button } from "@/components/ui/button";
import { CheckIcon, Undo2Icon } from "lucide-react";

interface PromptDiffViewProps {
  oldText: string;
  newText: string;
  /** Modo "guardado vs actual": al rechazar una sección se aplica el nuevo texto al editor. */
  onRevertHunk?: (newText: string) => void;
  /** Modo "sugerencia": IDs de hunks que el usuario ha rechazado (no se aplicarán al aceptar). */
  rejectedSuggestionHunkIds?: Set<number>;
  /** Modo "sugerencia": llamar cuando el usuario rechaza una sección de la sugerencia. */
  onRejectSuggestionHunk?: (hunkId: number) => void;
  /** Modo "sugerencia": llamar cuando el usuario vuelve a aceptar una sección rechazada. */
  onAcceptSuggestionHunk?: (hunkId: number) => void;
}

interface DiffLine {
  type: "added" | "removed" | "unchanged";
  content: string;
  oldLineNo: number | null;
  newLineNo: number | null;
  hunkId: number | null;
}

export function computeDiffLines(oldText: string, newText: string): DiffLine[] {
  const changes: Change[] = diffLines(oldText, newText);
  const lines: DiffLine[] = [];
  let oldLine = 1;
  let newLine = 1;

  for (const change of changes) {
    const content = change.value.endsWith("\n")
      ? change.value.slice(0, -1)
      : change.value;
    const parts = content.split("\n");

    for (const part of parts) {
      if (change.added) {
        lines.push({
          type: "added",
          content: part,
          oldLineNo: null,
          newLineNo: newLine++,
          hunkId: null,
        });
      } else if (change.removed) {
        lines.push({
          type: "removed",
          content: part,
          oldLineNo: oldLine++,
          newLineNo: null,
          hunkId: null,
        });
      } else {
        lines.push({
          type: "unchanged",
          content: part,
          oldLineNo: oldLine++,
          newLineNo: newLine++,
          hunkId: null,
        });
      }
    }
  }

  let hunkId = -1;
  let inHunk = false;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.type === "removed" || line.type === "added") {
      if (!inHunk) {
        hunkId += 1;
        inHunk = true;
      }
      line.hunkId = hunkId;
    } else {
      inHunk = false;
      line.hunkId = null;
    }
  }

  return lines;
}

export function buildTextWithRevertedHunks(
  lines: DiffLine[],
  revertedHunkIds: Set<number>
): string {
  const parts: string[] = [];
  for (const line of lines) {
    if (line.type === "unchanged") {
      parts.push(line.content);
      continue;
    }
    if (line.type === "removed" && line.hunkId != null && revertedHunkIds.has(line.hunkId)) {
      parts.push(line.content);
    }
    if (line.type === "added" && (line.hunkId == null || !revertedHunkIds.has(line.hunkId))) {
      parts.push(line.content);
    }
  }
  return parts.join("\n");
}

/** Segmento de una línea cuando se hace diff por palabras (solo una línea: old o new). */
type WordSegment = { type: "removed" | "added" | "unchanged"; text: string };

function getWordDiffSegments(
  oldLine: string,
  newLine: string
): { oldSegments: WordSegment[]; newSegments: WordSegment[] } {
  const changes = diffWordsWithSpace(oldLine, newLine);
  const oldSegments: WordSegment[] = [];
  const newSegments: WordSegment[] = [];
  for (const c of changes) {
    if (c.removed) {
      oldSegments.push({ type: "removed", text: c.value });
    } else if (c.added) {
      newSegments.push({ type: "added", text: c.value });
    } else {
      oldSegments.push({ type: "unchanged", text: c.value });
      newSegments.push({ type: "unchanged", text: c.value });
    }
  }
  return { oldSegments, newSegments };
}

/** Para cada índice de línea, contenido de la línea "pareja" con la que hacer word-diff (si existe). */
function buildPairedContentMap(lines: DiffLine[]): Map<number, string> {
  const map = new Map<number, string>();
  const byHunk = new Map<number, { removed: number[]; added: number[] }>();
  lines.forEach((line, i) => {
    if (line.hunkId == null) return;
    let entry = byHunk.get(line.hunkId);
    if (!entry) {
      entry = { removed: [], added: [] };
      byHunk.set(line.hunkId, entry);
    }
    if (line.type === "removed") entry.removed.push(i);
    if (line.type === "added") entry.added.push(i);
  });
  byHunk.forEach(({ removed, added }) => {
    const n = Math.min(removed.length, added.length);
    for (let j = 0; j < n; j++) {
      map.set(removed[j], lines[added[j]].content);
      map.set(added[j], lines[removed[j]].content);
    }
  });
  return map;
}

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

export default function PromptDiffView({
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
    0
  );
  const maxNewLine = lines.reduce(
    (max, l) => (l.newLineNo != null && l.newLineNo > max ? l.newLineNo : max),
    0
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
            (i === 0 || lines[i - 1].hunkId !== line.hunkId);
          const isRejected = isFirstLineOfHunk && rejectedSuggestionHunkIds.has(line.hunkId!);

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
                        line.type === "added" ? line.content : paired
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
