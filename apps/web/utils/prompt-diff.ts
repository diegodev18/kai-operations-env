import { diffLines, diffWordsWithSpace, type Change } from "diff";
import type { DiffLine, WordSegment } from "@/types/prompt-diff";

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
    const line = lines[i]!;
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
  revertedHunkIds: Set<number>,
): string {
  const parts: string[] = [];
  for (const line of lines) {
    if (line.type === "unchanged") {
      parts.push(line.content);
      continue;
    }
    if (
      line.type === "removed" &&
      line.hunkId != null &&
      revertedHunkIds.has(line.hunkId)
    ) {
      parts.push(line.content);
    }
    if (
      line.type === "added" &&
      (line.hunkId == null || !revertedHunkIds.has(line.hunkId))
    ) {
      parts.push(line.content);
    }
  }
  return parts.join("\n");
}

export function getWordDiffSegments(
  oldLine: string,
  newLine: string,
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

export function buildPairedContentMap(lines: DiffLine[]): Map<number, string> {
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
      map.set(removed[j]!, lines[added[j]!]!.content);
      map.set(added[j]!, lines[removed[j]!]!.content);
    }
  });
  return map;
}
