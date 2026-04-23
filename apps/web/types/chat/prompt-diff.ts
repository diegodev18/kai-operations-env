/** Tipos del visor de diff de prompts. */

export interface PromptDiffViewProps {
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

export interface DiffLine {
  type: "added" | "removed" | "unchanged";
  content: string;
  oldLineNo: number | null;
  newLineNo: number | null;
  hunkId: number | null;
}

export type WordSegment = {
  type: "removed" | "added" | "unchanged";
  text: string;
};
