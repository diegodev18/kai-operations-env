import type {
  CrmCompany,
  CrmCompanyDetail,
  CrmCompanyInput,
  CrmOpportunity,
  CrmOpportunityInput,
} from "@/types";

async function crmFetch<T>(
  path: string,
  options?: RequestInit,
): Promise<{ ok: true; data: T } | { ok: false; error: string }> {
  try {
    const res = await fetch(`/api/crm${path}`, {
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      ...options,
    });
    const json = (await res.json()) as Record<string, unknown>;
    if (!res.ok) {
      return {
        ok: false,
        error:
          typeof json.error === "string" ? json.error : "Error desconocido",
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

// ─── Companies ──────────────────────────────────────────────────────────────

export async function fetchCrmCompanies(): Promise<
  { ok: true; companies: CrmCompany[] } | { ok: false; error: string }
> {
  const res = await crmFetch<{ companies: CrmCompany[] }>("/companies");
  if (!res.ok) return res;
  return { ok: true, companies: res.data.companies };
}

export async function fetchCrmCompany(
  id: string,
): Promise<{ ok: true; company: CrmCompanyDetail } | { ok: false; error: string }> {
  const res = await crmFetch<CrmCompanyDetail>(`/companies/${encodeURIComponent(id)}`);
  if (!res.ok) return res;
  return { ok: true, company: res.data };
}

export async function createCrmCompany(
  input: CrmCompanyInput,
): Promise<{ ok: true; company: CrmCompany } | { ok: false; error: string }> {
  const res = await crmFetch<CrmCompany>("/companies", {
    method: "POST",
    body: JSON.stringify(input),
  });
  if (!res.ok) return res;
  return { ok: true, company: res.data };
}

export async function updateCrmCompany(
  id: string,
  input: Partial<CrmCompanyInput>,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const res = await crmFetch<{ ok: boolean }>(`/companies/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
  if (!res.ok) return res;
  return { ok: true };
}

export async function deleteCrmCompany(
  id: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const res = await crmFetch<{ ok: boolean }>(`/companies/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
  if (!res.ok) return res;
  return { ok: true };
}

// ─── Opportunities ───────────────────────────────────────────────────────────

export async function fetchCrmOpportunities(companyId?: string): Promise<
  { ok: true; opportunities: CrmOpportunity[] } | { ok: false; error: string }
> {
  const qs = companyId ? `?companyId=${encodeURIComponent(companyId)}` : "";
  const res = await crmFetch<{ opportunities: CrmOpportunity[] }>(`/opportunities${qs}`);
  if (!res.ok) return res;
  return { ok: true, opportunities: res.data.opportunities };
}

export async function fetchCrmOpportunity(
  id: string,
): Promise<{ ok: true; opportunity: CrmOpportunity } | { ok: false; error: string }> {
  const res = await crmFetch<CrmOpportunity>(`/opportunities/${encodeURIComponent(id)}`);
  if (!res.ok) return res;
  return { ok: true, opportunity: res.data };
}

export async function createCrmOpportunity(
  input: CrmOpportunityInput,
): Promise<{ ok: true; opportunity: CrmOpportunity } | { ok: false; error: string }> {
  const res = await crmFetch<CrmOpportunity>("/opportunities", {
    method: "POST",
    body: JSON.stringify(input),
  });
  if (!res.ok) return res;
  return { ok: true, opportunity: res.data };
}

export async function updateCrmOpportunity(
  id: string,
  input: Partial<CrmOpportunityInput> & { agentId?: string },
): Promise<{ ok: true } | { ok: false; error: string }> {
  const res = await crmFetch<{ ok: boolean }>(`/opportunities/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
  if (!res.ok) return res;
  return { ok: true };
}

export async function deleteCrmOpportunity(
  id: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const res = await crmFetch<{ ok: boolean }>(`/opportunities/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
  if (!res.ok) return res;
  return { ok: true };
}
