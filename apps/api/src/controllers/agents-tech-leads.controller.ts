import type { Context } from "hono";
import type {
  DocumentReference,
  QueryDocumentSnapshot,
} from "firebase-admin/firestore";

import { getFirestore } from "@/lib/firestore";
import type { AgentsInfoAuthContext } from "@/types/agents";
import {
  extractFirestoreIndexUrl,
  firestoreFailureHint,
  isFirebaseConfigError,
} from "@/utils/firestore/errors";
import { resolveAgentWriteDatabase } from "@/utils/agents";
import { userCanAddGrowerToAgent } from "@/utils/agents/growerAccess";
import {
  fetchTechLeadsForAgent,
  mapTechLeadDocsToPayload,
} from "@/utils/agents/techLeads";
import { isValidEmail } from "@/utils/validation";

async function userIsGrowerForAgent(
  agentRef: DocumentReference,
  email: string,
): Promise<boolean> {
  const snap = await agentRef.collection("growers").doc(email).get();
  if (snap.exists) return true;
  const all = await agentRef.collection("growers").get();
  const normalizedEmail = email.trim().toLowerCase();
  for (const d of all.docs) {
    const data = d.data() as Record<string, unknown>;
    if (data.email === normalizedEmail) return true;
  }
  return false;
}

export async function postAgentTechLead(
  c: Context,
  authCtx: AgentsInfoAuthContext,
  agentId: string,
) {
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "JSON inválido" }, 400);
  }
  if (typeof body !== "object" || body === null) {
    return c.json({ error: "Cuerpo inválido" }, 400);
  }
  const emailRaw = (body as { email?: unknown }).email;
  const nameRaw = (body as { name?: unknown }).name;
  if (typeof emailRaw !== "string" || !isValidEmail(emailRaw)) {
    return c.json({ error: "Email inválido" }, 400);
  }
  const normalizedEmail = emailRaw.trim().toLowerCase();
  let name = typeof nameRaw === "string" ? nameRaw.trim() : "";
  if (!name) name = normalizedEmail;

  try {
    const { db, hasTestingData, inProduction } =
      await resolveAgentWriteDatabase(agentId);
    if (!hasTestingData && !inProduction) {
      return c.json({ error: "Agente no encontrado" }, 404);
    }
    const allowed = await userCanAddGrowerToAgent(authCtx, agentId);
    if (!allowed) {
      return c.json({ error: "No autorizado" }, 403);
    }
    const agentRef = db.collection("agent_configurations").doc(agentId);
    
    const existingTechLead = await agentRef.collection("techLeads").doc(normalizedEmail).get();
    if (existingTechLead.exists) {
      return c.json({ error: "Ya existe ese tech lead" }, 409);
    }
    
    const isGrower = await userIsGrowerForAgent(agentRef, normalizedEmail);
    if (isGrower) {
      return c.json({ error: "El usuario ya es grower de este agente" }, 409);
    }
    
    await agentRef.collection("techLeads").doc(normalizedEmail).set({ email: normalizedEmail, name });
    return c.json({
      ok: true,
      techLead: { email: normalizedEmail, name },
    });
  } catch (error) {
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
    console.error("[agents/techLeads] Firestore:", msg);
    if (hint) {
      return c.json(
        {
          error: hint,
          ...(createIndexUrl ? { createIndexUrl } : {}),
        },
        503,
      );
    }
    return c.json({ error: "Error al guardar el tech lead en Firestore." }, 500);
  }
}

export async function getAgentTechLeads(
  c: Context,
  authCtx: AgentsInfoAuthContext,
  agentId: string,
) {
  try {
    const db = getFirestore();
    const agentRef = db.collection("agent_configurations").doc(agentId);
    const agentSnap = await agentRef.get();
    if (!agentSnap.exists) {
      return c.json({ error: "Agente no encontrado" }, 404);
    }
    const allowed = await userCanAddGrowerToAgent(authCtx, agentId);
    if (!allowed) {
      return c.json({ error: "No autorizado" }, 403);
    }
    const techLeadsProd = await fetchTechLeadsForAgent(agentRef);
    return c.json({ techLeads: techLeadsProd });
  } catch (error) {
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
    console.error("[agents/techLeads GET] Firestore:", msg);
    if (hint) {
      return c.json(
        {
          error: hint,
          ...(createIndexUrl ? { createIndexUrl } : {}),
        },
        503,
      );
    }
    return c.json({ error: "Error al leer tech leads desde Firestore." }, 500);
  }
}

export async function deleteAgentTechLead(
  c: Context,
  authCtx: AgentsInfoAuthContext,
  agentId: string,
  techLeadEmailParam: string,
) {
  let normalizedEmail: string;
  try {
    normalizedEmail = decodeURIComponent(techLeadEmailParam).trim().toLowerCase();
  } catch {
    return c.json({ error: "Email inválido" }, 400);
  }
  if (!isValidEmail(normalizedEmail)) {
    return c.json({ error: "Email inválido" }, 400);
  }

  try {
    const db = getFirestore();
    const agentRef = db.collection("agent_configurations").doc(agentId);
    const agentSnap = await agentRef.get();
    if (!agentSnap.exists) {
      return c.json({ error: "Agente no encontrado" }, 404);
    }
    const allowed = await userCanAddGrowerToAgent(authCtx, agentId);
    if (!allowed) {
      return c.json({ error: "No autorizado" }, 403);
    }

    const tryDeleteFrom = async (agentRef: DocumentReference): Promise<boolean> => {
      const col = agentRef.collection("techLeads");
      const direct = await col.doc(normalizedEmail).get();
      if (direct.exists) {
        await direct.ref.delete();
        return true;
      }
      const all = await col.get();
      for (const d of all.docs) {
        const mapped = mapTechLeadDocsToPayload([d as QueryDocumentSnapshot]);
        if (mapped[0]?.email === normalizedEmail) {
          await d.ref.delete();
          return true;
        }
      }
      return false;
    };

    const deleted = await tryDeleteFrom(agentRef);

    if (!deleted) {
      return c.json({ error: "Tech lead no encontrado" }, 404);
    }
    return c.json({ ok: true });
  } catch (error) {
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
    console.error("[agents/techLeads DELETE] Firestore:", msg);
    if (hint) {
      return c.json(
        {
          error: hint,
          ...(createIndexUrl ? { createIndexUrl } : {}),
        },
        503,
      );
    }
    return c.json({ error: "Error al eliminar el tech lead en Firestore." }, 500);
  }
}
