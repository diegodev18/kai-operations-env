"use client";

import { useMemo } from "react";
import { cn } from "@/lib/utils";
import type { AgentFlowQuestion } from "@/lib/form-builder-constants";

const FLOW_SELECT_OTRO = "\nOtro:";
const FLOW_SUGGEST_EXTRA_SEP = " | ";

export function parseFlowSelectValue(value: string, options: string[]) {
  const i = value.indexOf(FLOW_SELECT_OTRO);
  if (i >= 0) {
    const main = value.slice(0, i).trim();
    const rest = value.slice(i + FLOW_SELECT_OTRO.length);
    if (options.includes(main)) return { main, other: rest };
    return { main: "", other: value };
  }
  const t = value.trim();
  if (options.includes(t)) return { main: t, other: "" };
  return { main: "", other: value };
}

export function composeFlowSelect(main: string, other: string) {
  const hasOther = other.trim().length > 0;
  if (!main && !hasOther) return "";
  if (main && hasOther) return `${main}${FLOW_SELECT_OTRO}${other}`;
  if (main) return main;
  return other;
}

export function parseFlowSuggestionsMulti(value: string, suggestions: string[]) {
  const idx = value.indexOf(FLOW_SUGGEST_EXTRA_SEP);
  const headRaw = idx < 0 ? value : value.slice(0, idx);
  const extraRaw =
    idx < 0 ? "" : value.slice(idx + FLOW_SUGGEST_EXTRA_SEP.length);
  const tokens = headRaw
    ? headRaw
        .split(";")
        .map((s) => s.trim())
        .filter(Boolean)
    : [];
  const picked = tokens.filter((t) => suggestions.includes(t));
  if (picked.length === 0 && idx < 0) {
    return { picked: new Set<string>(), extra: value };
  }
  const stray = tokens.filter((t) => !suggestions.includes(t)).join("; ");
  if (!stray) return { picked: new Set(picked), extra: extraRaw };
  if (!extraRaw.trim()) return { picked: new Set(picked), extra: stray };
  return { picked: new Set(picked), extra: `${stray}; ${extraRaw}` };
}

export function composeFlowSuggestionsMulti(picked: Set<string>, extra: string) {
  const chips = [...picked].join("; ");
  const hasExtra = extra.trim().length > 0;
  if (chips && hasExtra) return `${chips}${FLOW_SUGGEST_EXTRA_SEP}${extra}`;
  if (chips) return chips;
  return extra;
}

export function parseFlowSuggestionsSingle(value: string, suggestions: string[]) {
  const idx = value.indexOf(FLOW_SUGGEST_EXTRA_SEP);
  const head = (idx < 0 ? value : value.slice(0, idx)).trim();
  const extra = idx < 0 ? "" : value.slice(idx + FLOW_SUGGEST_EXTRA_SEP.length);
  if (suggestions.includes(head)) return { picked: head, extra };
  return { picked: "", extra: value };
}

export function composeFlowSuggestionsSingle(picked: string, extra: string) {
  const hasExtra = extra.trim().length > 0;
  if (picked && hasExtra) return `${picked}${FLOW_SUGGEST_EXTRA_SEP}${extra}`;
  return picked || extra;
}

export function FlowSelectChips({
  options,
  value,
  onChange,
  disabled,
}: {
  options: string[];
  value: string;
  onChange: (v: string) => void;
  disabled: boolean;
}) {
  const { main, other } = parseFlowSelectValue(value, options);
  return (
    <div className="mt-1 space-y-3">
      <p className="text-xs text-muted-foreground">
        Elige una opción (puedes pulsar un ejemplo). Opcional: detalle u otra
        respuesta abajo.
      </p>
      <div className="flex flex-wrap gap-2">
        {options.map((opt) => (
          <button
            key={opt}
            type="button"
            disabled={disabled}
            onClick={() =>
              onChange(composeFlowSelect(main === opt ? "" : opt, other))
            }
            className={cn(
              "rounded-full border px-3 py-1.5 text-left text-sm transition-colors",
              main === opt
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border bg-background hover:bg-muted/80",
            )}
          >
            {opt}
          </button>
        ))}
      </div>
      <div>
        <label className="text-xs font-medium text-muted-foreground">
          Otro / aclarar
        </label>
        <textarea
          value={other}
          onChange={(e) => onChange(composeFlowSelect(main, e.target.value))}
          disabled={disabled}
          rows={2}
          placeholder="Texto libre si ninguna opción encaja del todo…"
          className="mt-1 flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
        />
      </div>
    </div>
  );
}

