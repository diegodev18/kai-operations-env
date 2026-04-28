"use client";

import { AgentImplementationTasksPanel, AgentMissingFallback } from "@/components/agents";
import { useAgentIdParam } from "@/hooks";

export default function AgentTasksPage() {
  const agentId = useAgentIdParam();

  if (!agentId) return <AgentMissingFallback />;

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <AgentImplementationTasksPanel agentId={agentId} />
    </div>
  );
}
