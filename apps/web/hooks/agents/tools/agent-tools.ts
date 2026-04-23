import type { AgentTool } from "@/types";
import { useCallback, useEffect, useState } from "react";
import { AGENTS_BASE } from "@/services/agents-api";

export function useAgentTools(agentId: string | null) {
  const [tools, setTools] = useState<AgentTool[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    if (!agentId) {
      setTools([]);
      setError(null);
      return;
    }
    setIsLoading(true);
    setTools([]);
    setError(null);
    try {
      const res = await fetch(
        `${AGENTS_BASE}/${encodeURIComponent(agentId)}/tools`,
        {
          credentials: "include",
        },
      );
      if (!res.ok) {
        const err = (await res.json()) as { error?: string };
        setError(err.error ?? "Error al cargar tools");
        return;
      }
      const json = (await res.json()) as { tools: AgentTool[] };
      setTools(json.tools ?? []);
    } catch {
      setError("Error al cargar tools del agente");
    } finally {
      setIsLoading(false);
    }
  }, [agentId]);

  useEffect(() => {
    refetch();
  }, [refetch]);

  return { tools, isLoading, error, refetch };
}
