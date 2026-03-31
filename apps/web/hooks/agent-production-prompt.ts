import { useEffect, useState } from "react";
import { toast } from "sonner";

export interface ProductionPromptData {
  prompt: string;
  auth?: { auth: string; unauth: string };
}

export function useProductionPrompt(agentId: string) {
  const [data, setData] = useState<ProductionPromptData | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    fetch(`/api/agents/${encodeURIComponent(agentId)}/production-prompt`, {
      credentials: "include",
    })
      .then((res) => {
        if (!res.ok) throw new Error("Failed to fetch production prompt");
        return res.json();
      })
      .then((json) => {
        if (!cancelled) {
          setData(json as ProductionPromptData);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setData(null);
        }
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [agentId]);

  return { data, isLoading };
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

    toast.success("Prompt subido a producción");
    return true;
  } catch {
    toast.error("Ocurrió un error al subir el prompt a producción");
    return false;
  }
}
