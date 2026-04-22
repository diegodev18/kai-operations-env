import type { AgentPropertiesResponse } from "@/types/agent-properties";
import { useCallback, useEffect } from "react";
import { fetchAgentProperties } from "@/services/agents-api";
import { usePropertiesBase } from "./properties-base";

export function useAgentProperties(agentId: string | null) {
  const {
    data,
    setData,
    isLoading,
    setIsLoading,
    error,
    setError,
    resetWhenNoAgent,
  } = usePropertiesBase(agentId);

  const fetchProperties = useCallback(async () => {
    if (!agentId) {
      resetWhenNoAgent();
      return;
    }
    setIsLoading(true);
    setData(null);
    setError(null);
    try {
      const json = (await fetchAgentProperties(agentId)) as AgentPropertiesResponse | null;
      if (!json) {
        setError("Error al cargar propiedades");
        return;
      }
      setData(json);
    } catch {
      setError("Error al cargar propiedades del agente");
    } finally {
      setIsLoading(false);
    }
  }, [agentId, resetWhenNoAgent, setData, setError, setIsLoading]);

  useEffect(() => {
    fetchProperties();
  }, [fetchProperties]);

  return { data, isLoading, error, refetch: fetchProperties };
}
