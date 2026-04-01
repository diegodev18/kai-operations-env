import { useCallback, useEffect, useState } from "react";
import { fetchTestingDiff } from "@/lib/agents-api";

export type TestingDiffItem = {
  collection: string;
  documentId: string;
  fieldKey: string;
  testingValue: unknown;
  productionValue: unknown;
};

export function useTestingDiff(agentId: string) {
  const [data, setData] = useState<TestingDiffItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchDiff = useCallback(async () => {
    if (!agentId) return;
    setIsLoading(true);
    setError(null);
    try {
      const result = await fetchTestingDiff(agentId);
      if (result) {
        setData(result.diff);
      } else {
        setData([]);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error fetching diff");
      setData([]);
    } finally {
      setIsLoading(false);
    }
  }, [agentId]);

  useEffect(() => {
    void fetchDiff();
  }, [fetchDiff]);

  return { data, isLoading, error, refetch: fetchDiff };
}
