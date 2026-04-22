import type {
  AgentPropertiesResponse,
  PropertyDocumentId,
} from "@/types/agent-properties";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import {
  AGENTS_BASE,
  fetchAgentProperties,
  patchAgentPropertyDoc,
} from "@/services/agents-api";

export function useAgentProperties(agentId: string | null) {
  const [data, setData] = useState<AgentPropertiesResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const fetchProperties = useCallback(async () => {
    if (!agentId) {
      setData(null);
      return;
    }
    setIsLoading(true);
    setData(null);
    try {
      const json = (await fetchAgentProperties(agentId)) as AgentPropertiesResponse | null;
      if (!json) {
        toast.error("Error al cargar propiedades");
        return;
      }
      setData(json);
    } catch {
      toast.error("Error al cargar propiedades del agente");
    } finally {
      setIsLoading(false);
    }
  }, [agentId]);

  useEffect(() => {
    fetchProperties();
  }, [fetchProperties]);

  return { data, isLoading, refetch: fetchProperties };
}

export async function updateAgentPropertyDocument(
  agentId: string,
  documentId: PropertyDocumentId,
  body: Record<string, unknown>,
): Promise<boolean> {
  const result = await patchAgentPropertyDoc(agentId, documentId, body);
  if (!result.ok) {
    toast.error(result.error ?? "Error al guardar");
    return false;
  }
  return true;
}
