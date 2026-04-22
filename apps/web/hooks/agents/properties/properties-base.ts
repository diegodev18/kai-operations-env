import { useCallback, useState } from "react";
import type { AgentPropertiesResponse } from "@/types";

export function usePropertiesBase(agentId: string | null, initialLoading = false) {
  const [data, setData] = useState<AgentPropertiesResponse | null>(null);
  const [isLoading, setIsLoading] = useState(initialLoading);
  const [error, setError] = useState<string | null>(null);

  const resetWhenNoAgent = useCallback(() => {
    setData(null);
    setIsLoading(false);
    setError(null);
  }, []);

  return {
    data,
    setData,
    isLoading,
    setIsLoading,
    error,
    setError,
    resetWhenNoAgent,
    agentId,
  };
}
