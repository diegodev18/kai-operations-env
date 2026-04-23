"use client";

import { BUILDER_LLM_MODELS } from "@/consts/form-builder/constants";
import {
  PROPERTY_DESCRIPTIONS,
  PROPERTY_TITLES,
} from "@/consts/form-builder/property-descriptions";
import type { FormBuilderState } from "@/types";

interface SectionAdvancedProps {
  state: FormBuilderState;
  onChange: (updates: Partial<FormBuilderState>) => void;
}

export function SectionAdvanced({ state, onChange }: SectionAdvancedProps) {
  return (
    <div className="space-y-8">
      <div className="space-y-3">
        <p className="text-sm font-semibold">Modelo e IA</p>
        <div>
          <label className="text-sm font-medium">
            {PROPERTY_TITLES.ai?.model}
          </label>
          <p className="text-xs text-muted-foreground">
            {PROPERTY_DESCRIPTIONS.ai?.model}
          </p>
          <select
            value={state.ai_model}
            onChange={(e) => onChange({ ai_model: e.target.value })}
            className="mt-1 flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          >
            {BUILDER_LLM_MODELS.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-sm font-medium">
            {PROPERTY_TITLES.ai?.temperature}
          </label>
          <p className="text-xs text-muted-foreground">
            {PROPERTY_DESCRIPTIONS.ai?.temperature}
          </p>
          <input
            type="number"
            min={0}
            max={1}
            step={0.05}
            value={state.ai_temperature}
            onChange={(e) => {
              const v = parseFloat(e.target.value);
              onChange({
                ai_temperature: Number.isFinite(v)
                  ? Math.min(1, Math.max(0, v))
                  : 0.05,
              });
            }}
            className="mt-1 flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          />
        </div>
      </div>

      <div className="space-y-3">
        <p className="text-sm font-semibold">Respuesta y memoria</p>
        <div>
          <label className="text-sm font-medium">
            {PROPERTY_TITLES.response?.waitTime}
          </label>
          <p className="text-xs text-muted-foreground">
            {PROPERTY_DESCRIPTIONS.response?.waitTime}
          </p>
          <input
            type="number"
            min={0}
            value={state.response_wait_time}
            onChange={(e) =>
              onChange({
                response_wait_time: Math.max(
                  0,
                  parseInt(e.target.value, 10) || 0,
                ),
              })
            }
            className="mt-1 flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={state.is_memory_enable}
              onChange={(e) => onChange({ is_memory_enable: e.target.checked })}
              className="size-4"
            />
            <span className="text-sm font-medium">
              {PROPERTY_TITLES.agent?.isMemoryEnable}
            </span>
          </label>
          <p className="mt-1 text-xs text-muted-foreground">
            {PROPERTY_DESCRIPTIONS.agent?.isMemoryEnable}
          </p>
        </div>
        <div>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={state.is_multi_message_response_enable}
              onChange={(e) =>
                onChange({ is_multi_message_response_enable: e.target.checked })
              }
              className="size-4"
            />
            <span className="text-sm font-medium">
              Partir la respuesta en varios mensajes
            </span>
          </label>
          <p className="mt-1 text-xs text-muted-foreground">
            Salida en varias burbujas (p. ej. WhatsApp). No confundir con
            agrupar varios mensajes del usuario.
          </p>
        </div>
      </div>

      <div className="space-y-3">
        <p className="text-sm font-semibold">Herramientas y validación</p>
        <div>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={state.is_validator_agent_enable}
              onChange={(e) =>
                onChange({ is_validator_agent_enable: e.target.checked })
              }
              className="size-4"
            />
            <span className="text-sm font-medium">
              {PROPERTY_TITLES.agent?.isValidatorAgentEnable}
            </span>
          </label>
          <p className="mt-1 text-xs text-muted-foreground">
            {PROPERTY_DESCRIPTIONS.agent?.isValidatorAgentEnable}
          </p>
        </div>
        <div>
          <label className="text-sm font-medium">
            {PROPERTY_TITLES.mcp?.maxRetries}
          </label>
          <p className="text-xs text-muted-foreground">
            {PROPERTY_DESCRIPTIONS.mcp?.maxRetries}
          </p>
          <input
            type="number"
            min={0}
            value={state.mcp_max_retries}
            onChange={(e) =>
              onChange({
                mcp_max_retries: Math.max(0, parseInt(e.target.value, 10) || 0),
              })
            }
            disabled={!state.is_validator_agent_enable}
            className="mt-1 flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm disabled:opacity-50"
          />
          {!state.is_validator_agent_enable ? (
            <p className="mt-1 text-xs text-muted-foreground">
              Activa el agente validador para editar reintentos.
            </p>
          ) : null}
        </div>
      </div>

      <div className="space-y-3">
        <p className="text-sm font-semibold">Mensajes</p>
        <div>
          <label className="text-sm font-medium">
            {PROPERTY_TITLES.answer?.notSupport}
          </label>
          <p className="text-xs text-muted-foreground">
            {PROPERTY_DESCRIPTIONS.answer?.notSupport}
          </p>
          <input
            type="text"
            value={state.answer_not_support}
            onChange={(e) =>
              onChange({ answer_not_support: e.target.value.slice(0, 500) })
            }
            className="mt-1 flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          />
        </div>
      </div>

      <div className="space-y-3 border-t pt-6">
        <p className="text-sm font-semibold">Acceso</p>
        <div>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={state.require_auth}
              onChange={(e) => onChange({ require_auth: e.target.checked })}
              className="size-4"
            />
            <span className="text-sm font-medium">Requiere autenticación</span>
          </label>
          <p className="mt-1 text-xs text-muted-foreground">
            Equivale a identificación en la configuración técnica del agente (
            <code className="text-xs">isAuthEnable</code>). Los usuarios deberán
            iniciar sesión para usar el agente cuando aplique.
          </p>
        </div>
      </div>
    </div>
  );
}
