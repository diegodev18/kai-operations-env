import { useCallback, useEffect, useState } from "react";

import { fetchAgentBuilderForm, fetchToolsCatalog } from "@/services/agents-api";
import type { AgentBuilderFormResponse, ToolsCatalogItem } from "@/types";

/**
 * Carga el snapshot del constructor (GET builder-form) y el catálogo de tools en paralelo.
 * Sin toast; expone `error` para que la UI decida.
 */
export function useBuilderFormReadonlyData(agentId: string) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [payload, setPayload] = useState<AgentBuilderFormResponse | null>(null);
  const [catalog, setCatalog] = useState<ToolsCatalogItem[] | null>(null);

  const load = useCallback(async () => {
    if (!agentId) return;
    setLoading(true);
    setError(null);
    try {
      const [formRes, tools] = await Promise.all([
        fetchAgentBuilderForm(agentId),
        fetchToolsCatalog(),
      ]);
      if (!formRes) {
        setError("No se pudo cargar el formulario del agente.");
        setPayload(null);
      } else {
        setPayload(formRes);
      }
      setCatalog(tools ?? []);
    } catch {
      setError("Error al cargar el formulario.");
      setPayload(null);
    } finally {
      setLoading(false);
    }
  }, [agentId]);

  useEffect(() => {
    void load();
  }, [load]);

  return { loading, error, payload, catalog, refetch: load };
}
