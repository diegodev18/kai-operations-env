import type {
  ActivityItem,
  AdminWallet,
  SendTipInput,
  Tip,
  TeamMember,
  UserBalance,
} from "@/types";

async function bonusFetch<T>(
  path: string,
  options?: RequestInit,
): Promise<{ ok: true; data: T } | { ok: false; error: string }> {
  try {
    const res = await fetch(`/api/bonuses${path}`, {
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      ...options,
    });
    const json = (await res.json()) as Record<string, unknown>;
    if (!res.ok) {
      return {
        ok: false,
        error: typeof json.error === "string" ? json.error : "Error desconocido",
      };
    }
    return { ok: true, data: json as T };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Error de red",
    };
  }
}

// ─── Admin wallet ─────────────────────────────────────────────────────────────

export async function fetchAdminWallet(): Promise<
  { ok: true; wallet: AdminWallet } | { ok: false; error: string }
> {
  const res = await bonusFetch<AdminWallet>("/admin/wallet");
  if (!res.ok) return res;
  return { ok: true, wallet: res.data };
}

export async function loadAdminWallet(amount: number): Promise<
  { ok: true; balanceMxn: number } | { ok: false; error: string }
> {
  const res = await bonusFetch<{ ok: boolean; balanceMxn: number }>(
    "/admin/wallet/load",
    { method: "POST", body: JSON.stringify({ amount }) },
  );
  if (!res.ok) return res;
  return { ok: true, balanceMxn: res.data.balanceMxn };
}

// ─── Team members ─────────────────────────────────────────────────────────────

export async function fetchTeamMembers(): Promise<
  { ok: true; members: TeamMember[] } | { ok: false; error: string }
> {
  const res = await bonusFetch<{ members: TeamMember[] }>("/team-members");
  if (!res.ok) return res;
  return { ok: true, members: res.data.members };
}

// ─── Tips ─────────────────────────────────────────────────────────────────────

export async function fetchTips(): Promise<
  { ok: true; tips: Tip[] } | { ok: false; error: string }
> {
  const res = await bonusFetch<{ tips: Tip[] }>("/tips");
  if (!res.ok) return res;
  return { ok: true, tips: res.data.tips };
}

export async function sendTip(input: SendTipInput): Promise<
  { ok: true; tip: Tip } | { ok: false; error: string }
> {
  const res = await bonusFetch<Tip>("/tips", {
    method: "POST",
    body: JSON.stringify(input),
  });
  if (!res.ok) return res;
  return { ok: true, tip: res.data };
}

// ─── Balances ─────────────────────────────────────────────────────────────────

export async function fetchMyBalance(): Promise<
  { ok: true; balanceMxn: number } | { ok: false; error: string }
> {
  const res = await bonusFetch<{ balanceMxn: number }>("/my-balance");
  if (!res.ok) return res;
  return { ok: true, balanceMxn: res.data.balanceMxn };
}

export async function fetchAdminBalances(): Promise<
  { ok: true; balances: UserBalance[] } | { ok: false; error: string }
> {
  const res = await bonusFetch<{ balances: UserBalance[] }>("/admin/balances");
  if (!res.ok) return res;
  return { ok: true, balances: res.data.balances };
}

export async function redeemBalance(userId: string): Promise<
  { ok: true; previousBalance: number } | { ok: false; error: string }
> {
  const res = await bonusFetch<{ ok: boolean; previousBalance: number }>(
    "/admin/redeem",
    { method: "POST", body: JSON.stringify({ userId }) },
  );
  if (!res.ok) return res;
  return { ok: true, previousBalance: res.data.previousBalance };
}

// ─── Activity feed ────────────────────────────────────────────────────────────

export async function fetchActivity(): Promise<
  { ok: true; activity: ActivityItem[] } | { ok: false; error: string }
> {
  const res = await bonusFetch<{ activity: ActivityItem[] }>("/activity");
  if (!res.ok) return res;
  return { ok: true, activity: res.data.activity };
}
