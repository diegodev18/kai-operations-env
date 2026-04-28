import { Input } from "@/components/ui/input";
import type { MemorySectionProps } from "@/types";
import { DOCUMENT_LABELS } from "./constants";
import { FieldLabel } from "./field-label";
import { SettingsSection } from "./settings-section";

export function MemorySection({ formState, update }: MemorySectionProps) {
  return (
    <SettingsSection
      id="memory"
      title={DOCUMENT_LABELS.memory}
      description="Ajusta el límite de memoria conversacional."
    >
      <div className="space-y-2">
        <FieldLabel docId="memory" fieldKey="limit" id="memory-limit" />
        <Input
          id="memory-limit"
          type="number"
          min={0}
          value={formState.memory.limit ?? 15}
          onChange={(e) =>
            update("memory", (prev) => ({
              ...prev,
              limit: parseInt(e.target.value, 10) || 0,
            }))
          }
        />
      </div>
    </SettingsSection>
  );
}
