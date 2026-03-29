/**
 * Búsqueda de agentes para GET /api/agents/info?q=...
 * Replica el criterio del dashboard (nombre, dueño, industria, growers) sobre IDs ya autorizados.
 */
import type { Firestore } from "firebase-admin/firestore";

import { getFirestore, getFirestoreCommercial } from "@/lib/firestore";
import type { AgentDocument } from "@/types/agents";

import { fetchGrowersForAgent } from "./growers";
import { parseAgentDoc } from "./parseAgentDoc";

/** q normalizado (minúsculas, trim) o null si no hay búsqueda activa. */
export function normalizeAgentsSearchQuery(q: string | undefined): string | null {
  const t = q?.trim().toLowerCase() ?? "";
  return t.length > 0 ? t : null;
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
 * Indica si un agente (por ID y datos en Firestore) coincide con la subcadena `qLower`.
 * Orden: id → documento raíz (nombre, dueño, industria en MCP) → growers.
 */
export async function agentMatchesSearchQuery(
  agentId: string,
  qLower: string,
): Promise<boolean> {
  if (agentId.toLowerCase().includes(qLower)) {
    return true;
  }

  const commercial = getFirestoreCommercial();
  const production = getFirestore();
  const [comDoc, prodDoc] = await Promise.all([
    commercial.collection("agent_configurations").doc(agentId).get(),
    production.collection("agent_configurations").doc(agentId).get(),
  ]);
  const inCommercial = comDoc.exists;
  const inProduction = prodDoc.exists;
  if (!inCommercial && !inProduction) {
    return false;
  }

  const primaryDb: Firestore = inCommercial ? commercial : production;
  const primaryDoc = inCommercial ? comDoc : prodDoc;
  const data = primaryDoc.data() as Record<string, unknown> | undefined;
  if (!data) {
    return false;
  }

  const parsed = parseAgentDoc(primaryDoc as AgentDocument, false);
  if (!parsed) {
    return false;
  }

  const industry = industryFromRootData(data);
  const blob = [
    parsed.name,
    parsed.agentName,
    parsed.businessName,
    parsed.owner,
    industry,
  ]
    .join(" ")
    .toLowerCase();
  if (blob.includes(qLower)) {
    return true;
  }

  const agentRef = primaryDb.collection("agent_configurations").doc(agentId);
  const growers = await fetchGrowersForAgent(agentRef);
  return growers.some(
    (g) =>
      g.name.toLowerCase().includes(qLower) ||
      g.email.toLowerCase().includes(qLower),
  );
}
