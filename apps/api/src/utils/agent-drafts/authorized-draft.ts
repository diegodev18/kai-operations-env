import type { DocumentReference } from "firebase-admin/firestore";

import { getFirestore } from "@/lib/firestore";
import type { AgentsInfoAuthContext } from "@/types/agents";

import { AGENT_CONFIGURATIONS } from "./constants";
import { canAccessDraft } from "./access";

export async function getAuthorizedDraftRef(
  authCtx: AgentsInfoAuthContext,
  draftId: string,
): Promise<
  | {
      ok: true;
      draftRef: DocumentReference;
      draftData: Record<string, unknown>;
    }
  | { ok: false; code: 403 | 404 }
> {
  const db = getFirestore();
  const draftRef = db.collection(AGENT_CONFIGURATIONS).doc(draftId);
  const snap = await draftRef.get();
  if (!snap.exists) {
    return { ok: false, code: 404 };
  }
  const draftData = snap.data() ?? {};
  if (!canAccessDraft(authCtx, draftData)) {
    return { ok: false, code: 403 };
  }
  return { ok: true, draftRef, draftData };
}
