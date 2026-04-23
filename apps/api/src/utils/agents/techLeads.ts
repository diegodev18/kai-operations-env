import type {
  DocumentReference,
  QueryDocumentSnapshot,
} from "firebase-admin/firestore";

import type { TechLeadPayload } from "@/types/collaborators";

function emailFromTechLeadData(data: Record<string, unknown>): string {
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

export function mapTechLeadDocsToPayload(
  docs: QueryDocumentSnapshot[],
): TechLeadPayload[] {
  const out: TechLeadPayload[] = [];
  for (const d of docs) {
    const data = d.data() as Record<string, unknown>;
    const fromField = emailFromTechLeadData(data);
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

export async function fetchTechLeadsForAgent(
  agentRef: DocumentReference,
): Promise<TechLeadPayload[]> {
  const snap = await agentRef.collection("techLeads").get();
  return mapTechLeadDocsToPayload(snap.docs);
}
