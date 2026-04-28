import { useCallback, useEffect, useState } from "react";

export function useApiResource<T>(
  fetcher: () => Promise<T | null>,
  deps: unknown[] = [],
): { data: T | null; isLoading: boolean; refetch: () => void } {
  const [data, setData] = useState<T | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const refetch = useCallback(async () => {
    setIsLoading(true);
    try {
      const result = await fetcher();
      setData(result);
    } finally {
      setIsLoading(false);
    }
  }, deps);

  useEffect(() => {
    refetch();
  }, [refetch]);

  return { data, isLoading, refetch };
}
