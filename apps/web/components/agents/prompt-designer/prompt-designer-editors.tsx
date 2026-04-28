import { Label } from "@/components/ui/label";
import {
  PromptDiffView,
  PromptMarkdownEditor,
  PromptMarkdownViewToggle,
} from "@/components/prompt";

export function PromptDesignerEditors({
  isAuthEnabled,
  promptAndChatLocked,
  showSuggestion,
  suggestedForBase,
  primaryTarget,
  editingPrompt,
  effectiveRejected,
  onRejectSuggestionHunk,
  onAcceptSuggestionHunk,
  hasChanges,
  editorViewMode,
  savedPrompt,
  setEditingPrompt,
  rawViewBasePrompt,
  setRawViewBasePrompt,
  baseMarkdownRemount,
  setBaseMarkdownRemount,
  showMarkdownEditorBase,
  suggestedForUnauth,
  editingUnauthPrompt,
  savedUnauthPrompt,
  setEditingUnauthPrompt,
  rawViewUnauthPrompt,
  setRawViewUnauthPrompt,
  unauthMarkdownRemount,
  setUnauthMarkdownRemount,
  showMarkdownEditorUnauth,
  suggestedForAuth,
  editingAuthPrompt,
  savedAuthPrompt,
  setEditingAuthPrompt,
  rawViewAuthPrompt,
  setRawViewAuthPrompt,
  authMarkdownRemount,
  setAuthMarkdownRemount,
  showMarkdownEditorAuth,
}: {
  isAuthEnabled: boolean;
  promptAndChatLocked: boolean;
  showSuggestion: boolean;
  suggestedForBase?: string;
  primaryTarget: "base" | "auth" | "unauth";
  editingPrompt: string;
  effectiveRejected: Set<number>;
  onRejectSuggestionHunk: (hunkId: number) => void;
  onAcceptSuggestionHunk: (hunkId: number) => void;
  hasChanges: boolean;
  editorViewMode: "edit" | "diff";
  savedPrompt: string;
  setEditingPrompt: (value: string) => void;
  rawViewBasePrompt: boolean;
  setRawViewBasePrompt: (raw: boolean) => void;
  baseMarkdownRemount: number;
  setBaseMarkdownRemount: (updater: (n: number) => number) => void;
  showMarkdownEditorBase: boolean;
  suggestedForUnauth?: string;
  editingUnauthPrompt: string;
  savedUnauthPrompt: string;
  setEditingUnauthPrompt: (value: string) => void;
  rawViewUnauthPrompt: boolean;
  setRawViewUnauthPrompt: (raw: boolean) => void;
  unauthMarkdownRemount: number;
  setUnauthMarkdownRemount: (updater: (n: number) => number) => void;
  showMarkdownEditorUnauth: boolean;
  suggestedForAuth?: string;
  editingAuthPrompt: string;
  savedAuthPrompt: string;
  setEditingAuthPrompt: (value: string) => void;
  rawViewAuthPrompt: boolean;
  setRawViewAuthPrompt: (raw: boolean) => void;
  authMarkdownRemount: number;
  setAuthMarkdownRemount: (updater: (n: number) => number) => void;
  showMarkdownEditorAuth: boolean;
}) {
  return (
    <div className="flex-1 min-h-0 flex flex-col p-3 gap-4 overflow-hidden bg-background">
      <div className="flex-[3] min-h-0 flex flex-col gap-2 overflow-hidden">
        <div className="flex min-w-0 flex-wrap items-center justify-between gap-x-3 gap-y-1">
          <div className="flex min-w-0 items-center gap-2">
            <Label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
              Base Prompt
            </Label>
            {isAuthEnabled && (
              <span className="text-[10px] bg-primary/10 text-primary px-1.5 py-0.5 rounded-full font-medium">
                Modular
              </span>
            )}
          </div>
          {showMarkdownEditorBase ? (
            <PromptMarkdownViewToggle
              rawView={rawViewBasePrompt}
              onRawViewChange={(raw) => {
                setRawViewBasePrompt(raw);
                if (!raw) setBaseMarkdownRemount((n) => n + 1);
              }}
              disabled={promptAndChatLocked}
            />
          ) : null}
        </div>
        <div className="flex-1 min-h-0">
          {showSuggestion && suggestedForBase != null && primaryTarget === "base" ? (
            <PromptDiffView
              oldText={editingPrompt}
              newText={suggestedForBase}
              rejectedSuggestionHunkIds={effectiveRejected}
              onRejectSuggestionHunk={onRejectSuggestionHunk}
              onAcceptSuggestionHunk={onAcceptSuggestionHunk}
            />
          ) : hasChanges && editorViewMode === "diff" ? (
            <PromptDiffView
              oldText={savedPrompt}
              newText={editingPrompt}
              onRevertHunk={(newText) => setEditingPrompt(newText)}
            />
          ) : (
            <PromptMarkdownEditor
              value={editingPrompt}
              onChange={setEditingPrompt}
              disabled={promptAndChatLocked}
              className="h-full w-full text-sm"
              placeholder="Escribe el prompt del agente…"
              rawView={rawViewBasePrompt}
              markdownPaneRemountKey={baseMarkdownRemount}
            />
          )}
        </div>
      </div>
      {isAuthEnabled && (
        <div className="flex-[2] min-h-0 grid grid-cols-1 lg:grid-cols-2 gap-4 p-3 border-t bg-muted/5 overflow-hidden">
          <div className="flex flex-col gap-2 min-h-0">
            <div className="flex min-w-0 flex-wrap items-center justify-between gap-x-3 gap-y-1">
              <Label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                Unauth (Public)
              </Label>
              {showMarkdownEditorUnauth ? (
                <PromptMarkdownViewToggle
                  rawView={rawViewUnauthPrompt}
                  onRawViewChange={(raw) => {
                    setRawViewUnauthPrompt(raw);
                    if (!raw) setUnauthMarkdownRemount((n) => n + 1);
                  }}
                  disabled={promptAndChatLocked}
                />
              ) : null}
            </div>
            <div className="flex-1 min-h-0">
              {showSuggestion && suggestedForUnauth != null ? (
                <PromptDiffView oldText={editingUnauthPrompt} newText={suggestedForUnauth} />
              ) : hasChanges && editorViewMode === "diff" ? (
                <PromptDiffView
                  oldText={savedUnauthPrompt}
                  newText={editingUnauthPrompt}
                  onRevertHunk={(newText) => setEditingUnauthPrompt(newText)}
                />
              ) : (
                <PromptMarkdownEditor
                  value={editingUnauthPrompt}
                  onChange={setEditingUnauthPrompt}
                  className="h-full text-xs [&_.ProseMirror]:text-xs"
                  disabled={promptAndChatLocked}
                  placeholder="Prompt para usuarios no autenticados…"
                  rawView={rawViewUnauthPrompt}
                  markdownPaneRemountKey={unauthMarkdownRemount}
                />
              )}
            </div>
          </div>
          <div className="flex flex-col gap-2 min-h-0">
            <div className="flex min-w-0 flex-wrap items-center justify-between gap-x-3 gap-y-1">
              <Label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground text-primary/80">
                Auth (Verified)
              </Label>
              {showMarkdownEditorAuth ? (
                <PromptMarkdownViewToggle
                  rawView={rawViewAuthPrompt}
                  onRawViewChange={(raw) => {
                    setRawViewAuthPrompt(raw);
                    if (!raw) setAuthMarkdownRemount((n) => n + 1);
                  }}
                  disabled={promptAndChatLocked}
                />
              ) : null}
            </div>
            <div className="flex-1 min-h-0">
              {showSuggestion && suggestedForAuth != null ? (
                <PromptDiffView oldText={editingAuthPrompt} newText={suggestedForAuth} />
              ) : hasChanges && editorViewMode === "diff" ? (
                <PromptDiffView
                  oldText={savedAuthPrompt}
                  newText={editingAuthPrompt}
                  onRevertHunk={(newText) => setEditingAuthPrompt(newText)}
                />
              ) : (
                <PromptMarkdownEditor
                  value={editingAuthPrompt}
                  onChange={setEditingAuthPrompt}
                  className="h-full text-xs [&_.ProseMirror]:text-xs"
                  disabled={promptAndChatLocked}
                  placeholder="Prompt para usuarios autenticados…"
                  rawView={rawViewAuthPrompt}
                  markdownPaneRemountKey={authMarkdownRemount}
                />
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
