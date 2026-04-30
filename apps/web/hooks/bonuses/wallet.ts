import { useCallback, useEffect, useState } from "react";
import type { AdminWallet } from "@/types";
import { fetchAdminWallet, loadAdminWallet } from "@/services/bonuses-api";

export function useAdminWallet() {
  const [wallet, setWallet] = useState<AdminWallet | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    const res = await fetchAdminWallet();
    if (res.ok) {
      setWallet(res.wallet);
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

  const load_ = useCallback(
    async (amount: number) => {
      const res = await loadAdminWallet(amount);
      if (res.ok) {
        setWallet((prev) =>
          prev
            ? { ...prev, balanceMxn: res.balanceMxn }
            : { balanceMxn: res.balanceMxn, lastUpdatedAt: new Date().toISOString() },
        );
      }
      return res;
    },
    [],
  );

  return { wallet, isLoading, error, refetch: load, loadFunds: load_ };
}
