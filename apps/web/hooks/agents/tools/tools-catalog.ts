import { useEffect, useState } from "react";
import { fetchToolsCatalog, type ToolsCatalogItem } from "@/services/agents-api";

export function useToolsCatalog() {
  const [tools, setTools] = useState<ToolsCatalogItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refetch = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const list = await fetchToolsCatalog();
      setTools(list ?? []);
    } catch {
      setError("Error al cargar catálogo de tools");
      setTools([]);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    queueMicrotask(() => {
      void refetch();
    });
  }, []);

  return { tools, isLoading, error, refetch };
}
