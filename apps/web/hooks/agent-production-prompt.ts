import { toast } from "sonner";
import { useApiResource } from "./use-api-resource";

export interface ProductionPromptData {
  prompt: string;
  auth?: { auth: string; unauth: string };
}

export function useProductionPrompt(agentId: string) {
  return useApiResource(
    async () => {
      if (!agentId) return null;
      try {
        const res = await fetch(`/api/agents/${encodeURIComponent(agentId)}/production-prompt`, {
          credentials: "include",
        });
        if (!res.ok) return null;
        return (await res.json()) as ProductionPromptData;
      } catch {
        return null;
      }
    },
    [agentId],
  );
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
