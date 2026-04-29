"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { PanelError } from "@/components/agents/panel-states";
import { PromoteDiffDialog } from "@/components/prompt";
import { ToolsPullFromProductionDialog } from "@/components/agents/tools-pull-from-production-dialog";
import { updateAgentTool, useAgentTools, useTestingDiff } from "@/hooks";
import { fetchAgentById } from "@/services/agents-api";
import type { AgentTool } from "@/types";

import { AddToolDialog } from "./add-tool-dialog";
import { DeleteToolDialog } from "./delete-tool-dialog";
import { EditToolDialog } from "./edit-tool-dialog";
import {
  ToolsEmptyState,
  ToolsList,
  ToolsListSkeleton,
  ToolsNoMatchesState,
} from "./tools-list";
import { ToolsDiffFooter } from "./tools-diff-footer";
import { ToolsToolbar } from "./tools-toolbar";
import type { ToolEnabledFilter, ToolTypeFilter } from "./types";

export function AgentToolsPanel({ agentId }: { agentId: string }) {
  return <ToolsPanel agentId={agentId} />;
}

function ToolsPanel({ agentId }: { agentId: string }) {
  const {
    tools,
    isLoading,
    error: toolsLoadError,
    refetch,
  } = useAgentTools(agentId);
  const [addOpen, setAddOpen] = useState(false);
  const [editTool, setEditTool] = useState<AgentTool | null>(null);
  const [deleteTool, setDeleteTool] = useState<AgentTool | null>(null);
  const [togglingToolId, setTogglingToolId] = useState<string | null>(null);
  const [syncingFromProd, setSyncingFromProd] = useState(false);
  const [pullDialogOpen, setPullDialogOpen] = useState(false);
  const [promoteDialogOpen, setPromoteDialogOpen] = useState(false);
  const [agentNameForConfirm, setAgentNameForConfirm] = useState("");
  const {
    data: diffData,
    isLoading: isDiffLoading,
    refetch: refetchDiff,
  } = useTestingDiff(agentId);

  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<ToolTypeFilter>("all");
  const [enabledFilter, setEnabledFilter] = useState<ToolEnabledFilter>("all");

  useEffect(() => {
    if (!agentId) return;
    let cancelled = false;
    (async () => {
      const agent = await fetchAgentById(agentId);
      if (!cancelled && agent) {
        setAgentNameForConfirm(agent.agentName || agent.name || agentId);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [agentId]);

  const handlePromoteSuccess = useCallback(async () => {
    await refetch();
    refetchDiff();
  }, [refetch, refetchDiff]);

  const toolsDiff = useMemo(
    () => (diffData || []).filter((d) => d.collection === "tools"),
    [diffData],
  );
  const hasLocalDialogChanges = addOpen || editTool !== null;

  const handleToggleEnabled = useCallback(
    async (tool: AgentTool, newEnabled: boolean) => {
      setTogglingToolId(tool.id);
      try {
        const updated = await updateAgentTool(agentId, tool.id, {
          enabled: newEnabled,
        });
        if (updated) {
          toast.success(
            newEnabled ? "Tool habilitada" : "Tool deshabilitada",
          );
          void refetch();
          refetchDiff();
        }
      } finally {
        setTogglingToolId(null);
      }
    },
    [agentId, refetch, refetchDiff],
  );

  const afterToolsMutation = useCallback(() => {
    void refetch();
    refetchDiff();
  }, [refetch, refetchDiff]);

  const enabledCount = useMemo(
    () => tools.filter((tool) => tool.enabled !== false).length,
    [tools],
  );

  const filteredTools = useMemo(() => {
    const q = query.trim().toLowerCase();
    return tools.filter((tool) => {
      if (typeFilter !== "all" && tool.type !== typeFilter) return false;
      const isEnabled = tool.enabled !== false;
      if (enabledFilter === "enabled" && !isEnabled) return false;
      if (enabledFilter === "disabled" && isEnabled) return false;
      if (!q) return true;
      const haystack = [
        tool.name,
        tool.displayName ?? "",
        tool.description,
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [tools, query, typeFilter, enabledFilter]);

  const clearFilters = useCallback(() => {
    setQuery("");
    setTypeFilter("all");
    setEnabledFilter("all");
  }, []);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="min-h-0 w-full flex-1 space-y-4 overflow-y-auto pb-4">
        <div className="sticky top-0 z-10 -mx-1 bg-background px-1 pb-2 pt-0.5">
          <ToolsToolbar
            totalCount={tools.length}
            enabledCount={enabledCount}
            filteredCount={filteredTools.length}
            query={query}
            onQueryChange={setQuery}
            typeFilter={typeFilter}
            onTypeFilterChange={setTypeFilter}
            enabledFilter={enabledFilter}
            onEnabledFilterChange={setEnabledFilter}
            onAddTool={() => setAddOpen(true)}
          />
        </div>

        {isLoading ? (
          <ToolsListSkeleton />
        ) : toolsLoadError ? (
          <PanelError
            message={toolsLoadError}
            onRetry={() => void refetch()}
          />
        ) : tools.length === 0 ? (
          <ToolsEmptyState onAddTool={() => setAddOpen(true)} />
        ) : filteredTools.length === 0 ? (
          <ToolsNoMatchesState onClearFilters={clearFilters} />
        ) : (
          <ToolsList
            tools={filteredTools}
            togglingToolId={togglingToolId}
            onToggleEnabled={handleToggleEnabled}
            onEdit={setEditTool}
            onDelete={setDeleteTool}
          />
        )}
      </div>

      <AddToolDialog
        agentId={agentId}
        open={addOpen}
        onOpenChange={setAddOpen}
        onSuccess={() => {
          setAddOpen(false);
          afterToolsMutation();
        }}
      />

      {editTool ? (
        <EditToolDialog
          agentId={agentId}
          tool={editTool}
          open={!!editTool}
          onOpenChange={(o) => !o && setEditTool(null)}
          onSuccess={() => {
            setEditTool(null);
            afterToolsMutation();
          }}
        />
      ) : null}

      {deleteTool ? (
        <DeleteToolDialog
          agentId={agentId}
          tool={deleteTool}
          open={!!deleteTool}
          onOpenChange={(o) => !o && setDeleteTool(null)}
          onSuccess={() => {
            setDeleteTool(null);
            afterToolsMutation();
          }}
        />
      ) : null}

      <ToolsDiffFooter
        diffCount={toolsDiff.length}
        isDiffLoading={isDiffLoading}
        syncingFromProd={syncingFromProd}
        hasOpenDialog={hasLocalDialogChanges}
        onPullClick={() => {
          refetchDiff();
          setPullDialogOpen(true);
        }}
        onPromoteClick={() => {
          refetchDiff();
          setPromoteDialogOpen(true);
        }}
      />

      <ToolsPullFromProductionDialog
        open={pullDialogOpen}
        onOpenChange={setPullDialogOpen}
        diff={toolsDiff}
        isLoading={isDiffLoading}
        agentId={agentId}
        syncing={syncingFromProd}
        onSyncingChange={setSyncingFromProd}
        onSuccess={handlePromoteSuccess}
      />

      <PromoteDiffDialog
        open={promoteDialogOpen}
        onOpenChange={setPromoteDialogOpen}
        diff={toolsDiff}
        isLoading={isDiffLoading}
        agentId={agentId}
        agentNameForConfirm={agentNameForConfirm}
        onSuccess={handlePromoteSuccess}
        dialogTitle="Subir cambios (tools)"
        dialogDescription={
          <>
            Solo se promueven los campos de{" "}
            <span className="font-medium text-foreground">tools</span> que
            selecciones desde el estado{" "}
            <span className="font-medium text-foreground">guardado</span> en
            testing (no incluye borradores abiertos en diálogos). Escribe{" "}
            <span className="font-medium text-foreground">CONFIRMAR</span> para
            continuar.
          </>
        }
        contentClassName="max-h-[min(90vh,48rem)] overflow-y-auto sm:max-w-3xl"
      />

    </div>
  );
}
