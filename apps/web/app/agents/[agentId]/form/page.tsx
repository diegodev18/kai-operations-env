"use client";

import { AgentBuilderFormReadonly, AgentMissingFallback } from "@/components/agents";
import { useAgentIdParam } from "@/hooks";

export default function AgentFormPage() {
  const agentId = useAgentIdParam();

  if (!agentId) return <AgentMissingFallback />;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <AgentBuilderFormReadonly agentId={agentId} />
    </div>
  );
}
