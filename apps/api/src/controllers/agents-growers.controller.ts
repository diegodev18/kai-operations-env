import type { Context } from "hono";
import type {
  DocumentReference,
  QueryDocumentSnapshot,
} from "firebase-admin/firestore";

import { getFirestore, getFirestoreCommercial } from "@/lib/firestore";
import type { AgentsInfoAuthContext } from "@/types/agents";
import {
  extractFirestoreIndexUrl,
  firestoreFailureHint,
  isFirebaseConfigError,
} from "@/utils/firestore/errors";
import { resolveAgentWriteDatabase } from "@/utils/agents";
import { userCanAddGrowerToAgent } from "@/utils/agents/growerAccess";
import {
  fetchGrowersForAgent,
  mapGrowerDocsToPayload,
} from "@/utils/agents/growers";
import { isValidEmail } from "@/utils/validation";

export async function postAgentGrower(
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
    const { db, inCommercial, inProduction } =
      await resolveAgentWriteDatabase(agentId);
    if (!inCommercial && !inProduction) {
      return c.json({ error: "Agente no encontrado" }, 404);
    }
    const allowed = await userCanAddGrowerToAgent(authCtx, agentId);
    if (!allowed) {
      return c.json({ error: "No autorizado" }, 403);
    }
    const agentRef = db.collection("agent_configurations").doc(agentId);
    const growerRef = agentRef.collection("growers").doc(normalizedEmail);
    const existing = await growerRef.get();
    if (existing.exists) {
      return c.json({ error: "Ya existe ese grower" }, 409);
    }
    await growerRef.set({ email: normalizedEmail, name });
    return c.json({
      ok: true,
      grower: { email: normalizedEmail, name },
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
    console.error("[agents/growers] Firestore:", msg);
    if (hint) {
      return c.json(
        {
          error: hint,
          ...(createIndexUrl ? { createIndexUrl } : {}),
        },
        503,
      );
    }
    return c.json({ error: "Error al guardar el grower en Firestore." }, 500);
  }
}

export async function getAgentGrowers(
  c: Context,
  authCtx: AgentsInfoAuthContext,
  agentId: string,
) {
  try {
    const commercial = getFirestoreCommercial();
    const production = getFirestore();
    const comRef = commercial.collection("agent_configurations").doc(agentId);
    const prodRef = production.collection("agent_configurations").doc(agentId);
    const [comSnap, prodSnap] = await Promise.all([comRef.get(), prodRef.get()]);
    if (!comSnap.exists && !prodSnap.exists) {
      return c.json({ error: "Agente no encontrado" }, 404);
    }
    const allowed = await userCanAddGrowerToAgent(authCtx, agentId);
    if (!allowed) {
      return c.json({ error: "No autorizado" }, 403);
    }
    const growersCom = comSnap.exists ? await fetchGrowersForAgent(comRef) : [];
    const growersProd = prodSnap.exists
      ? await fetchGrowersForAgent(prodRef)
      : [];
    const byEmail = new Map<string, (typeof growersCom)[0]>();
    for (const g of growersCom) {
      byEmail.set(g.email, g);
    }
    for (const g of growersProd) {
      if (!byEmail.has(g.email)) {
        byEmail.set(g.email, g);
      }
    }
    return c.json({ growers: [...byEmail.values()] });
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
    console.error("[agents/growers GET] Firestore:", msg);
    if (hint) {
      return c.json(
        {
          error: hint,
          ...(createIndexUrl ? { createIndexUrl } : {}),
        },
        503,
      );
    }
    return c.json({ error: "Error al leer growers desde Firestore." }, 500);
  }
}

export async function deleteAgentGrower(
  c: Context,
  authCtx: AgentsInfoAuthContext,
  agentId: string,
  growerEmailParam: string,
) {
  let normalizedEmail: string;
  try {
    normalizedEmail = decodeURIComponent(growerEmailParam).trim().toLowerCase();
  } catch {
    return c.json({ error: "Email inválido" }, 400);
  }
  if (!isValidEmail(normalizedEmail)) {
    return c.json({ error: "Email inválido" }, 400);
  }

  try {
    const commercial = getFirestoreCommercial();
    const production = getFirestore();
    const comRef = commercial.collection("agent_configurations").doc(agentId);
    const prodRef = production.collection("agent_configurations").doc(agentId);
    const [comSnap, prodSnap] = await Promise.all([comRef.get(), prodRef.get()]);
    if (!comSnap.exists && !prodSnap.exists) {
      return c.json({ error: "Agente no encontrado" }, 404);
    }
    const allowed = await userCanAddGrowerToAgent(authCtx, agentId);
    if (!allowed) {
      return c.json({ error: "No autorizado" }, 403);
    }

    const tryDeleteFrom = async (agentRef: DocumentReference): Promise<boolean> => {
      const col = agentRef.collection("growers");
      const direct = await col.doc(normalizedEmail).get();
      if (direct.exists) {
        await direct.ref.delete();
        return true;
      }
      const all = await col.get();
      for (const d of all.docs) {
        const mapped = mapGrowerDocsToPayload([d as QueryDocumentSnapshot]);
        if (mapped[0]?.email === normalizedEmail) {
          await d.ref.delete();
          return true;
        }
      }
      return false;
    };

    let deleted = false;
    if (comSnap.exists) {
      deleted = (await tryDeleteFrom(comRef)) || deleted;
    }
    if (prodSnap.exists) {
      deleted = (await tryDeleteFrom(prodRef)) || deleted;
    }

    if (!deleted) {
      return c.json({ error: "Grower no encontrado" }, 404);
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
    console.error("[agents/growers DELETE] Firestore:", msg);
    if (hint) {
      return c.json(
        {
          error: hint,
          ...(createIndexUrl ? { createIndexUrl } : {}),
        },
        503,
      );
    }
    return c.json({ error: "Error al eliminar el grower en Firestore." }, 500);
  }
}
