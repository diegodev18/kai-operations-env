import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { AiSectionProps } from "@/types";
import {
  AGENT_LLM_MODELS,
  DEFAULT_LLM_MODEL,
  DOCUMENT_LABELS,
  getDefaultTemperatureForModel,
} from "./constants";
import { FieldLabel } from "./field-label";
import { SettingsSection } from "./settings-section";

export function AiSection({ formState, update }: AiSectionProps) {
  return (
    <SettingsSection id="ai" title={DOCUMENT_LABELS.ai} description="Configura modelo y razonamiento.">
      <div className="space-y-3">
        <div className="space-y-2">
          <FieldLabel docId="ai" fieldKey="model" id="ai-model" />
          <Select
            value={
              formState.ai?.model &&
              AGENT_LLM_MODELS.includes(formState.ai.model as (typeof AGENT_LLM_MODELS)[number])
                ? formState.ai.model
                : DEFAULT_LLM_MODEL
            }
            onValueChange={(value) => update("ai", (prev) => ({ ...prev, model: value }))}
          >
            <SelectTrigger id="ai-model" className="w-full">
              <SelectValue placeholder="Selecciona el modelo" />
            </SelectTrigger>
            <SelectContent>
              {AGENT_LLM_MODELS.map((modelId) => (
                <SelectItem key={modelId} value={modelId}>
                  {modelId}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <FieldLabel docId="ai" fieldKey="temperature" id="ai-temperature" />
          <Input
            id="ai-temperature"
            type="number"
            min={0}
            max={1}
            step={0.05}
            value={
              formState.ai?.temperature !== undefined && formState.ai?.temperature !== null
                ? Number(formState.ai.temperature)
                : getDefaultTemperatureForModel(formState.ai?.model ?? DEFAULT_LLM_MODEL)
            }
            onChange={(e) => {
              const v = parseFloat(e.target.value);
              const defaultTemp = getDefaultTemperatureForModel(
                formState.ai?.model ?? DEFAULT_LLM_MODEL,
              );
              const clamped = Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : defaultTemp;
              update("ai", (prev) => ({
                ...prev,
                temperature: clamped,
              }));
            }}
          />
        </div>

        <div className="flex items-center gap-2">
          <input
            type="checkbox"
            id="ai-thinking-includeThoughts"
            checked={!!formState.ai?.thinking?.includeThoughts}
            onChange={(e) =>
              update("ai", (prev) => ({
                ...prev,
                thinking: {
                  budget: prev.thinking?.budget,
                  includeThoughts: e.target.checked,
                  level: prev.thinking?.level ?? "",
                },
              }))
            }
            className="h-4 w-4 rounded border-input"
          />
          <FieldLabel
            docId="ai"
            fieldKey="thinking.includeThoughts"
            id="ai-thinking-includeThoughts"
          />
        </div>

        <div className="space-y-2">
          <FieldLabel docId="ai" fieldKey="thinking.level" id="ai-thinking-level" />
          <Select
            value={
              formState.ai?.thinking?.level &&
              ["minimal", "low", "medium", "high"].includes(formState.ai.thinking.level)
                ? formState.ai.thinking.level
                : "__none__"
            }
            onValueChange={(value) =>
              update("ai", (prev) => ({
                ...prev,
                thinking: {
                  budget: prev.thinking?.budget,
                  includeThoughts: prev.thinking?.includeThoughts ?? false,
                  level: value === "__none__" ? "" : value,
                },
              }))
            }
          >
            <SelectTrigger id="ai-thinking-level" className="w-full">
              <SelectValue placeholder="Sin especificar" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__none__">Sin especificar</SelectItem>
              <SelectItem value="minimal">Minimal</SelectItem>
              <SelectItem value="low">Low</SelectItem>
              <SelectItem value="medium">Medium</SelectItem>
              <SelectItem value="high">High</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <FieldLabel docId="ai" fieldKey="thinking.budget" id="ai-thinking-budget" />
          <Input
            id="ai-thinking-budget"
            type="number"
            min={-1}
            value={
              formState.ai?.thinking?.budget !== undefined && formState.ai?.thinking?.budget !== null
                ? formState.ai.thinking.budget
                : ""
            }
            onChange={(e) => {
              const raw = e.target.value;
              if (raw === "" || raw === null || raw === undefined) {
                update("ai", (prev) => ({
                  ...prev,
                  thinking: {
                    budget: undefined,
                    includeThoughts: prev.thinking?.includeThoughts ?? false,
                    level: prev.thinking?.level ?? "",
                  },
                }));
                return;
              }
              const v = parseInt(raw, 10);
              const budget = Number.isFinite(v) ? v : undefined;
              update("ai", (prev) => ({
                ...prev,
                thinking: {
                  budget,
                  includeThoughts: prev.thinking?.includeThoughts ?? false,
                  level: prev.thinking?.level ?? "",
                },
              }));
            }}
            placeholder="-1 = automático, 0 = apagado, número positivo = más razonamiento"
          />
          <p className="text-xs text-muted-foreground">
            0 = apagado, -1 = automático, número positivo = más espacio para razonar
          </p>
        </div>
      </div>
    </SettingsSection>
  );
}
