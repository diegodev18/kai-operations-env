import { Textarea } from "@/components/ui/textarea";
import type { AccessSectionProps } from "@/types";
import { DOCUMENT_LABELS } from "./constants";
import { FieldLabel } from "./field-label";
import { SettingsSection } from "./settings-section";

export function AccessSection({ formState, update }: AccessSectionProps) {
  return (
    <SettingsSection
      id="access"
      title={DOCUMENT_LABELS.limitation}
      description="Controla la lista blanca de números permitidos."
    >
      <div className="grid gap-3">
        <div className="flex items-center gap-2">
          <input
            type="checkbox"
            id="limitation-userLimitation"
            checked={!!formState.limitation.userLimitation}
            onChange={(e) =>
              update("limitation", (prev) => ({
                ...prev,
                userLimitation: e.target.checked,
              }))
            }
            className="h-4 w-4 rounded border-input"
          />
          <FieldLabel
            docId="limitation"
            fieldKey="userLimitation"
            id="limitation-userLimitation"
          />
        </div>
        <div className="space-y-2">
          <FieldLabel docId="limitation" fieldKey="allowedUsers" id="limitation-allowedUsers" />
          <Textarea
            id="limitation-allowedUsers"
            value={(formState.limitation.allowedUsers ?? []).join("\n")}
            onChange={(e) =>
              update("limitation", (prev) => ({
                ...prev,
                allowedUsers: e.target.value
                  .split("\n")
                  .map((s) => s.trim())
                  .filter(Boolean),
              }))
            }
            placeholder="Un número por línea"
            rows={4}
            className="font-mono text-sm"
          />
        </div>
      </div>
    </SettingsSection>
  );
}
