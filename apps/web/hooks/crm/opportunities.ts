import { useCallback, useEffect, useState } from "react";
import type { CrmOpportunity, CrmOpportunityInput } from "@/types";
import {
  fetchCrmOpportunities,
  fetchCrmOpportunity,
  createCrmOpportunity,
  updateCrmOpportunity,
  deleteCrmOpportunity,
} from "@/services/crm-api";

export function useCrmOpportunities(companyId?: string) {
  const [opportunities, setOpportunities] = useState<CrmOpportunity[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    const res = await fetchCrmOpportunities(companyId);
    if (res.ok) {
      setOpportunities(res.opportunities);
    } else {
      setError(res.error);
    }
    setIsLoading(false);
  }, [companyId]);

  useEffect(() => {
    queueMicrotask(() => {
      void load();
    });
  }, [load]);

  const create = useCallback(
    async (input: CrmOpportunityInput) => {
      const res = await createCrmOpportunity(input);
      if (res.ok) {
        setOpportunities((prev) => [res.opportunity, ...prev]);
      }
      return res;
    },
    [],
  );

  const update = useCallback(
    async (id: string, input: Partial<CrmOpportunityInput> & { agentId?: string }) => {
      const res = await updateCrmOpportunity(id, input);
      if (res.ok) {
        setOpportunities((prev) =>
          prev.map((o) => (o.id === id ? { ...o, ...input } : o)),
        );
      }
      return res;
    },
    [],
  );

  const remove = useCallback(async (id: string) => {
    const res = await deleteCrmOpportunity(id);
    if (res.ok) {
      setOpportunities((prev) => prev.filter((o) => o.id !== id));
    }
    return res;
  }, []);

  return {
    opportunities,
    isLoading,
    error,
    refetch: load,
    create,
    update,
    remove,
  };
}

export function useCrmOpportunityDetail(id: string | null) {
  const [opportunity, setOpportunity] = useState<CrmOpportunity | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!id) return;
    setIsLoading(true);
    setError(null);
    const res = await fetchCrmOpportunity(id);
    if (res.ok) {
      setOpportunity(res.opportunity);
    } else {
      setError(res.error);
    }
    setIsLoading(false);
  }, [id]);

  useEffect(() => {
    queueMicrotask(() => {
      void load();
    });
  }, [load]);

  const update = useCallback(
    async (
      input: Partial<CrmOpportunityInput> & { agentId?: string },
    ) => {
      if (!id) return { ok: false as const, error: "No hay ID" };
      const res = await updateCrmOpportunity(id, input);
      if (res.ok) {
        setOpportunity((prev) => (prev ? { ...prev, ...input } : prev));
      }
      return res;
    },
    [id],
  );

  return { opportunity, isLoading, error, refetch: load, update };
}

export type { CrmOpportunityInput };
