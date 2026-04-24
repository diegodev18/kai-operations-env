import type { AgentPropertiesResponse } from "@/types";
import { useCallback, useEffect, useState } from "react";
import {
  fetchTestingProperties,
  postAgentSyncFromProduction,
} from "@/services/agents-api";
import { usePropertiesBase } from "./properties-base";

export type RefetchTestingPropertiesOptions = {
  /** Si false, no intenta `postAgentSyncFromProduction` cuando no hay JSON. Default true. */
  autoSync?: boolean;
  /**
   * Si true, no vacía `data` ni pone `isLoading` en la carga inicial del fetch
   * (útil tras guardar para refrescar sin “reset” visual de toda la vista).
   */
  silent?: boolean;
};

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
    async (options?: boolean | RefetchTestingPropertiesOptions) => {
      const resolved =
        typeof options === "boolean" ? { autoSync: options } : (options ?? {});
      const autoSync = resolved.autoSync !== false;
      const silent = resolved.silent === true;

      if (!agentId) {
        setDidAutoSync(false);
        resetWhenNoAgent();
        return;
      }

      if (!silent) {
        setIsLoading(true);
        setData(null);
      }
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
        if (!silent) {
          setIsLoading(false);
        }
      }
    },
    [agentId, resetWhenNoAgent, setData, setError, setIsLoading],
  );

  useEffect(() => {
    fetchProperties();
  }, [fetchProperties]);

  return { data, isLoading, error, didAutoSync, refetch: fetchProperties };
}
