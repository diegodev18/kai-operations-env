import { useEffect } from "react";
import { fetchToolsCatalog, type ToolsCatalogItem } from "@/services/agents-api";
import { useApiResource } from "./use-api-resource";

export function useToolsCatalog() {
  const { data, isLoading, refetch } = useApiResource(
    async () => {
      const list = await fetchToolsCatalog();
      return list ?? [];
    },
    [],
  );

  useEffect(() => {
    queueMicrotask(() => {
      void refetch();
    });
  }, [refetch]);

  return { tools: data ?? [], isLoading, refetch };
}
