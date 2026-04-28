"use client";

import { AgentMissingFallback, AgentToolsPanel } from "@/components/agents";
import { useAgentIdParam } from "@/hooks";

export default function AgentToolsPage() {
  const agentId = useAgentIdParam();

  if (!agentId) return <AgentMissingFallback />;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <AgentToolsPanel agentId={agentId} />
    </div>
  );
}
