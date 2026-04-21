import type {
  AgentPropertiesResponse,
  PropertyDocumentId,
} from "@/types/agent-properties";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import {
  AGENTS_BASE,
  fetchTestingProperties,
  patchAgentPropertyDoc,
  postAgentSyncFromProduction,
} from "@/services/agents-api";

export function useTestingProperties(agentId: string | null) {
  const [data, setData] = useState<AgentPropertiesResponse | null>(null);
  /** Evita un frame con `false` antes del primer fetch cuando hay `agentId`. */
  const [isLoading, setIsLoading] = useState(() => Boolean(agentId));
  const [didAutoSync, setDidAutoSync] = useState(false);

  const fetchProperties = useCallback(async (autoSync = true) => {
    if (!agentId) {
      setData(null);
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    setData(null);
    setDidAutoSync(false);
    try {
      const json = (await fetchTestingProperties(agentId)) as AgentPropertiesResponse | null;
      if (!json) {
        if (autoSync) {
          const syncResult = await postAgentSyncFromProduction(agentId);
          if (syncResult.ok) {
            setDidAutoSync(true);
            toast.success("Datos sincronizados desde producción");
            const retryJson = (await fetchTestingProperties(agentId)) as AgentPropertiesResponse | null;
            if (retryJson) {
              setData(retryJson);
            }
          }
        } else {
          toast.error("Error al cargar propiedades de testing");
        }
        return;
      }
      setData(json);
    } catch {
      toast.error("Error al cargar propiedades de testing");
    } finally {
      setIsLoading(false);
    }
  }, [agentId]);

  useEffect(() => {
    fetchProperties();
  }, [fetchProperties]);

  return { data, isLoading, didAutoSync, refetch: fetchProperties };
}

export async function updateTestingPropertyDocument(
  agentId: string,
  documentId: PropertyDocumentId,
  body: Record<string, unknown>,
): Promise<boolean> {
  const result = await patchAgentPropertyDoc(agentId, documentId, body);
  if (!result.ok) {
    toast.error(result.error ?? "Error al guardar en testing");
    return false;
  }
  return true;
}
