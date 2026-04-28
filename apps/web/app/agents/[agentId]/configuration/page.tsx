"use client";

import { AgentConfigurationEditor, AgentMissingFallback } from "@/components/agents";
import { useAgentIdParam } from "@/hooks";

export default function AgentConfigurationPage() {
  const agentId = useAgentIdParam();

  if (!agentId) return <AgentMissingFallback />;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <AgentConfigurationEditor agentId={agentId} />
    </div>
  );
}
