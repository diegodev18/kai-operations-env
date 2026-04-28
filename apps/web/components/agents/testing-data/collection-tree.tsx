import { ChevronDownIcon, ChevronRightIcon, FolderIcon, FolderOpenIcon, PlusIcon } from "lucide-react";
import type { CollectionNode } from "./types";

export function CollectionTreeItem({
  node,
  path,
  currentPath,
  expandedPaths,
  onToggleExpand,
  onSelect,
  onCreateSubcollection,
  depth = 0,
}: {
  node: CollectionNode;
  path: string;
  currentPath: string;
  expandedPaths: Set<string>;
  onToggleExpand: (path: string) => void;
  onSelect: (path: string) => void;
  onCreateSubcollection: (parentPath: string) => void;
  depth?: number;
}) {
  const isSelected = currentPath === path;
  const isExpanded = expandedPaths.has(path);
  const hasChildren = node.subcollections.length > 0;

  return (
    <div role="treeitem" aria-expanded={hasChildren ? isExpanded : undefined} aria-selected={isSelected}>
      <div
        className={`group flex w-full items-center gap-1 rounded-md px-2 py-1.5 text-left text-sm ${
          isSelected ? "bg-muted" : "hover:bg-muted/50"
        }`}
        style={{ paddingLeft: `${depth * 12 + 8}px` }}
      >
        {hasChildren ? (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onToggleExpand(path); }}
            className="rounded p-0.5 hover:bg-muted"
            aria-label={isExpanded ? "Contraer colección" : "Expandir colección"}
          >
            {isExpanded ? (
              <ChevronDownIcon className="size-3 text-muted-foreground" />
            ) : (
              <ChevronRightIcon className="size-3 text-muted-foreground" />
            )}
          </button>
        ) : (
          <span className="w-4" aria-hidden />
        )}

        <button
          type="button"
          onClick={() => onSelect(path)}
          className="flex min-w-0 flex-1 items-center gap-1.5"
          aria-label={`Seleccionar colección ${node.name}`}
        >
          {isExpanded && hasChildren ? (
            <FolderOpenIcon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
          ) : (
            <FolderIcon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
          )}
          <span className="truncate">{node.name}</span>
        </button>

        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onCreateSubcollection(path); }}
          className="rounded p-0.5 opacity-0 hover:bg-muted group-hover:opacity-100"
          aria-label={`Crear subcolección en ${node.name}`}
        >
          <PlusIcon className="size-3 text-muted-foreground" />
        </button>
      </div>

      {isExpanded && hasChildren && (
        <div role="group">
          {node.subcollections.map((child) => (
            <CollectionTreeItem
              key={child.name}
              node={child}
              path={`${path}/${child.name}`}
              currentPath={currentPath}
              expandedPaths={expandedPaths}
              onToggleExpand={onToggleExpand}
              onSelect={onSelect}
              onCreateSubcollection={onCreateSubcollection}
              depth={depth + 1}
            />
          ))}
        </div>
      )}
    </div>
  );
}