export function FlowSuggestionsMulti({
  suggestions,
  value,
  onChange,
  disabled,
  rows,
}: {
  suggestions: string[];
  value: string;
  onChange: (v: string) => void;
  disabled: boolean;
  rows: number;
}) {
  const { picked, extra } = useMemo(
    () => parseFlowSuggestionsMulti(value, suggestions),
    [value, suggestions],
  );
  const toggle = (label: string) => {
    const next = new Set(picked);
    if (next.has(label)) next.delete(label);
    else next.add(label);
    onChange(composeFlowSuggestionsMulti(next, extra));
  };
  return (
    <div className="mt-1 space-y-3">
      <p className="text-xs text-muted-foreground">
        Puedes elegir varias respuestas ejemplo. Añade detalle u otra
        información abajo.
      </p>
      <div className="flex flex-wrap gap-2">
        {suggestions.map((s) => (
          <button
            key={s}
            type="button"
            disabled={disabled}
            onClick={() => toggle(s)}
            className={cn(
              "rounded-full border px-3 py-1.5 text-left text-sm transition-colors",
              picked.has(s)
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border bg-background hover:bg-muted/80",
            )}
          >
            {s}
          </button>
        ))}
      </div>
      <textarea
        value={extra}
        onChange={(e) =>
          onChange(composeFlowSuggestionsMulti(picked, e.target.value))
        }
        disabled={disabled}
        rows={rows}
        placeholder="Otro contexto o detalle adicional…"
        className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
      />
    </div>
  );
}

export function FlowSuggestionsSingle({
  suggestions,
  value,
  onChange,
  disabled,
  rows,
}: {
  suggestions: string[];
  value: string;
  onChange: (v: string) => void;
  disabled: boolean;
  rows: number;
}) {
  const { picked, extra } = useMemo(
    () => parseFlowSuggestionsSingle(value, suggestions),
    [value, suggestions],
  );
  return (
    <div className="mt-1 space-y-3">
      <p className="text-xs text-muted-foreground">
        Una respuesta ejemplo, o escribe en &quot;Otro&quot; abajo.
      </p>
      <div className="flex flex-wrap gap-2">
        {suggestions.map((s) => (
          <button
            key={s}
            type="button"
            disabled={disabled}
            onClick={() =>
              onChange(
                composeFlowSuggestionsSingle(picked === s ? "" : s, extra),
              )
            }
            className={cn(
              "rounded-full border px-3 py-1.5 text-left text-sm transition-colors",
              picked === s
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border bg-background hover:bg-muted/80",
            )}
          >
            {s}
          </button>
        ))}
      </div>
      <textarea
        value={extra}
        onChange={(e) =>
          onChange(composeFlowSuggestionsSingle(picked, e.target.value))
        }
        disabled={disabled}
        rows={rows}
        placeholder="Otro / complementar la respuesta…"
        className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
      />
    </div>
  );
}

export function FlowQuestionField({
  q,
  value,
  onChange,
  disabled,
}: {
  q: AgentFlowQuestion;
  value: string;
  onChange: (v: string) => void;
  disabled: boolean;
}) {
  if (q.type === "select" && q.options?.length) {
    return (
      <FlowSelectChips
        options={q.options}
        value={value}
        onChange={onChange}
        disabled={disabled}
      />
    );
  }
  if ((q.type === "text" || q.type === "textarea") && q.suggestions?.length) {
    const mode =
      q.suggestion_mode ?? (q.type === "textarea" ? "multi" : "single");
    const rows = q.type === "textarea" ? 3 : 2;
    return mode === "multi" ? (
      <FlowSuggestionsMulti
        suggestions={q.suggestions}
        value={value}
        onChange={onChange}
        disabled={disabled}
        rows={rows}
      />
    ) : (
      <FlowSuggestionsSingle
        suggestions={q.suggestions}
        value={value}
        onChange={onChange}
        disabled={disabled}
        rows={rows}
      />
    );
  }
  if (q.type === "textarea") {
    return (
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={q.placeholder}
        rows={3}
        disabled={disabled}
        className="mt-1 flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
      />
    );
  }
  return (
    <input
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={q.placeholder}
      disabled={disabled}
      className="mt-1 flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
    />
  );
}
