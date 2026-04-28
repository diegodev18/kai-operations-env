import { useCallback, useEffect, useState } from "react";

import type { Environment } from "@/contexts/EnvironmentContext";
import type { DynamicTableSchemaDocument } from "@/types/dynamic-table-schema";
import { fetchDynamicTableSchemas } from "@/services/dynamic-table-schemas-api";

export function useDynamicTableSchemasList(environment: Environment) {
  const [schemas, setSchemas] = useState<DynamicTableSchemaDocument[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    const result = await fetchDynamicTableSchemas(environment);
    if (!result.ok) {
      setError(result.error);
      setSchemas([]);
      setIsLoading(false);
      return;
    }
    setSchemas(result.schemas);
    setIsLoading(false);
  }, [environment]);

  useEffect(() => {
    queueMicrotask(() => {
      void refetch();
    });
  }, [refetch]);

  return { schemas, isLoading, error, refetch };
}
