import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { ValidationSectionProps } from "@/types";
import { DOCUMENT_LABELS } from "./constants";
import { FieldLabel } from "./field-label";
import { SettingsSection } from "./settings-section";

export function ValidationSection({ formState, showAllSections, update }: ValidationSectionProps) {
  return (
    <SettingsSection
      id="validation"
      title={DOCUMENT_LABELS.mcp}
      description="Controla reintentos y endpoint MCP del validador."
      className={cn(!formState.agent.isValidatorAgentEnable && "opacity-60")}
    >
      <div className="space-y-2">
        <FieldLabel docId="mcp" fieldKey="maxRetries" id="mcp-maxRetries" />
        <Input
          id="mcp-maxRetries"
          type="number"
          min={0}
          value={formState.mcp.maxRetries ?? 1}
          onChange={(e) =>
            update("mcp", (prev) => ({
              ...prev,
              maxRetries: Math.max(0, parseInt(e.target.value, 10) || 0),
            }))
          }
          disabled={!formState.agent.isValidatorAgentEnable}
          aria-describedby={!formState.agent.isValidatorAgentEnable ? "mcp-maxRetries-hint" : undefined}
        />
        {!formState.agent.isValidatorAgentEnable && (
          <p id="mcp-maxRetries-hint" className="text-xs text-muted-foreground">
            Activa el agente validador en &quot;Comportamiento general&quot; para editar este valor.
          </p>
        )}
      </div>
      {showAllSections && (
        <div className="space-y-2">
          <FieldLabel docId="mcp" fieldKey="toolsMcpEndpoint" id="mcp-toolsMcpEndpoint" />
          <Select
            value={formState.mcp.toolsMcpEndpoint ?? "default"}
            onValueChange={(value) =>
              update("mcp", (prev) => ({
                ...prev,
                toolsMcpEndpoint: value,
              }))
            }
          >
            <SelectTrigger id="mcp-toolsMcpEndpoint" className="w-full">
              <SelectValue placeholder="Selecciona el ambiente" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="default">Automático</SelectItem>
              <SelectItem value="production">Datos reales</SelectItem>
              <SelectItem value="testing">Datos de prueba</SelectItem>
            </SelectContent>
          </Select>
        </div>
      )}
    </SettingsSection>
  );
}
