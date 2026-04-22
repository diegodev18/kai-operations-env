import { useState } from "react";
import { fetchTestingDiff } from "@/services/agents-api";
import { useApiResource } from "@/hooks/api/api-resource";

export type TestingDiffItem = {
  collection: string;
  documentId: string;
  fieldKey: string;
  testingValue: unknown;
  productionValue: unknown;
};

export function useTestingDiff(agentId: string) {
  const [error, setError] = useState<string | null>(null);

  const { data: result, isLoading, refetch } = useApiResource(
    async () => {
      if (!agentId) {
        setError(null);
        return null;
      }
      try {
        setError(null);
        return await fetchTestingDiff(agentId);
      } catch {
        setError("Error al cargar diferencias de testing");
        return null;
      }
    },
    [agentId],
  );

  return {
    data: result?.diff ?? [],
    isLoading,
    error,
    refetch,
  };
}
