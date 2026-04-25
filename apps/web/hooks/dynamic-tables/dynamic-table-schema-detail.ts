import { useCallback, useEffect, useState } from "react";

import type { Environment } from "@/contexts/EnvironmentContext";
import type { DynamicTableSchemaDocument } from "@/types/dynamic-table-schema";
import { fetchDynamicTableSchema } from "@/services/dynamic-table-schemas-api";

export function useDynamicTableSchemaDetail(schemaId: string | null, environment: Environment) {
  const [schema, setSchema] = useState<DynamicTableSchemaDocument | null>(null);
  const [isLoading, setIsLoading] = useState(Boolean(schemaId));
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    if (!schemaId) {
      setSchema(null);
      setIsLoading(false);
      setError(null);
      return;
    }
    setIsLoading(true);
    setError(null);
    const result = await fetchDynamicTableSchema(environment, schemaId);
    if (!result.ok) {
      setError(result.error);
      setSchema(null);
      setIsLoading(false);
      return;
    }
    setSchema(result.schema);
    setIsLoading(false);
  }, [schemaId, environment]);

  useEffect(() => {
    queueMicrotask(() => {
      void refetch();
    });
  }, [refetch]);

  return { schema, setSchema, isLoading, error, refetch };
}
