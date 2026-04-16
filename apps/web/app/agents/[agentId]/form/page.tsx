"use client";

import { useParams } from "next/navigation";

import { AgentBuilderFormReadonly } from "@/components/agent-builder-form-readonly";

export default function AgentFormPage() {
  const params = useParams();
  const agentId = typeof params.agentId === "string" ? params.agentId : "";

  if (!agentId) {
    return (
      <p className="text-sm text-muted-foreground">Agente no especificado.</p>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <AgentBuilderFormReadonly agentId={agentId} />
    </div>
  );
}
