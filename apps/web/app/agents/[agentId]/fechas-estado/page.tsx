"use client";

import { useParams } from "next/navigation";

import { AgentLifecycleStatusPanel } from "@/components/agents";

export default function AgentLifecyclePage() {
  const params = useParams();
  const agentId = typeof params.agentId === "string" ? params.agentId : "";

  if (!agentId) {
    return (
      <p className="text-sm text-muted-foreground">Agente no especificado.</p>
    );
  }

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <AgentLifecycleStatusPanel agentId={agentId} />
    </div>
  );
}
