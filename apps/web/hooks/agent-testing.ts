import { fetchTestingDiff } from "@/services/agents-api";
import { useApiResource } from "./use-api-resource";

export type TestingDiffItem = {
  collection: string;
  documentId: string;
  fieldKey: string;
  testingValue: unknown;
  productionValue: unknown;
};

export function useTestingDiff(agentId: string) {
  const { data: result, isLoading, refetch } = useApiResource(
    async () => {
      if (!agentId) return null;
      return await fetchTestingDiff(agentId);
    },
    [agentId],
  );

  return {
    data: result?.diff ?? [],
    isLoading,
    error: null,
    refetch,
  };
}
