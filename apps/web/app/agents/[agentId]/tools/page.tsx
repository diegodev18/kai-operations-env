"use client";

import { useParams } from "next/navigation";
import { AgentToolsPanel } from "@/components/agents";

export default function AgentToolsPage() {
  const params = useParams();
  const agentId = typeof params.agentId === "string" ? params.agentId : "";

  if (!agentId) {
    return (
      <p className="text-sm text-muted-foreground">Agente no especificado.</p>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <AgentToolsPanel agentId={agentId} />
    </div>
  );
}
