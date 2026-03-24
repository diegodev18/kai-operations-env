"use client";

import { useCallback, useState } from "react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type {
  BuilderChatUI,
  BuilderChatUIForm,
  BuilderChatUIOptions,
} from "@/types/agents-api";
import { cn } from "@/lib/utils";

const MAX_OPTIONS = 8;
const MAX_FORM_FIELDS = 12;
const MAX_FIELD_VALUE_LEN = 4000;

export type BuilderChatUiBlockProps = {
  ui: BuilderChatUI;
  disabled?: boolean;
  /** `payload` va al API; `displayText` es lo que ve el usuario en la burbuja. */
  onSend: (payload: string, displayText?: string) => void | Promise<void>;
};

function BuilderChatUIOptionsSingleBlock({
  ui,
  disabled,
  onSend,
}: {
  ui: BuilderChatUIOptions;
  disabled?: boolean;
  onSend: (payload: string, displayText?: string) => void | Promise<void>;
}) {
  const opts = ui.options.slice(0, MAX_OPTIONS);
  return (
    <div
      className={cn(
        "mt-3 space-y-2 border-t border-border/60 pt-3",
        disabled && "pointer-events-none opacity-60",
      )}
    >
      {ui.title ? (
        <p className="text-xs font-medium text-muted-foreground">{ui.title}</p>
      ) : null}
      <div className="flex flex-wrap gap-2">
        {opts.map((opt) => (
          <Button
            key={opt.id}
            type="button"
            variant="outline"
            size="sm"
            className={cn(
              "h-auto max-w-full whitespace-normal py-2 text-left text-xs",
              "border-border bg-card shadow-xs transition-all duration-150",
              "hover:border-primary hover:bg-primary/12 hover:text-foreground hover:shadow-md",
              "active:scale-[0.99]",
              "dark:hover:bg-primary/20",
              "disabled:pointer-events-none disabled:opacity-50",
            )}
            disabled={disabled}
            onClick={() => {
              void onSend(
                `UI_VALUE:${ui.uiId}:${encodeURIComponent(opt.value)}`,
                opt.label.trim() || opt.value,
              );
            }}
          >
            {opt.label}
          </Button>
        ))}
      </div>
    </div>
  );
}

function BuilderChatUIOptionsMultiBlock({
  ui,
  disabled,
  onSend,
}: {
  ui: BuilderChatUIOptions;
  disabled?: boolean;
  onSend: (payload: string, displayText?: string) => void | Promise<void>;
}) {
  const opts = ui.options.slice(0, MAX_OPTIONS);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());

  const toggle = useCallback((id: string, checked: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }, []);

  const handleConfirm = useCallback(() => {
    const selected = opts.filter((o) => selectedIds.has(o.id));
    const payload = {
      selected: selected.map((o) => ({
        id: o.id,
        value: o.value,
        label: o.label,
      })),
    };
    const text = `UI_MULTI:${ui.uiId}:${JSON.stringify(payload)}`;
    const displayText =
      selected.length === 0
        ? "Ninguna opción seleccionada"
        : selected.map((o) => o.label.trim()).join(", ");
    void onSend(text, displayText);
  }, [onSend, opts, selectedIds, ui.uiId]);

  const submitLabel = ui.submitLabel?.trim() || "Aplicar selección";

  return (
    <div
      className={cn(
        "mt-3 space-y-3 border-t border-border/60 pt-3",
        disabled && "pointer-events-none opacity-60",
      )}
    >
      {ui.title ? (
        <p className="text-xs font-medium text-muted-foreground">{ui.title}</p>
      ) : null}
      <div className="flex flex-col gap-2">
        {opts.map((opt) => {
          const inputId = `builder-opt-${ui.uiId}-${opt.id}`;
          return (
            <div
              key={opt.id}
              className={cn(
                "flex items-start gap-3 rounded-lg border border-border bg-card px-3 py-2.5 shadow-xs transition-all duration-150",
                "hover:border-primary hover:bg-primary/10 dark:hover:bg-primary/15",
                disabled && "opacity-60",
              )}
            >
              <Checkbox
                id={inputId}
                checked={selectedIds.has(opt.id)}
                disabled={disabled}
                onCheckedChange={(c) => toggle(opt.id, c === true)}
                className="mt-0.5"
              />
              <label
                htmlFor={inputId}
                className={cn(
                  "flex-1 cursor-pointer text-left text-xs leading-snug text-foreground",
                  disabled && "cursor-not-allowed",
                )}
              >
                {opt.label}
              </label>
            </div>
          );
        })}
      </div>
      <Button
        type="button"
        size="sm"
        variant="default"
        disabled={disabled}
        className="w-full sm:w-auto"
        onClick={handleConfirm}
      >
        {submitLabel}
      </Button>
    </div>
  );
}

