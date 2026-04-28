import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { AGENT_VERSIONS } from "@/consts/agent-versions";
import type { ConversationSectionProps } from "@/types";
import { DOCUMENT_LABELS } from "./constants";
import { FieldLabel } from "./field-label";
import { SettingsSection } from "./settings-section";

const CONVERSATION_CHECKBOXES = [
  "isAuthEnable",
  "injectCommandsInPrompt",
  "isMemoryEnable",
  "isMultiMessageEnable",
  "isMultiMessageResponseEnable",
  "omitFirstEchoes",
  "isValidatorAgentEnable",
] as const;

export function ConversationSection({
  formState,
  showAllSections,
  showGrowerSections,
  isAdmin,
  agentVersion,
  savingVersion,
  firestoreDataMode,
  savingFirestoreDataMode,
  onVersionChange,
  onFirestoreDataModeChange,
  update,
}: ConversationSectionProps) {
  return (
    <SettingsSection
      id="conversation"
      title={DOCUMENT_LABELS.agent}
      description="Configura el comportamiento base del agente."
    >
      <div className="grid gap-3">
        {CONVERSATION_CHECKBOXES.filter((key) => {
          if (showAllSections) return true;
          if (showGrowerSections) {
            return ["injectCommandsInPrompt", "isMemoryEnable", "isValidatorAgentEnable"].includes(
              key,
            );
          }
          return false;
        }).map((key) => (
          <div key={key} className="flex items-center gap-2">
            <input
              type="checkbox"
              id={`agent-${key}`}
              checked={!!formState.agent[key]}
              onChange={(e) =>
                update("agent", (prev) => ({
                  ...prev,
                  [key]: e.target.checked,
                }))
              }
              className="h-4 w-4 rounded border-input"
            />
            <FieldLabel docId="agent" fieldKey={key} id={`agent-${key}`} />
          </div>
        ))}

        {showAllSections && (
          <>
            <div className="space-y-2">
              <FieldLabel docId="agent" fieldKey="maxFunctionCalls" id="agent-maxFunctionCalls" />
              <Input
                id="agent-maxFunctionCalls"
                type="number"
                min={1}
                max={8}
                value={formState.agent.maxFunctionCalls ?? 4}
                onChange={(e) => {
                  const v = parseInt(e.target.value, 10);
                  const clamped = Number.isFinite(v) ? Math.min(8, Math.max(1, v)) : 4;
                  update("agent", (prev) => ({
                    ...prev,
                    maxFunctionCalls: clamped,
                  }));
                }}
              />
            </div>

            <div className="space-y-2">
              <FieldLabel docId="agent" fieldKey="excludedNumbers" id="agent-excludedNumbers" />
              <Textarea
                id="agent-excludedNumbers"
                value={(formState.agent.excludedNumbers ?? []).join("\n")}
                onChange={(e) =>
                  update("agent", (prev) => ({
                    ...prev,
                    excludedNumbers: e.target.value
                      .split("\n")
                      .map((s) => s.trim())
                      .filter(Boolean),
                  }))
                }
                placeholder="Un número por línea"
                rows={3}
                className="font-mono text-sm"
              />
            </div>

            <div className="space-y-2">
              <div className="space-y-1">
                <Label htmlFor="agent-version">Versión del agente</Label>
                <p className="text-xs font-normal text-muted-foreground">
                  Selecciona la versión del agente. Cada versión puede tener comportamientos y
                  features distintas.
                </p>
              </div>
              <Select
                value={agentVersion}
                onValueChange={onVersionChange}
                disabled={savingVersion}
              >
                <SelectTrigger id="agent-version" className="w-full">
                  <SelectValue placeholder="Selecciona la versión" />
                </SelectTrigger>
                <SelectContent>
                  {AGENT_VERSIONS.map((v) => (
                    <SelectItem key={v.value} value={v.value}>
                      <div className="flex flex-col gap-0.5">
                        <span>{v.label}</span>
                        <span className="text-xs font-normal text-muted-foreground">
                          {v.description}
                        </span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {isAdmin && (
              <div className="space-y-2">
                <div className="space-y-1">
                  <Label htmlFor="agent-firestore-data-mode">Datos que usará el agente</Label>
                  <p className="text-xs font-normal text-muted-foreground">
                    Elige si el agente debe trabajar con datos de prueba, datos reales o decidirlo
                    automáticamente.
                  </p>
                </div>
                <Select
                  value={firestoreDataMode}
                  onValueChange={(v) => {
                    void onFirestoreDataModeChange(v as "auto" | "testing" | "production");
                  }}
                  disabled={savingFirestoreDataMode}
                >
                  <SelectTrigger id="agent-firestore-data-mode" className="w-full">
                    <SelectValue placeholder="Modo" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="auto">
                      <div className="flex flex-col gap-0.5">
                        <span>Automático (número de negocio de prueba)</span>
                        <span className="text-xs font-normal text-muted-foreground">
                          Los números de prueba usan datos de prueba; los demás usan datos reales.
                        </span>
                      </div>
                    </SelectItem>
                    <SelectItem value="testing">
                      <div className="flex flex-col gap-0.5">
                        <span>Siempre datos de prueba</span>
                        <span className="text-xs font-normal text-muted-foreground">
                          Útil para revisar cambios sin afectar conversaciones reales.
                        </span>
                      </div>
                    </SelectItem>
                    <SelectItem value="production">
                      <div className="flex flex-col gap-0.5">
                        <span>Siempre producción</span>
                        <span className="text-xs font-normal text-muted-foreground">
                          Úsalo cuando quieras que todos vean el comportamiento publicado.
                        </span>
                      </div>
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
          </>
        )}
      </div>
    </SettingsSection>
  );
}
