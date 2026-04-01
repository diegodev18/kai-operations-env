/**
 * Búsqueda de agentes para GET /api/agents/info?q=...
 * Replica el criterio del dashboard (nombre, dueño, industria, growers) sobre IDs ya autorizados.
 */
import type { Firestore } from "firebase-admin/firestore";

import { getFirestore } from "@/lib/firestore";
import type { AgentDocument } from "@/types/agents";

import { fetchGrowersForAgent } from "./growers";
import { parseAgentDoc } from "./parseAgentDoc";

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
  if (agentId.toLowerCase().includes(qLower)) {
    return true;
  }

  const businessName =
    typeof data.business_name === "string" ? data.business_name : "";
  const agentName = typeof data.agent_name === "string" ? data.agent_name : "";
  const ownerName = typeof data.owner_name === "string" ? data.owner_name : "";

  const industry = industryFromRootData(data);
  const blob = [businessName, agentName, ownerName, industry]
    .join(" ")
    .toLowerCase();

  return blob.includes(qLower);
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
 * Busca coincidencia específicamente en la subcolección de growers.
 * Asíncrono y lento.
 */
export async function agentMatchesGrowersSearchQuery(
  agentId: string,
  qLower: string,
  prefetchedData?: {
    commercial?: Record<string, unknown> | null;
    production?: Record<string, unknown> | null;
  },
): Promise<boolean> {
  const db = getFirestore();

  let prodData = prefetchedData?.production;

  if (prefetchedData === undefined) {
    const prodDoc = await db.collection("agent_configurations").doc(agentId).get();
    prodData = prodDoc.exists ? (prodDoc.data() as Record<string, unknown>) : null;
  }

  const agentRef = db.collection("agent_configurations").doc(agentId);
  const growers = await fetchGrowersForAgent(agentRef);

  return growers.some(
    (g) =>
      g.name.toLowerCase().includes(qLower) ||
      g.email.toLowerCase().includes(qLower),
  );
}

/**
 * Legacy/Simple: Indica si un agente coincide por raíz O growers.
 */
export async function agentMatchesSearchQuery(
  agentId: string,
  qLower: string,
  prefetchedData?: {
    commercial?: Record<string, unknown> | null;
    production?: Record<string, unknown> | null;
  },
): Promise<boolean> {
  const prodData = prefetchedData?.production;
  const data = prodData;

  if (data && agentMatchesRootSearchQuery(agentId, qLower, data)) {
    return true;
  }

  return await agentMatchesGrowersSearchQuery(agentId, qLower, prefetchedData);
}