function BuilderChatUIOptionsBlock({
  ui,
  disabled,
  onSend,
}: {
  ui: BuilderChatUIOptions;
  disabled?: boolean;
  onSend: (payload: string, displayText?: string) => void | Promise<void>;
}) {
  if (ui.multiSelect === true) {
    return (
      <BuilderChatUIOptionsMultiBlock ui={ui} disabled={disabled} onSend={onSend} />
    );
  }
  return (
    <BuilderChatUIOptionsSingleBlock ui={ui} disabled={disabled} onSend={onSend} />
  );
}

function buildFormPayload(values: Record<string, string>): string {
  const cleaned: Record<string, string> = {};
  for (const [k, v] of Object.entries(values)) {
    const t = v.trim();
    if (t) cleaned[k] = t.slice(0, MAX_FIELD_VALUE_LEN);
  }
  return JSON.stringify(cleaned);
}

function BuilderChatUIFormBlock({
  ui,
  disabled,
  onSend,
}: {
  ui: BuilderChatUIForm;
  disabled?: boolean;
  onSend: (payload: string, displayText?: string) => void | Promise<void>;
}) {
  const fields = ui.fields.slice(0, MAX_FORM_FIELDS);

  const [values, setValues] = useState<Record<string, string>>(() => {
    const next: Record<string, string> = {};
    for (const f of ui.fields.slice(0, MAX_FORM_FIELDS)) next[f.key] = "";
    return next;
  });

  const setField = useCallback((key: string, v: string) => {
    setValues((prev) => ({ ...prev, [key]: v.slice(0, MAX_FIELD_VALUE_LEN) }));
  }, []);

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      for (const f of fields) {
        if (f.required && !String(values[f.key] ?? "").trim()) {
          return;
        }
      }
      const payload = buildFormPayload(values);
      let displayText = "Formulario enviado";
      try {
        const obj = JSON.parse(payload) as Record<string, string>;
        const parts = Object.entries(obj)
          .filter(([, v]) => v.trim())
          .slice(0, 3)
          .map(([, v]) => v.trim());
        if (parts.length > 0) {
          displayText = parts.join(" · ");
        }
      } catch {
        /* keep default */
      }
      void onSend(`UI_FORM:${ui.formId}:${payload}`, displayText);
    },
    [fields, onSend, ui.formId, values],
  );

  return (
    <form
      className={cn(
        "mt-3 space-y-3 border-t border-border/60 pt-3",
        disabled && "pointer-events-none opacity-60",
      )}
      onSubmit={handleSubmit}
    >
      {ui.title ? (
        <p className="text-xs font-medium text-muted-foreground">{ui.title}</p>
      ) : null}
      <div className="space-y-3">
        {fields.map((field) => (
          <div key={field.key} className="space-y-1.5">
            <Label className="text-xs">
              {field.label}
              {field.required ? <span className="text-destructive"> *</span> : null}
            </Label>
            {field.kind === "text" ? (
              <Input
                value={values[field.key] ?? ""}
                onChange={(e) => setField(field.key, e.target.value)}
                placeholder={field.placeholder}
                disabled={disabled}
                className="text-sm"
              />
            ) : null}
            {field.kind === "textarea" ? (
              <Textarea
                value={values[field.key] ?? ""}
                onChange={(e) => setField(field.key, e.target.value)}
                placeholder={field.placeholder}
                disabled={disabled}
                className="min-h-[88px] text-sm"
              />
            ) : null}
            {field.kind === "select" && field.options?.length ? (
              <Select
                value={values[field.key] ?? ""}
                onValueChange={(v) => setField(field.key, v)}
                disabled={disabled}
              >
                <SelectTrigger className="w-full max-w-full text-sm">
                  <SelectValue placeholder={field.placeholder ?? "Elige…"} />
                </SelectTrigger>
                <SelectContent>
                  {field.options.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : null}
          </div>
        ))}
      </div>
      <Button type="submit" size="sm" disabled={disabled}>
        {ui.submitLabel?.trim() || "Enviar"}
      </Button>
    </form>
  );
}

export function BuilderChatUiBlock({ ui, disabled, onSend }: BuilderChatUiBlockProps) {
  if (ui.type === "options") {
    return <BuilderChatUIOptionsBlock ui={ui} disabled={disabled} onSend={onSend} />;
  }
  return (
    <BuilderChatUIFormBlock
      key={`${ui.formId}-${ui.uiId}`}
      ui={ui}
      disabled={disabled}
      onSend={onSend}
    />
  );
}
