import type {
  AgentPropertiesResponse,
  PropertyDocumentId,
} from "@/types/agent-properties";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

const BASE = "/api/agents";

export function useTestingProperties(agentId: string | null) {
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
        `${BASE}/${encodeURIComponent(agentId)}/testing/properties`,
        {
          credentials: "include",
        },
      );
      if (!res.ok) {
        const err = (await res.json()) as { error?: string };
        if (res.status !== 404) {
          toast.error(err.error ?? "Error al cargar propiedades de testing");
        }
        return;
      }
      const json = (await res.json()) as AgentPropertiesResponse;
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

  return { data, isLoading, refetch: fetchProperties };
}

export async function updateTestingPropertyDocument(
  agentId: string,
  documentId: PropertyDocumentId,
  body: Record<string, unknown>,
): Promise<boolean> {
  const res = await fetch(
    `${BASE}/${encodeURIComponent(agentId)}/testing/properties/${encodeURIComponent(documentId)}`,
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
    toast.error(err.error ?? "Error al guardar en testing");
    return false;
  }
  return true;
}
