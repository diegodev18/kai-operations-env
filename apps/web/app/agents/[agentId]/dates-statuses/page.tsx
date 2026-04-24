"use client";

import { AgentLifecycleStatusPanel, AgentMissingFallback } from "@/components/agents";
import { useAgentIdParam } from "@/hooks";

export default function AgentLifecyclePage() {
  const agentId = useAgentIdParam();

  if (!agentId) return <AgentMissingFallback />;

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <AgentLifecycleStatusPanel agentId={agentId} />
    </div>
  );
}
