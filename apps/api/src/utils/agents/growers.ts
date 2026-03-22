import type {
  DocumentReference,
  QueryDocumentSnapshot,
} from "firebase-admin/firestore";

export type GrowerPayload = {
  name: string;
  email: string;
};

/**
 * Convierte documentos de `agent_configurations/{id}/growers/{doc}` en payload de API.
 */
export function mapGrowerDocsToPayload(
  docs: QueryDocumentSnapshot[],
): GrowerPayload[] {
  const out: GrowerPayload[] = [];
  for (const d of docs) {
    const data = d.data();
    const fromField =
      typeof data.email === "string" ? data.email.trim().toLowerCase() : "";
    // Si el ID del doc es el correo (recomendado), no hace falta duplicar el campo `email`.
    const fromId =
      !fromField && d.id.includes("@")
        ? d.id.trim().toLowerCase()
        : "";
    const emailRaw = fromField || fromId;
    if (!emailRaw) continue;
    const nameRaw = typeof data.name === "string" ? data.name.trim() : "";
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
