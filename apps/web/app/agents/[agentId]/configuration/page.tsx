"use client";

import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { AgentConfigurationEditor } from "@/components/agent-configuration-editor";
import { fetchAgentById } from "@/lib/agents-api";

export default function AgentConfigurationPage() {
  const params = useParams();
  const agentId = typeof params.agentId === "string" ? params.agentId : "";
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

  if (!agentId) {
    return (
      <p className="text-sm text-muted-foreground">Agente no especificado.</p>
    );
  }

  return (
    <AgentConfigurationEditor agentId={agentId} agentName={agentName} />
  );
}
