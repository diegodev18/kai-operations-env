import { useCallback, useEffect, useState } from "react";
import type { SendTipInput, TeamMember, Tip } from "@/types";
import { fetchTeamMembers, fetchTips, sendTip } from "@/services/bonuses-api";

export function useTips() {
  const [tips, setTips] = useState<Tip[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    const res = await fetchTips();
    if (res.ok) {
      setTips(res.tips);
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

  const send = useCallback(async (input: SendTipInput) => {
    const res = await sendTip(input);
    if (res.ok) {
      setTips((prev) => [res.tip, ...prev]);
    }
    return res;
  }, []);

  return { tips, isLoading, error, refetch: load, send };
}

export function useTeamMembers() {
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    const res = await fetchTeamMembers();
    if (res.ok) {
      setMembers(res.members);
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

  return { members, isLoading, error };
}
