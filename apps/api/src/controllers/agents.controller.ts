import type { Context } from "hono";

import { FieldPath, type Query } from "firebase-admin/firestore";

import { AGENTS_INFO_MAX_PAGE_LIMIT } from "@/constants/agents";
import { getFirestore } from "@/lib/firestore";
import type {
  AgentDocument,
  AgentsInfoAuthContext,
  LightAgent,
} from "@/types/agents";
import {
  buildLightAgent,
  isGrowerCursor,
  parseAgentDoc,
} from "@/utils/agents";
import {
  extractFirestoreIndexUrl,
  firestoreFailureHint,
  isFirebaseConfigError,
} from "@/utils/firestore/errors";
import { isOperationsAdmin } from "@/utils/operations-access";

export const getAgentsInfo = async (
  c: Context,
  authCtx: AgentsInfoAuthContext,
) => {
  const admin = isOperationsAdmin(authCtx.userRole);
  const emailNorm = authCtx.userEmail?.toLowerCase().trim() ?? "";

  const light = c.req.query("light") === "1";
  const includePrompt = !light;

  const limitRaw = c.req.query("limit");
  const cursor = c.req.query("cursor")?.trim() || undefined;
  const usePagination =
    light &&
    limitRaw != null &&
    limitRaw !== "" &&
    !Number.isNaN(Number(limitRaw));
  const pageLimit = usePagination
    ? Math.min(
        AGENTS_INFO_MAX_PAGE_LIMIT,
        Math.max(1, Math.floor(Number(limitRaw))),
      )
    : null;

  if (!light && !admin) {
    return c.json(
      { error: "Este listado no está disponible para tu rol." },
      403,
    );
  }

  try {
    const database = getFirestore();
    const collRef = database.collection("agent_configurations");

    if (light && !admin) {
      if (!emailNorm) {
        return c.json({ agents: [], nextCursor: null });
      }
      const effectiveLimit = Math.min(AGENTS_INFO_MAX_PAGE_LIMIT, pageLimit ?? 15);
      // Collection group no permite filtrar por "solo el último segmento" del path con documentId();
      // hace falta el campo indexado `email` (puede coincidir con el ID del doc si usas correo como id).
      let growerQ: Query = database
        .collectionGroup("growers")
        .where("email", "==", emailNorm)
        .orderBy(FieldPath.documentId())
        .limit(effectiveLimit);
      if (cursor) {
        if (!isGrowerCursor(cursor)) {
          return c.json(
            { error: "cursor inválido para el modo miembro" },
            400,
          );
        }
        const cursorSnap = await database.doc(cursor).get();
        if (!cursorSnap.exists) {
          return c.json({ error: "cursor inválido o documento no encontrado" }, 400);
        }
        growerQ = growerQ.startAfter(cursorSnap);
      }
      const growerSnap = await growerQ.get();
      const orderedAgentIds: string[] = [];
      const seen = new Set<string>();
      for (const d of growerSnap.docs) {
        const parent = d.ref.parent.parent;
        if (!parent) continue;
        const agentId = parent.id;
        if (seen.has(agentId)) continue;
        seen.add(agentId);
        orderedAgentIds.push(agentId);
      }
      const agentRows = (
        await Promise.all(
          orderedAgentIds.map(async (agentId) => {
            const agentDoc = await collRef.doc(agentId).get();
            if (!agentDoc.exists) return null;
            return buildLightAgent(
              database,
              agentDoc as AgentDocument,
            );
          }),
        )
      ).filter((row): row is LightAgent => row != null);

      const lastGrower = growerSnap.docs[growerSnap.docs.length - 1];
      const nextCursor =
        growerSnap.docs.length === effectiveLimit && lastGrower != null
          ? lastGrower.ref.path
          : null;
      return c.json({ agents: agentRows, nextCursor });
    }

    // Admin (o rutas no light ya filtradas arriba)
    let agentsSnapshot;
    if (usePagination && pageLimit != null) {
      let query: Query = collRef
        .orderBy(FieldPath.documentId())
        .limit(pageLimit);
      if (cursor) {
        if (isGrowerCursor(cursor)) {
          return c.json(
            { error: "cursor de grower no válido para listado de administrador" },
            400,
          );
        }
        const cursorDoc = await collRef.doc(cursor).get();
        if (!cursorDoc.exists) {
          return c.json(
            { error: "cursor inválido o documento no encontrado" },
            400,
          );
        }
        query = collRef
          .orderBy(FieldPath.documentId())
          .startAfter(cursorDoc)
          .limit(pageLimit);
      }
      agentsSnapshot = await query.get();
    } else {
      agentsSnapshot = await collRef.get();
    }

    if (light) {
      const agents: LightAgent[] = [];
      for (const doc of agentsSnapshot.docs) {
        const row = await buildLightAgent(database, doc as AgentDocument);
        if (row) agents.push(row);
      }
      if (usePagination) {
        const lastDoc = agentsSnapshot.docs[agentsSnapshot.docs.length - 1];
        const nextCursor =
          agentsSnapshot.docs.length === pageLimit! && lastDoc != null
            ? lastDoc.id
            : null;
        return c.json({ agents, nextCursor });
      }
      return c.json({ agents });
    }

    const agents = agentsSnapshot.docs
      .map((doc: AgentDocument) => parseAgentDoc(doc, includePrompt))
      .filter((agent): agent is NonNullable<typeof agent> => agent !== null);

    return c.json({ agents });
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
    console.error("[agents/info] Firestore:", msg);
    if (hint) {
      return c.json(
        {
          error: hint,
          ...(createIndexUrl ? { createIndexUrl } : {}),
        },
        503,
      );
    }
    return c.json(
      { error: "Error al leer agentes desde Firestore." },
      500,
    );
  }
};
