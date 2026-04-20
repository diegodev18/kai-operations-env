import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

export interface ProductionPromptData {
  prompt: string;
  auth?: { auth: string; unauth: string };
}

export function useProductionPrompt(agentId: string) {
  const [data, setData] = useState<ProductionPromptData | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const fetchProductionPrompt = useCallback(async () => {
    if (!agentId) return;
    setIsLoading(true);
    try {
      const res = await fetch(`/api/agents/${encodeURIComponent(agentId)}/production-prompt`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to fetch production prompt");
      const json = await res.json();
      setData(json as ProductionPromptData);
    } catch {
      setData(null);
    } finally {
      setIsLoading(false);
    }
  }, [agentId]);

  useEffect(() => {
    fetchProductionPrompt();
  }, [fetchProductionPrompt]);

  return { data, isLoading, refetch: fetchProductionPrompt };
}

/** Lectura puntual del prompt en producción (misma fuente que `GET .../production-prompt`). */
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

export async function promotePromptToProduction(
  agentId: string,
  payload: { prompt: string; auth?: { auth: string; unauth: string } },
): Promise<boolean> {
  try {
    const response = await fetch(
      `/api/agents/${encodeURIComponent(agentId)}/promote-prompt-to-production`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(payload),
      },
    );

    if (!response.ok) {
      const err = (await response.json()) as { error?: string };
      toast.error(err.error ?? "No se pudo subir el prompt a producción");
      return false;
    }

    return true;
  } catch {
    toast.error("Ocurrió un error al subir el prompt a producción");
    return false;
  }
}
