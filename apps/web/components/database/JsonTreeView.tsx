"use client";

import { useState, useCallback } from "react";
import { ChevronRightIcon, ChevronDownIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { isTimestamp, isGeoPoint, type TimestampLike, type GeoPointLike } from "./json-tree-view-utils";

function formatTimestamp(value: TimestampLike): string {
  const sec = value._seconds ?? 0;
  return new Date(sec * 1000).toLocaleString();
}

function formatGeoPoint(value: GeoPointLike): string {
  const lat = value._latitude ?? 0;
  const lng = value._longitude ?? 0;
  return `{ ${lat}, ${lng} }`;
}

function valueMatchesSearch(value: unknown, searchTerm: string): boolean {
  if (!searchTerm.trim()) return true;
  const q = searchTerm.trim().toLowerCase();
  if (typeof value === "string") return value.toLowerCase().includes(q);
  if (typeof value === "number" || typeof value === "boolean") return String(value).toLowerCase().includes(q);
  if (value === null) return "null".includes(q);
  return false;
}

interface JsonTreeViewProps {
  data: unknown;
  searchTerm?: string;
  defaultExpanded?: boolean;
  expandedPaths?: Set<string>;
  onExpandedPathsChange?: (paths: Set<string>) => void;
  path?: string;
  depth?: number;
}

function JsonNode({
  data,
  searchTerm = "",
  defaultExpanded = false,
  expandedPaths,
  onExpandedPathsChange,
  path = "",
  depth = 0,
}: JsonTreeViewProps) {
  const controlled = expandedPaths !== undefined && onExpandedPathsChange !== undefined;
  const isExpanded = controlled ? expandedPaths.has(path) : defaultExpanded;
  const toggle = useCallback(() => {
    if (!controlled) return;
    const next = new Set(expandedPaths);
    if (next.has(path)) next.delete(path);
    else next.add(path);
    onExpandedPathsChange(next);
  }, [controlled, path, expandedPaths, onExpandedPathsChange]);

  const hasMatch =
    searchTerm &&
    (path.toLowerCase().includes(searchTerm.trim().toLowerCase()) ||
      valueMatchesSearch(data, searchTerm));

  if (data === null) {
    return <span className="text-muted-foreground italic">null</span>;
  }
  if (data === undefined) {
    return <span className="text-muted-foreground italic">undefined</span>;
  }
  if (typeof data === "boolean") {
    return <span className="text-blue-600 dark:text-blue-400">{String(data)}</span>;
  }
  if (typeof data === "number") {
    return <span className="text-emerald-600 dark:text-emerald-400">{String(data)}</span>;
  }
  if (typeof data === "string") {
    return (
      <span className="text-amber-700 dark:text-amber-300 break-all">
        &quot;{data}&quot;
      </span>
    );
  }
  if (isTimestamp(data)) {
    return (
      <span className="text-purple-600 dark:text-purple-400" title={JSON.stringify(data)}>
        {formatTimestamp(data)}
      </span>
    );
  }
  if (isGeoPoint(data)) {
    return <span className="text-cyan-600 dark:text-cyan-400">{formatGeoPoint(data)}</span>;
  }
  if (Array.isArray(data)) {
    const isEmpty = data.length === 0;
    const key = path || "root";
    const expanded = controlled ? isExpanded : defaultExpanded || hasMatch;
    return (
      <span className="inline">
        <button
          type="button"
          onClick={controlled ? toggle : undefined}
          className={cn("inline-flex items-center gap-0.5 rounded hover:bg-muted/60", !controlled && "cursor-default")}
          aria-expanded={!!expanded}
        >
          {!isEmpty && (controlled || !defaultExpanded) ? (
            expanded ? (
              <ChevronDownIcon className="w-3.5 h-3.5 shrink-0" />
            ) : (
              <ChevronRightIcon className="w-3.5 h-3.5 shrink-0" />
            )
          ) : null}
        </button>
        <span className="text-muted-foreground">[</span>
        {isEmpty && <span className="text-muted-foreground">]</span>}
        {!isEmpty && expanded && (
          <span className="block pl-4">
            {data.map((item, i) => (
              <div key={i} className="flex gap-2">
                <span className="text-muted-foreground shrink-0">{i}:</span>
                <JsonNode
                  data={item}
                  searchTerm={searchTerm}
                  defaultExpanded={defaultExpanded}
                  expandedPaths={expandedPaths}
                  onExpandedPathsChange={onExpandedPathsChange}
                  path={`${key}.${i}`}
                  depth={depth + 1}
                />
              </div>
            ))}
            <span className="text-muted-foreground">]</span>
          </span>
        )}
        {!isEmpty && !expanded && <span className="text-muted-foreground">{data.length} items…</span>}
      </span>
    );
  }
  if (typeof data === "object") {
    const obj = data as Record<string, unknown>;
    const keys = Object.keys(obj);
    const isEmpty = keys.length === 0;
    const key = path || "root";
    const expanded = controlled ? isExpanded : defaultExpanded || hasMatch;
    return (
      <span className="inline">
        <button
          type="button"
          onClick={controlled ? toggle : undefined}
          className={cn("inline-flex items-center gap-0.5 rounded hover:bg-muted/60", !controlled && "cursor-default")}
          aria-expanded={!!expanded}
        >
          {!isEmpty && (controlled || !defaultExpanded) ? (
            expanded ? (
              <ChevronDownIcon className="w-3.5 h-3.5 shrink-0" />
            ) : (
              <ChevronRightIcon className="w-3.5 h-3.5 shrink-0" />
            )
          ) : null}
        </button>
        <span className="text-muted-foreground">{"{"}</span>
        {isEmpty && <span className="text-muted-foreground">{"}"}</span>}
        {!isEmpty && expanded && (
          <span className="block pl-4">
            {keys.map((k) => (
              <div key={k} className="flex gap-2 flex-wrap">
                <span className="text-foreground font-medium shrink-0 break-all">{k}:</span>
                <JsonNode
                  data={obj[k]}
                  searchTerm={searchTerm}
                  defaultExpanded={defaultExpanded}
                  expandedPaths={expandedPaths}
                  onExpandedPathsChange={onExpandedPathsChange}
                  path={`${key}.${k}`}
                  depth={depth + 1}
                />
              </div>
            ))}
            <span className="text-muted-foreground">{"}"}</span>
          </span>
        )}
        {!isEmpty && !expanded && <span className="text-muted-foreground">…{keys.length} keys</span>}
      </span>
    );
  }
  return <span>{String(data)}</span>;
}

export interface JsonTreeViewRootProps {
  data: unknown;
  searchTerm?: string;
  defaultExpanded?: boolean;
  className?: string;
  expandedPaths?: Set<string>;
  onExpandedPathsChange?: (paths: Set<string>) => void;
}

export function JsonTreeView({
  data,
  searchTerm = "",
  defaultExpanded = false,
  className,
  expandedPaths: controlledExpanded,
  onExpandedPathsChange,
}: JsonTreeViewRootProps) {
  const [internalExpanded, setInternalExpanded] = useState<Set<string>>(new Set(["root"]));
  const expandedPaths = controlledExpanded ?? internalExpanded;
  const setExpandedPaths = onExpandedPathsChange ?? setInternalExpanded;

  return (
    <div className={cn("text-sm font-mono overflow-auto", className)} data-json-tree>
      <JsonNode
        data={data}
        searchTerm={searchTerm}
        defaultExpanded={defaultExpanded}
        expandedPaths={expandedPaths}
        onExpandedPathsChange={setExpandedPaths}
        path="root"
      />
    </div>
  );
}