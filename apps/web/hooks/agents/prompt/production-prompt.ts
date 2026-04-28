import { useState } from "react";
import { useApiResource } from "@/hooks/api/api-resource";

export interface ProductionPromptData {
  prompt: string;
  auth?: { auth: string; unauth: string };
}

export function useProductionPrompt(agentId: string) {
  const [error, setError] = useState<string | null>(null);

  const { data, isLoading, refetch } = useApiResource(
    async () => {
      if (!agentId) {
        setError(null);
        return null;
      }
      try {
        setError(null);
        const res = await fetch(
          `/api/agents/${encodeURIComponent(agentId)}/production-prompt`,
          {
            credentials: "include",
          },
        );
        if (!res.ok) {
          setError("Error al cargar prompt de producción");
          return null;
        }
        return (await res.json()) as ProductionPromptData;
      } catch {
        setError("Error al cargar prompt de producción");
        return null;
      }
    },
    [agentId],
  );

  return { data, isLoading, error, refetch };
}

export async function fetchProductionPromptSnapshot(
  agentId: string,
): Promise<ProductionPromptData | null> {
  try {
    const res = await fetch(
      `/api/agents/${encodeURIComponent(agentId)}/production-prompt`,
      { credentials: "include" },
    );
    if (!res.ok) return null;
    return (await res.json()) as ProductionPromptData;
  } catch {
    return null;
  }
}
