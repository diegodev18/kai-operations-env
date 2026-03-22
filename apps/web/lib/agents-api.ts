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
