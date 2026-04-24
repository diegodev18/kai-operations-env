import type { PropertyDocumentId } from "@/types";
import { toast } from "sonner";
import { patchAgentPropertyDoc, patchTestingPropertyDoc } from "@/services/agents-api";

export async function updateAgentPropertyDocument(
  agentId: string,
  documentId: PropertyDocumentId,
  body: Record<string, unknown>,
): Promise<boolean> {
  const result = await patchAgentPropertyDoc(agentId, documentId, body);
  if (!result.ok) {
    toast.error(result.error ?? "Error al guardar");
    return false;
  }
  return true;
}

export async function updateTestingPropertyDocument(
  agentId: string,
  documentId: PropertyDocumentId,
  body: Record<string, unknown>,
): Promise<boolean> {
  const result = await patchTestingPropertyDoc(agentId, documentId, body);
  if (!result.ok) {
    toast.error(result.error ?? "Error al guardar en testing");
    return false;
  }
  return true;
}
