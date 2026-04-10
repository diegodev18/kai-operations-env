/**
 * Búsqueda de agentes para GET /api/agents/info?q=...
 * Replica el criterio del dashboard (nombre, dueño, industria, growers, tech leads) sobre IDs ya autorizados.
 */
import type { Firestore } from "firebase-admin/firestore";

import { getFirestore } from "@/lib/firestore";
import type { AgentDocument } from "@/types/agents";

import type { GrowerPayload } from "./growers";
import type { TechLeadPayload } from "./techLeads";
import { fetchGrowersForAgent } from "./growers";
import { fetchTechLeadsForAgent } from "./techLeads";
import { parseAgentDoc } from "./parseAgentDoc";

export type PrefetchedAgentData = {
  commercial?: Record<string, unknown> | null;
  production?: Record<string, unknown> | null;
  growers?: GrowerPayload[] | null;
  techLeads?: TechLeadPayload[] | null;
};

/** q normalizado (minúsculas, trim) o null si no hay búsqueda activa. */
export function normalizeAgentsSearchQuery(
  q: string | undefined,
): string | null {
  const t = q?.trim().toLowerCase() ?? "";
  return t.length > 0 ? t : null;
}

/**
 * Indica si los campos del documento raíz (nombre, dueño, industria) coinciden.
 * Síncrono y rápido.
 */
export function agentMatchesRootSearchQuery(
  agentId: string,
  qLower: string,
  data: Record<string, unknown>,
): boolean {
  const businessName = (data.business_name as string || "").toLowerCase();
  return businessName.includes(qLower);
}

function industryFromRootData(data: Record<string, unknown>): string {
  const mcp = data.mcp_configuration;
  if (!mcp || typeof mcp !== "object") return "";
  const m = mcp as Record<string, unknown>;
  const abi = m.agent_business_info;
  if (abi && typeof abi === "object") {
    const ind = (abi as Record<string, unknown>).industry;
    if (typeof ind === "string") return ind;
  }
  return "";
}

/**
 * Busca coincidencia en subcolecciones de growers y tech leads.
 * Asíncrono - usa datos precargados si están disponibles.
 */
export async function agentMatchesGrowersSearchQuery(
  agentId: string,
  qLower: string,
  prefetchedData?: PrefetchedAgentData,
): Promise<boolean> {
  let growers = prefetchedData?.growers;
  let techLeads = prefetchedData?.techLeads;

  if (growers === undefined || techLeads === undefined) {
    const db = getFirestore();
    const agentRef = db.collection("agent_configurations").doc(agentId);
    const [growersSnap, techLeadsSnap] = await Promise.all([
      agentRef.collection("growers").get(),
      agentRef.collection("techLeads").get(),
    ]);
    if (growers === undefined) {
      growers = growersSnap.docs.map((d) => {
        const data = d.data() as Record<string, unknown>;
        const email =
          typeof data.email === "string"
            ? data.email.trim().toLowerCase()
            : d.id.includes("@")
              ? d.id.trim().toLowerCase()
              : "";
        const name = typeof data.name === "string" ? data.name.trim() : "";
        return { email, name: name || email };
      });
    }
    if (techLeads === undefined) {
      techLeads = techLeadsSnap.docs.map((d) => {
        const data = d.data() as Record<string, unknown>;
        const email =
          typeof data.email === "string"
            ? data.email.trim().toLowerCase()
            : d.id.includes("@")
              ? d.id.trim().toLowerCase()
              : "";
        const name = typeof data.name === "string" ? data.name.trim() : "";
        return { email, name: name || email };
      });
    }
  }

  const matchNameOrEmail = (name: string, email: string) =>
    name.toLowerCase().includes(qLower) ||
    email.toLowerCase().includes(qLower);

  return (
    (growers?.some((g) => matchNameOrEmail(g.name, g.email)) ?? false) ||
    (techLeads?.some((t) => matchNameOrEmail(t.name, t.email)) ?? false)
  );
}

/**
 * Legacy/Simple: Indica si un agente coincide por raíz, growers o tech leads.
 */
export async function agentMatchesSearchQuery(
  agentId: string,
  qLower: string,
  prefetchedData?: PrefetchedAgentData,
): Promise<boolean> {
  const prodData = prefetchedData?.production;

  if (prodData && agentMatchesRootSearchQuery(agentId, qLower, prodData)) {
    return true;
  }

  return await agentMatchesGrowersSearchQuery(agentId, qLower, prefetchedData);
}
