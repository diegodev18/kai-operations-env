import { useCallback, useEffect, useState } from "react";
import { fetchToolsCatalog, type ToolsCatalogItem } from "@/services/agents-api";

export function useToolsCatalog() {
  const [tools, setTools] = useState<ToolsCatalogItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const load = useCallback(async () => {
    setIsLoading(true);
    const list = await fetchToolsCatalog();
    setTools(list ?? []);
    setIsLoading(false);
  }, []);

  useEffect(() => {
    queueMicrotask(() => {
      void load();
    });
  }, [load]);

  return { tools, isLoading, refetch: load };
}
