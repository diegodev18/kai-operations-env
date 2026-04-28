"use client";

import { AgentMissingFallback, AgentSimulator } from "@/components/agents";
import { useAgentIdParam } from "@/hooks";

export default function AgentSimulatorPage() {
  const agentId = useAgentIdParam();

  if (!agentId) return <AgentMissingFallback />;

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <AgentSimulator agentId={agentId} />
    </div>
  );
}
