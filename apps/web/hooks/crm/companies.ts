import { useCallback, useEffect, useState } from "react";
import type { CrmCompany, CrmCompanyDetail } from "@/types";
import {
  fetchCrmCompanies,
  fetchCrmCompany,
  createCrmCompany,
  updateCrmCompany,
  deleteCrmCompany,
  type CrmCompanyInput,
} from "@/services/crm-api";

export function useCrmCompanies() {
  const [companies, setCompanies] = useState<CrmCompany[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    const res = await fetchCrmCompanies();
    if (res.ok) {
      setCompanies(res.companies);
    } else {
      setError(res.error);
    }
    setIsLoading(false);
  }, []);

  useEffect(() => {
    queueMicrotask(() => {
      void load();
    });
  }, [load]);

  const create = useCallback(
    async (input: CrmCompanyInput) => {
      const res = await createCrmCompany(input);
      if (res.ok) {
        setCompanies((prev) => [res.company, ...prev]);
      }
      return res;
    },
    [],
  );

  const update = useCallback(
    async (id: string, input: Partial<CrmCompanyInput>) => {
      const res = await updateCrmCompany(id, input);
      if (res.ok) {
        setCompanies((prev) =>
          prev.map((c) => (c.id === id ? { ...c, ...input } : c)),
        );
      }
      return res;
    },
    [],
  );

  const remove = useCallback(async (id: string) => {
    const res = await deleteCrmCompany(id);
    if (res.ok) {
      setCompanies((prev) => prev.filter((c) => c.id !== id));
    }
    return res;
  }, []);

  return { companies, isLoading, error, refetch: load, create, update, remove };
}

export function useCrmCompanyDetail(id: string | null) {
  const [company, setCompany] = useState<CrmCompanyDetail | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!id) return;
    setIsLoading(true);
    setError(null);
    const res = await fetchCrmCompany(id);
    if (res.ok) {
      setCompany(res.company);
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
    async (input: Partial<CrmCompanyInput>) => {
      if (!id) return { ok: false as const, error: "No hay ID" };
      const res = await updateCrmCompany(id, input);
      if (res.ok) {
        setCompany((prev) => (prev ? { ...prev, ...input } : prev));
      }
      return res;
    },
    [id],
  );

  return { company, isLoading, error, refetch: load, update };
}

export type { CrmCompanyInput };
