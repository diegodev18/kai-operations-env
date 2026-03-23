"use client";

import { useCallback, useState } from "react";

import { Button } from "@/components/ui/button";
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

const MAX_OPTIONS = 8;
const MAX_FORM_FIELDS = 12;
const MAX_FIELD_VALUE_LEN = 4000;

export type BuilderChatUiBlockProps = {
  ui: BuilderChatUI;
  disabled?: boolean;
  onSend: (text: string) => void | Promise<void>;
};

function BuilderChatUIOptionsBlock({
  ui,
  disabled,
  onSend,
}: {
  ui: BuilderChatUIOptions;
  disabled?: boolean;
  onSend: (text: string) => void | Promise<void>;
}) {
  const opts = ui.options.slice(0, MAX_OPTIONS);
  return (
    <div className="mt-3 space-y-2 border-t border-border/60 pt-3">
      {ui.title ? (
        <p className="text-xs font-medium text-muted-foreground">{ui.title}</p>
      ) : null}
      <div className="flex flex-wrap gap-2">
        {opts.map((opt) => (
          <Button
            key={opt.id}
            type="button"
            variant="secondary"
            size="sm"
            className="h-auto max-w-full whitespace-normal py-1.5 text-left text-xs"
            disabled={disabled}
            onClick={() => {
              void onSend(`UI_VALUE:${ui.uiId}:${encodeURIComponent(opt.value)}`);
            }}
          >
            {opt.label}
          </Button>
        ))}
      </div>
    </div>
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
  onSend: (text: string) => void | Promise<void>;
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
      void onSend(`UI_FORM:${ui.formId}:${payload}`);
    },
    [fields, onSend, ui.formId, values],
  );

  return (
    <form
      className="mt-3 space-y-3 border-t border-border/60 pt-3"
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
