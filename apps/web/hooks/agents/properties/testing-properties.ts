import type { AgentPropertiesResponse } from "@/types/agent-properties";
import { useCallback, useEffect, useState } from "react";
import {
  fetchTestingProperties,
  postAgentSyncFromProduction,
} from "@/services/agents-api";
import { usePropertiesBase } from "./properties-base";

export function useTestingProperties(agentId: string | null) {
  const {
    data,
    setData,
    isLoading,
    setIsLoading,
    error,
    setError,
    resetWhenNoAgent,
  } = usePropertiesBase(agentId, Boolean(agentId));
  const [didAutoSync, setDidAutoSync] = useState(false);

  const fetchProperties = useCallback(
    async (autoSync = true) => {
      if (!agentId) {
        setDidAutoSync(false);
        resetWhenNoAgent();
        return;
      }
      setIsLoading(true);
      setData(null);
      setError(null);
      setDidAutoSync(false);
      try {
        const json = (await fetchTestingProperties(agentId)) as AgentPropertiesResponse | null;
        if (!json) {
          if (autoSync) {
            const syncResult = await postAgentSyncFromProduction(agentId);
            if (syncResult.ok) {
              setDidAutoSync(true);
              const retryJson = (await fetchTestingProperties(agentId)) as
                | AgentPropertiesResponse
                | null;
              if (retryJson) {
                setData(retryJson);
              } else {
                setError("Error al cargar propiedades de testing");
              }
            } else {
              setError(syncResult.error ?? "Error al sincronizar desde producción");
            }
          } else {
            setError("Error al cargar propiedades de testing");
          }
          return;
        }
        setData(json);
      } catch {
        setError("Error al cargar propiedades de testing");
      } finally {
        setIsLoading(false);
      }
    },
    [agentId, resetWhenNoAgent, setData, setError, setIsLoading],
  );

  useEffect(() => {
    fetchProperties();
  }, [fetchProperties]);

  return { data, isLoading, error, didAutoSync, refetch: fetchProperties };
}
