import { useCallback, useEffect, useState } from "react";
import type { UserBalance } from "@/types";
import {
  fetchAdminBalances,
  fetchMyBalance,
  redeemBalance,
} from "@/services/bonuses-api";

export function useMyBalance() {
  const [balanceMxn, setBalanceMxn] = useState<number>(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    const res = await fetchMyBalance();
    if (res.ok) {
      setBalanceMxn(res.balanceMxn);
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

  return { balanceMxn, isLoading, error, refetch: load };
}

export function useAdminBalances() {
  const [balances, setBalances] = useState<UserBalance[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    const res = await fetchAdminBalances();
    if (res.ok) {
      setBalances(res.balances);
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

  const redeem = useCallback(async (userId: string) => {
    const res = await redeemBalance(userId);
    if (res.ok) {
      setBalances((prev) =>
        prev.map((b) => (b.userId === userId ? { ...b, balanceMxn: 0 } : b)),
      );
    }
    return res;
  }, []);

  return { balances, isLoading, error, refetch: load, redeem };
}
