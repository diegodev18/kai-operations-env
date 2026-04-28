"use client";

import { useEffect, useState } from "react";
import { AgentMissingFallback, AgentPromptDesigner } from "@/components/agents";
import { useAgentIdParam } from "@/hooks";
import { fetchAgentById } from "@/services/agents-api";

export default function AgentPromptDesignPage() {
  const agentId = useAgentIdParam();
  const [agentName, setAgentName] = useState<string | undefined>();

  useEffect(() => {
    if (!agentId) return;
    let cancelled = false;
    (async () => {
      const a = await fetchAgentById(agentId);
      if (!cancelled && a?.name) setAgentName(a.name);
    })();
    return () => {
      cancelled = true;
    };
  }, [agentId]);

  if (!agentId) return <AgentMissingFallback />;

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <AgentPromptDesigner agentId={agentId} agentName={agentName} />
    </div>
  );
}
