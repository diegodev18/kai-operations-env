import type { Agent } from "@/lib/agents/agent";
import { toAgentWithOperations, type AgentWithOperations } from "@/lib/agents/agent";
import { AGENTS_BASE, AGENTS_PAGE_SIZE } from "@/services/agents/constants";
import { normalizeAgentStatus } from "@/services/agents/normalize";

export async function fetchFavorites(): Promise<{ favorites: string[] } | null> {
  const res = await fetch("/api/favorites", { credentials: "include", cache: "no-store" });
  if (!res.ok) return null;
  try {
    return (await res.json()) as { favorites: string[] };
  } catch {
    return null;
  }
}

export async function toggleFavorite(
  agentId: string,
  method: "POST" | "DELETE",
): Promise<{ ok: true } | { ok: false; error: string }> {
  const res = await fetch(
    `/api/favorites/${encodeURIComponent(agentId)}`,
    { method, credentials: "include" },
  );
  if (res.ok) {
    return { ok: true };
  }
  const data = (await res.json().catch(() => ({}))) as { error?: string };
  return { ok: false, error: data.error ?? "No se pudo actualizar favoritos" };
}

export async function fetchAgentProperties(
  agentId: string,
): Promise<Record<string, unknown> | null> {
  try {
    const res = await fetch(
      `${AGENTS_BASE}/${encodeURIComponent(agentId)}/properties`,
      { credentials: "include", cache: "no-store" },
    );
    if (!res.ok) return null;
    const json = (await res.json()) as unknown;
    return json && typeof json === "object" && !Array.isArray(json)
      ? (json as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

export async function patchAgentPropertyDoc(
  agentId: string,
  docId: string,
  payload: Record<string, unknown>,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const res = await fetch(
    `${AGENTS_BASE}/${encodeURIComponent(agentId)}/properties/${encodeURIComponent(docId)}`,
    {
      method: "PATCH",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    },
  );
  if (res.ok) return { ok: true };
  const data = (await res.json().catch(() => ({}))) as { error?: string };
  return { ok: false, error: data.error ?? "No se pudo guardar la propiedad" };
}

export async function fetchTestingProperties(
  agentId: string,
): Promise<Record<string, unknown> | null> {
  try {
    const res = await fetch(
      `${AGENTS_BASE}/${encodeURIComponent(agentId)}/testing/properties`,
      { credentials: "include", cache: "no-store" },
    );
    if (!res.ok) return null;
    const json = (await res.json()) as unknown;
    return json && typeof json === "object" && !Array.isArray(json)
      ? (json as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

function agentsInfoUrl(
  light: boolean,
  paginated: boolean,
  pageSize: number,
  cursor?: string,
  q?: string,
  filters?: {
    status?: string;
    billingAlert?: string;
    domiciliated?: string;
  },
  preview?: boolean,
  favorites?: boolean,
  archivedOnly?: boolean,
): string {
  const params = new URLSearchParams();
  if (light) params.set("light", "1");
  if (paginated) {
    params.set("limit", String(Math.max(1, Math.min(100, pageSize))));
    if (cursor) params.set("cursor", cursor);
  }
  const trimmedQ = q?.trim();
  if (trimmedQ) params.set("q", trimmedQ);
  if (filters) {
    if (filters.status) params.set("status", filters.status);
    if (filters.billingAlert) params.set("billingAlert", filters.billingAlert);
    if (filters.domiciliated !== undefined) params.set("domiciliated", filters.domiciliated);
  }
  if (preview) params.set("preview", "1");
  if (favorites) params.set("favorites", "1");
  if (archivedOnly) params.set("archived", "only");
  return `/api/agents/info?${params.toString()}`;
}

export async function fetchAgentsPage(
  options: {
    light?: boolean;
    paginated?: boolean;
    pageSize?: number;
    cursor?: string;
    /** Búsqueda en servidor (Firestore); vacío omite el parámetro. */
    q?: string;
    filters?: {
      status?: string;
      billingAlert?: string;
      domiciliated?: string;
    };
    /** Modo preview: carga más rápido sin growers/techLeads */
    preview?: boolean;
    /** Filtro de favoritos del usuario actual */
    favorites?: boolean;
    /** Filtro de archivados (query server-side). */
    archivedOnly?: boolean;
  } = {},
): Promise<{ agents: AgentWithOperations[]; nextCursor: string | null } | null> {
  const {
    light = true,
    paginated = true,
    pageSize = AGENTS_PAGE_SIZE,
    cursor,
    q,
    filters,
    preview,
    favorites,
    archivedOnly,
  } = options;
  const url = agentsInfoUrl(
    light,
    paginated,
    pageSize,
    cursor,
    q,
    filters,
    preview,
    favorites,
    archivedOnly,
  );
  const response = await fetch(url, {
    credentials: "include",
    cache: "no-store",
  });
  if (!response.ok) return null;
  const data = (await response.json()) as
    | { agents: Agent[]; nextCursor?: string | null }
    | { agents: Agent[] };
  const list = (data.agents ?? []).map((agent) =>
    toAgentWithOperations({
      ...agent,
      status: normalizeAgentStatus((agent as { status?: unknown }).status),
    }),
  );
  const nextCursor =
    "nextCursor" in data ? (data.nextCursor ?? null) : null;
  return { agents: list, nextCursor };
}
