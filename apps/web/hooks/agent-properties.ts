import type {
  AgentPropertiesResponse,
  PropertyDocumentId,
} from "@/types/agent-properties";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

const BASE = "/api/agents";

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
      const res = await fetch(
        `${BASE}/${encodeURIComponent(agentId)}/properties`,
        {
          credentials: "include",
        },
      );
      if (!res.ok) {
        const err = (await res.json()) as { error?: string };
        toast.error(err.error ?? "Error al cargar propiedades");
        return;
      }
      const json = (await res.json()) as AgentPropertiesResponse;
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
  const res = await fetch(
    `${BASE}/${encodeURIComponent(agentId)}/properties/${encodeURIComponent(documentId)}`,
    {
      method: "PATCH",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    },
  );
  if (!res.ok) {
    const err = (await res.json()) as { error?: string };
    toast.error(err.error ?? "Error al guardar");
    return false;
  }
  return true;
}
