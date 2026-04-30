import { useCallback, useEffect, useRef, useState } from "react";
import type { ActivityItem, SendTipInput, TeamMember, Tip } from "@/types";
import { fetchActivity, fetchTeamMembers, fetchTips, sendTip } from "@/services/bonuses-api";

const POLL_INTERVAL_MS = 30_000;

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

interface UseActivityOptions {
  currentUserId?: string;
  onNewReceivedTip?: (tip: Tip & { type: "tip" }) => void;
}

export function useActivity(opts: UseActivityOptions = {}) {
  const [activity, setActivity] = useState<ActivityItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Ref so the polling closure always sees the latest callback without re-registering the interval
  const onNewReceivedTipRef = useRef(opts.onNewReceivedTip);
  onNewReceivedTipRef.current = opts.onNewReceivedTip;
  const currentUserIdRef = useRef(opts.currentUserId);
  currentUserIdRef.current = opts.currentUserId;

  // Tracks IDs seen on the initial load — polling diffs against this set
  const knownIds = useRef<Set<string> | null>(null);

  const load = useCallback(async (isPoll = false) => {
    if (!isPoll) setIsLoading(true);
    setError(null);
    const res = await fetchActivity();
    if (!res.ok) {
      setError(res.error);
      if (!isPoll) setIsLoading(false);
      return;
    }

    const incoming = res.activity;

    if (knownIds.current === null) {
      // First load: seed the known set, don't notify
      knownIds.current = new Set(incoming.map((i) => i.id));
    } else if (isPoll) {
      const userId = currentUserIdRef.current;
      const cb = onNewReceivedTipRef.current;
      if (userId && cb) {
        for (const item of incoming) {
          if (!knownIds.current.has(item.id)) {
            knownIds.current.add(item.id);
            if (item.type === "tip" && item.recipientId === userId) {
              cb(item as Tip & { type: "tip" });
            }
          }
        }
      } else {
        // Still update the known set even without a callback
        for (const item of incoming) knownIds.current.add(item.id);
      }
    }

    setActivity(incoming);
    if (!isPoll) setIsLoading(false);
  }, []);

  // Initial fetch
  useEffect(() => {
    queueMicrotask(() => { void load(false); });
  }, [load]);

  // Polling
  useEffect(() => {
    const id = setInterval(() => { void load(true); }, POLL_INTERVAL_MS);
    return () => clearInterval(id);
  }, [load]);

  const refetch = useCallback(() => load(false), [load]);

  return { activity, isLoading, error, refetch };
}
