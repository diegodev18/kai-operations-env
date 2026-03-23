"use client";

import { useParams } from "next/navigation";
import { AgentToolsPanel } from "@/components/agent-tools-panel";

export default function AgentToolsPage() {
  const params = useParams();
  const agentId = typeof params.agentId === "string" ? params.agentId : "";

  if (!agentId) {
    return (
      <p className="text-sm text-muted-foreground">Agente no especificado.</p>
    );
  }

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <AgentToolsPanel agentId={agentId} />
    </div>
  );
}
