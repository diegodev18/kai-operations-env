"use client";

import { useMemo, useState } from "react";
import { XIcon } from "lucide-react";
import { Button } from "@/components/ui/button";

function parseEscalationRuleLines(raw: string): string[] {
  return raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

export function EscalationRulesInput({
  value,
  onChange,
}: {
  value: string;
  onChange: (next: string) => void;
}) {
  const items = useMemo(() => parseEscalationRuleLines(value), [value]);
  const [draft, setDraft] = useState("");

  const setItems = (next: string[]) => {
    onChange(next.join("\n"));
  };

  const addRule = () => {
    const t = draft.trim();
    if (!t) return;
    setItems([...items, t]);
    setDraft("");
  };

  const removeAt = (index: number) => {
    setItems(items.filter((_, i) => i !== index));
  };

  return (
    <div className="mt-1 space-y-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <input
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              addRule();
            }
          }}
          placeholder="Ej: Si pide hablar con un humano, ofrecer transferencia"
          className="flex h-10 min-w-0 flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm"
        />
        <Button
          type="button"
          variant="secondary"
          className="shrink-0"
          onClick={addRule}
        >
          Añadir
        </Button>
      </div>
      {items.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          Escribe una regla y pulsa Añadir o Enter. Puedes tener varias y quitar
          las que no apliquen.
        </p>
      ) : (
        <ul className="space-y-2 rounded-md border border-input bg-muted/30 p-2">
          {items.map((item, index) => (
            <li
              key={`${index}-${item.slice(0, 48)}`}
              className="flex items-start gap-2 rounded-md border border-border/60 bg-background px-3 py-2 text-sm"
            >
              <span className="mt-0.5 shrink-0 font-medium text-muted-foreground">
                {index + 1}.
              </span>
              <span className="min-w-0 flex-1 break-words">{item}</span>
              <button
                type="button"
                onClick={() => removeAt(index)}
                className="shrink-0 rounded-md p-1 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                aria-label={`Eliminar regla ${index + 1}`}
              >
                <XIcon className="size-4" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function StringListInput({
  value,
  onChange,
  placeholder,
  maxItems = 10,
}: {
  value: string[];
  onChange: (next: string[]) => void;
  placeholder: string;
  maxItems?: number;
}) {
  const [draft, setDraft] = useState("");

  const addItem = () => {
    const t = draft.trim();
    if (!t || value.length >= maxItems) return;
    onChange([...value, t]);
    setDraft("");
  };

  const removeAt = (index: number) => {
    onChange(value.filter((_, i) => i !== index));
  };

  return (
    <div className="mt-1 space-y-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <input
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              addItem();
            }
          }}
          placeholder={
            value.length >= maxItems ? `Máximo ${maxItems} items` : placeholder
          }
          disabled={value.length >= maxItems}
          className="flex h-10 min-w-0 flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm"
        />
        <Button
          type="button"
          variant="secondary"
          className="shrink-0"
          onClick={addItem}
          disabled={value.length >= maxItems}
        >
          Añadir
        </Button>
      </div>
      {value.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          Escribe un valor y pulsa Añadir o Enter.
        </p>
      ) : (
        <ul className="flex flex-wrap gap-2">
          {value.map((item, index) => (
            <li
              key={`${index}-${item.slice(0, 48)}`}
              className="flex items-center gap-1 rounded-full border border-border bg-muted/30 px-3 py-1 text-sm"
            >
              <span className="break-words">{item}</span>
              <button
                type="button"
                onClick={() => removeAt(index)}
                className="rounded-md p-0.5 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                aria-label={`Eliminar ${item}`}
              >
                <XIcon className="size-3" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
