"use client";

import { AgentMissingFallback, TestingDataPanel } from "@/components/agents";
import { useAgentIdParam } from "@/hooks";

export default function TestingDataPage() {
  const agentId = useAgentIdParam();
  if (!agentId) return <AgentMissingFallback />;
  return <TestingDataPanel agentId={agentId} />;
}
