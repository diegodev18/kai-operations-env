import type { Agent } from "@/lib/agent";
import { toAgentWithOperations, type AgentWithOperations } from "@/lib/agent";

/** Tamaño de cada página al listar agentes (carga perezosa: primero solo esta cantidad). */
export const AGENTS_PAGE_SIZE = 15;

function agentsInfoUrl(
  light: boolean,
  paginated: boolean,
  pageSize: number,
  cursor?: string,
): string {
  const params = new URLSearchParams();
  if (light) params.set("light", "1");
  if (paginated) {
    params.set("limit", String(Math.max(1, Math.min(100, pageSize))));
    if (cursor) params.set("cursor", cursor);
  }
  return `/api/agents/info?${params.toString()}`;
}

export async function fetchAgentsPage(
  options: {
    light?: boolean;
    paginated?: boolean;
    pageSize?: number;
    cursor?: string;
  } = {},
): Promise<{ agents: AgentWithOperations[]; nextCursor: string | null } | null> {
  const {
    light = true,
    paginated = true,
    pageSize = AGENTS_PAGE_SIZE,
    cursor,
  } = options;
  const url = agentsInfoUrl(light, paginated, pageSize, cursor);
  const response = await fetch(url, {
    credentials: "include",
    cache: "no-store",
  });
  if (!response.ok) return null;
  const data = (await response.json()) as
    | { agents: Agent[]; nextCursor?: string | null }
    | { agents: Agent[] };
  const list = (data.agents ?? []).map(toAgentWithOperations);
  const nextCursor =
    "nextCursor" in data ? (data.nextCursor ?? null) : null;
  return { agents: list, nextCursor };
}

export async function postAgentGrower(
  agentId: string,
  body: { email: string; name?: string },
): Promise<
  | { ok: true; grower: { email: string; name: string } }
  | { ok: false; error: string }
> {
  const res = await fetch(
    `/api/agents/${encodeURIComponent(agentId)}/growers`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(body),
    },
  );
  let data: {
    ok?: boolean;
    grower?: { email: string; name: string };
    error?: string;
  } = {};
  try {
    data = (await res.json()) as typeof data;
  } catch {
    /* empty */
  }
  if (!res.ok) {
    return {
      ok: false,
      error: data.error ?? "No se pudo agregar el grower",
    };
  }
  if (data.ok && data.grower) {
    return { ok: true, grower: data.grower };
  }
  return { ok: false, error: "Respuesta inválida del servidor" };
}

export type AgentGrowerRow = { email: string; name: string };

export async function fetchAgentGrowers(
  agentId: string,
): Promise<{ growers: AgentGrowerRow[] } | null> {
  const res = await fetch(
    `/api/agents/${encodeURIComponent(agentId)}/growers`,
    {
      credentials: "include",
      cache: "no-store",
    },
  );
  if (!res.ok) return null;
  try {
    return (await res.json()) as { growers: AgentGrowerRow[] };
  } catch {
    return null;
  }
}

export async function deleteAgentGrower(
  agentId: string,
  email: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const enc = encodeURIComponent(email.trim().toLowerCase());
  const res = await fetch(
    `/api/agents/${encodeURIComponent(agentId)}/growers/${enc}`,
    {
      method: "DELETE",
      credentials: "include",
    },
  );
  let data: { ok?: boolean; error?: string } = {};
  try {
    data = (await res.json()) as typeof data;
  } catch {
    /* empty */
  }
  if (!res.ok) {
    return {
      ok: false,
      error: data.error ?? "No se pudo quitar el grower",
    };
  }
  if (data.ok) {
    return { ok: true };
  }
  return { ok: false, error: "Respuesta inválida del servidor" };
}
