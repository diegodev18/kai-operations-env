import type { Context } from "hono";
import { z } from "zod";

import { getFirestore, getFirestoreCommercial } from "@/lib/firestore";
import {
  syncAgentFromCommercialToProduction,
  syncAgentFromProductionToCommercial,
} from "@/services/agent-firestore-sync";
import type { AgentsInfoAuthContext } from "@/types/agents";
import {
  extractFirestoreIndexUrl,
  firestoreFailureHint,
  isFirebaseConfigError,
} from "@/utils/firestore/errors";
import { userCanAccessAgent } from "@/utils/agents";

const promoteBodySchema = z.object({
  subcollections: z.array(z.string().min(1)).min(1),
  confirmation_agent_name: z.string().trim().min(1),
});

function handleError(c: Context, error: unknown, logPrefix: string) {
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
  console.error(`${logPrefix}`, msg);
  if (hint) {
    return c.json(
      { error: hint, ...(createIndexUrl ? { createIndexUrl } : {}) },
      503,
    );
  }
  return c.json({ error: msg }, 500);
}

/**
 * Producción (kai) → asistente comercial (doc + subcolecciones fijas, recursivo).
 */
export async function postSyncFromProduction(
  c: Context,
  authCtx: AgentsInfoAuthContext,
  agentId: string,
) {
  try {
    const ok = await userCanAccessAgent(authCtx, agentId);
    if (!ok) {
      return c.json({ error: "No autorizado para este agente" }, 403);
    }
    const prod = getFirestore();
    const com = getFirestoreCommercial();
    const prodSnap = await prod
      .collection("agent_configurations")
      .doc(agentId)
      .get();
    if (!prodSnap.exists) {
      return c.json({ error: "El agente no existe en producción" }, 404);
    }
    await syncAgentFromProductionToCommercial(prod, com, agentId);
    return c.json({ ok: true });
  } catch (error) {
    const r = handleError(c, error, "[agents sync-from-production]");
    return r ?? c.json({ error: "No se pudo sincronizar desde producción." }, 500);
  }
}

/**
 * Asistente comercial → producción (subcolecciones elegidas + nombre del agente).
 */
export async function postPromoteToProduction(
  c: Context,
  authCtx: AgentsInfoAuthContext,
  agentId: string,
) {
  let raw: unknown;
  try {
    raw = await c.req.json();
  } catch {
    return c.json({ error: "JSON inválido" }, 400);
  }
  const parsed = promoteBodySchema.safeParse(raw);
  if (!parsed.success) {
    const msg = parsed.error.issues.map((i) => i.message).join("; ");
    return c.json({ error: msg }, 400);
  }

  try {
    const ok = await userCanAccessAgent(authCtx, agentId);
    if (!ok) {
      return c.json({ error: "No autorizado para este agente" }, 403);
    }
    const com = getFirestoreCommercial();
    const prod = getFirestore();
    const comRef = com.collection("agent_configurations").doc(agentId);
    const snap = await comRef.get();
    if (!snap.exists) {
      return c.json(
        { error: "El agente no existe en asistente comercial" },
        404,
      );
    }
    const data = snap.data() ?? {};
    const agentName =
      typeof data.agent_name === "string" ? data.agent_name.trim() : "";
    if (
      parsed.data.confirmation_agent_name.trim() !== agentName ||
      agentName.length === 0
    ) {
      return c.json(
        {
          error:
            "El nombre de confirmación no coincide con el nombre del agente en comercial.",
        },
        400,
      );
    }
    await syncAgentFromCommercialToProduction(
      com,
      prod,
      agentId,
      parsed.data.subcollections,
    );
    return c.json({ ok: true });
  } catch (error) {
    const r = handleError(c, error, "[agents promote-to-production]");
    return r ?? c.json({ error: "No se pudo promover a producción." }, 500);
  }
}
