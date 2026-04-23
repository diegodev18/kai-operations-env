import type { Context } from "hono";

import { getFirestore } from "@/lib/firestore";
import type { AgentsInfoAuthContext } from "@/types/agents-types";
import { userCanAccessAgent } from "@/utils/agents";
import {
  extractFirestoreIndexUrl,
  firestoreFailureHint,
  isFirebaseConfigError,
} from "@/utils/firestore/errors";

function toIsoConnectedAt(value: unknown): string | null {
  if (value == null) return null;
  if (typeof value === "string") return value;
  if (
    typeof value === "object" &&
    value !== null &&
    typeof (value as { toDate?: () => Date }).toDate === "function"
  ) {
    const d = (value as { toDate: () => Date }).toDate();
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
  }
  return null;
}

function handleFirestoreError(c: Context, error: unknown, logPrefix: string) {
  if (isFirebaseConfigError(error)) {
    return c.json(
      {
        error:
          "Firebase no configurado. Define credenciales de servicio (env o tokens).",
      },
      503,
    );
  }
  const hint = firestoreFailureHint(error);
  const msg = error instanceof Error ? error.message : String(error);
  const createIndexUrl = extractFirestoreIndexUrl(msg);
  console.error(`${logPrefix} Firestore:`, msg);
  if (hint) {
    return c.json(
      { error: hint, ...(createIndexUrl ? { createIndexUrl } : {}) },
      503,
    );
  }
  return c.json({ error: "Error al acceder a Firestore." }, 500);
}

/**
 * Lista integraciones WhatsApp vinculadas al agente (sin tokens ni datos sensibles).
 */
export async function getWhatsappIntegrationStatus(
  c: Context,
  authCtx: AgentsInfoAuthContext,
  agentId: string,
) {
  try {
    const ok = await userCanAccessAgent(authCtx, agentId);
    if (!ok) {
      return c.json({ error: "No autorizado para este agente" }, 403);
    }
  } catch (error) {
    return handleFirestoreError(c, error, "[whatsapp integration status access]");
  }

  try {
    const db = getFirestore();
    const snap = await db
      .collection("whatsapp_integrations")
      .where("agentDocId", "==", agentId)
      .limit(10)
      .get();

    const items = snap.docs.map((doc) => {
      const d = doc.data() as Record<string, unknown>;
      return {
        id: doc.id,
        phoneNumber: typeof d.phoneNumber === "string" ? d.phoneNumber : undefined,
        formattedPhoneNumber:
          typeof d.formattedPhoneNumber === "string" ? d.formattedPhoneNumber : undefined,
        setupStatus: typeof d.setupStatus === "string" ? d.setupStatus : undefined,
        registrationStatus:
          typeof d.registrationStatus === "string" ? d.registrationStatus : undefined,
        connectedAt: toIsoConnectedAt(d.connectedAt),
        isCoexistence: d.isCoexistence === true,
      };
    });

    return c.json({ items });
  } catch (error) {
    return handleFirestoreError(c, error, "[whatsapp integration status GET]");
  }
}
