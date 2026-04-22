"use client";

import { useMemo, useState } from "react";

import { Input } from "@/components/ui/input";
import type { ToolsCatalogItem } from "@/types";

export function ToolsCatalogSearchList({
  tools,
  loading = false,
  maxItems = 60,
  value,
  onValueChange,
  onSelect,
  placeholder = "Buscar tool...",
}: {
  tools: ToolsCatalogItem[];
  loading?: boolean;
  maxItems?: number;
  value: string;
  onValueChange: (next: string) => void;
  onSelect: (tool: ToolsCatalogItem) => void;
  placeholder?: string;
}) {
  const [hasFocus, setHasFocus] = useState(false);
  const q = value.trim().toLowerCase();
  const filtered = useMemo(() => {
    const list = tools.filter((item) => {
      if (!q) return true;
      return (
        item.name.toLowerCase().includes(q) ||
        (item.displayName ?? "").toLowerCase().includes(q) ||
        item.description.toLowerCase().includes(q)
      );
    });
    return list.slice(0, maxItems);
  }, [maxItems, q, tools]);

  return (
    <div className="space-y-2">
      <Input
        value={value}
        onChange={(event) => onValueChange(event.target.value)}
        onFocus={() => setHasFocus(true)}
        onBlur={() => setTimeout(() => setHasFocus(false), 120)}
        placeholder={loading ? "Cargando catálogo..." : placeholder}
        autoComplete="off"
      />
      {hasFocus || q ? (
        <div className="max-h-[320px] space-y-2 overflow-y-auto rounded-md border p-2">
          {filtered.map((item) => (
            <button
              key={item.id}
              type="button"
              className="w-full rounded-md border p-2 text-left hover:bg-accent"
              onMouseDown={(event) => {
                event.preventDefault();
                onSelect(item);
              }}
            >
              <p className="text-sm font-medium">{item.displayName || item.name}</p>
              <p className="text-xs text-muted-foreground">{item.name}</p>
              <p className="mt-1 text-xs text-muted-foreground">{item.description}</p>
            </button>
          ))}
          {filtered.length === 0 ? (
            <p className="py-3 text-center text-xs text-muted-foreground">
              No hay tools para ese filtro.
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
