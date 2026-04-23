import { useEffect, useState } from "react";
import type { PromptModelInfo } from "@/types";

export function usePromptModels() {
  const [models, setModels] = useState<PromptModelInfo[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchModels = async () => {
      try {
        setError(null);
        const res = await fetch("/api/prompt/models", {
          credentials: "include",
        });
        if (res.ok) {
          const data = (await res.json()) as { models: PromptModelInfo[] };
          setModels(data.models ?? []);
        } else {
          setError("Error al cargar modelos");
        }
      } catch {
        setError("Error al cargar modelos");
      } finally {
        setIsLoading(false);
      }
    };
    fetchModels();
  }, []);

  return { models, isLoading, error };
}
