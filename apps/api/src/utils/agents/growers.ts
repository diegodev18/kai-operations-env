import type {
  DocumentReference,
  QueryDocumentSnapshot,
} from "firebase-admin/firestore";

import type { GrowerPayload } from "@/types/collaborators";

/**
 * Convierte documentos de `agent_configurations/{id}/growers/{doc}` en payload de API.
 */
function emailFromGrowerData(data: Record<string, unknown>): string {
  const tryKeys = [
    "email",
    "mail",
    "correo",
    "userEmail",
    "user_email",
    "correo_electronico",
  ] as const;
  for (const k of tryKeys) {
    const v = data[k];
    if (typeof v === "string" && v.includes("@")) {
      return v.trim().toLowerCase();
    }
  }
  return "";
}

export function mapGrowerDocsToPayload(
  docs: QueryDocumentSnapshot[],
): GrowerPayload[] {
  const out: GrowerPayload[] = [];
  for (const d of docs) {
    const data = d.data() as Record<string, unknown>;
    const fromField = emailFromGrowerData(data);
    // Si el ID del doc es el correo (recomendado), no hace falta duplicar el campo `email`.
    const fromId =
      !fromField && d.id.includes("@")
        ? d.id.trim().toLowerCase()
        : "";
    const emailRaw = fromField || fromId;
    if (!emailRaw) continue;
    const nameRaw =
      typeof data.name === "string"
        ? data.name.trim()
        : typeof data.displayName === "string"
          ? data.displayName.trim()
          : "";
    out.push({
      email: emailRaw,
      name: nameRaw.length > 0 ? nameRaw : emailRaw,
    });
  }
  return out;
}

export async function fetchGrowersForAgent(
  agentRef: DocumentReference,
): Promise<GrowerPayload[]> {
  const snap = await agentRef.collection("growers").get();
  return mapGrowerDocsToPayload(snap.docs);
}
