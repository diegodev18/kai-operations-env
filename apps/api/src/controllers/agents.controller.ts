import type { Context } from "hono";

import { FieldPath, type Query } from "firebase-admin/firestore";

import { AGENTS_INFO_MAX_PAGE_LIMIT } from "@/constants/agents";
import { getFirestore, getFirestoreCommercial } from "@/lib/firestore";
import type {
  AgentDocument,
  AgentsInfoAuthContext,
  LightAgent,
} from "@/types/agents";
import {
  agentMatchesGrowersSearchQuery,
  agentMatchesRootSearchQuery,
  agentMatchesSearchQuery,
  buildLightAgent,
  isGrowerCursor,
  normalizeAgentsSearchQuery,
  parseAgentDoc,
} from "@/utils/agents";
import {
  extractFirestoreIndexUrl,
  firestoreFailureHint,
  isFirebaseConfigError,
} from "@/utils/firestore/errors";
import { isOperationsAdmin } from "@/utils/operations-access";
import { auth } from "@/lib/auth";
import { db } from "@/db/client";
import { user } from "@/db/schema/auth";
import { eq } from "drizzle-orm";

/** Cursor legacy: path growers; nuevo: agent id. */
function cursorToAgentIdStart(cursor: string): string {
  if (cursor.includes("/growers/")) {
    const parts = cursor.split("/");
    const i = parts.indexOf("agent_configurations");
    if (i >= 0 && parts[i + 1]) return parts[i + 1]!;
  }
  return cursor;
}

async function buildLightAgentWithDeployment(
  agentId: string,
): Promise<LightAgent | null> {
  const commercial = getFirestoreCommercial();
  const production = getFirestore();
  const [comDoc, prodDoc] = await Promise.all([
    commercial.collection("agent_configurations").doc(agentId).get(),
    production.collection("agent_configurations").doc(agentId).get(),
  ]);
  const inCommercial = comDoc.exists;
  const inProduction = prodDoc.exists;
  if (!inCommercial && !inProduction) return null;

  const primaryDb = inCommercial ? commercial : production;
  const primaryDoc = inCommercial ? comDoc : prodDoc;
  const row = await buildLightAgent(primaryDb, primaryDoc as AgentDocument);
  if (!row) return null;
  return {
    ...row,
    inCommercial,
    inProduction,
  };
}

/** Retorna IDs únicos y mapas de datos (comercial, producción) para evitar re-fetches. */
async function mergedAgentIdsAndData(): Promise<{
  sortedIds: string[];
  commercialMap: Map<string, Record<string, unknown>>;
  productionMap: Map<string, Record<string, unknown>>;
}> {
  const commercial = getFirestoreCommercial();
  const production = getFirestore();
  const [comSnap, prodSnap] = await Promise.all([
    commercial.collection("agent_configurations").get(),
    production.collection("agent_configurations").get(),
  ]);

  const commercialMap = new Map<string, Record<string, unknown>>();
  const productionMap = new Map<string, Record<string, unknown>>();
  const idSet = new Set<string>();

  for (const d of comSnap.docs) {
    idSet.add(d.id);
    commercialMap.set(d.id, d.data() as Record<string, unknown>);
  }
  for (const d of prodSnap.docs) {
    idSet.add(d.id);
    productionMap.set(d.id, d.data() as Record<string, unknown>);
  }

  return {
    sortedIds: [...idSet].sort((a, b) => a.localeCompare(b)),
    commercialMap,
    productionMap,
  };
}

/** Paginación sobre `sortedIds` filtrando por subcadena `qLower` (coincidencias consecutivas en orden). */
async function paginateLightAgentsWithSearch(
  sortedIds: string[],
  qLower: string,
  cursor: string | undefined,
  effectiveLimit: number,
  docsMaps: {
    commercial: Map<string, Record<string, unknown>>;
    production: Map<string, Record<string, unknown>>;
  },
): Promise<{ agents: LightAgent[]; nextCursor: string | null }> {
  let startIdx = 0;
  if (cursor) {
    const lastId = cursorToAgentIdStart(cursor);
    const idx = sortedIds.indexOf(lastId);
    startIdx = idx >= 0 ? idx + 1 : 0;
  }
  const agents: LightAgent[] = [];

  // Procesamos en lotes para paralelizar el acceso a subcolecciones de growers
  const CHUNK_SIZE = 50;
  for (let i = startIdx; i < sortedIds.length; i += CHUNK_SIZE) {
    const chunk = sortedIds.slice(i, i + CHUNK_SIZE);

    // 1. Identificar quiénes coinciden (Memoria rápida + Growers paralelo)
    const matchTasks = chunk.map(async (id) => {
      const data = docsMaps.commercial.get(id) ?? docsMaps.production.get(id);
      // Coincidencia rápida en raíz
      if (data && agentMatchesRootSearchQuery(id, qLower, data)) {
        return id;
      }
      // Coincidencia lenta en growers (paralelizada por el map/Promise.all)
      const prefetched = {
        commercial: docsMaps.commercial.get(id) ?? null,
        production: docsMaps.production.get(id) ?? null,
      };
      const ok = await agentMatchesGrowersSearchQuery(id, qLower, prefetched);
      return ok ? id : null;
    });

    const results = await Promise.all(matchTasks);
    const matchesInChunk = results.filter((id): id is string => id !== null);

    // 2. Construir los resultados para este lote
    for (const id of matchesInChunk) {
      const row = await buildLightAgentWithDeployment(id);
      if (row) {
        agents.push(row);
        if (agents.length >= effectiveLimit) {
          return { agents, nextCursor: id };
        }
      }
    }
  }

  return { agents, nextCursor: null };
}

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

  const searchQ = normalizeAgentsSearchQuery(c.req.query("q"));

  if (!light && !admin) {
    return c.json(
      { error: "Este listado no está disponible para tu rol." },
      403,
    );
  }

  try {
    const commercial = getFirestoreCommercial();
    const production = getFirestore();

    if (light && !admin) {
      if (!emailNorm) {
        return c.json({ agents: [], nextCursor: null });
      }
      const effectiveLimit = Math.min(AGENTS_INFO_MAX_PAGE_LIMIT, pageLimit ?? 15);

      const [growerCom, growerProd] = await Promise.all([
        commercial
          .collectionGroup("growers")
          .where("email", "==", emailNorm)
          .get(),
        production
          .collectionGroup("growers")
          .where("email", "==", emailNorm)
          .get(),
      ]);

      const idSet = new Set<string>();
      for (const d of growerCom.docs) {
        const parent = d.ref.parent.parent;
        if (parent) idSet.add(parent.id);
      }
      for (const d of growerProd.docs) {
        const parent = d.ref.parent.parent;
        if (parent) idSet.add(parent.id);
      }
      const sortedIds = [...idSet].sort((a, b) => a.localeCompare(b));

      if (searchQ) {
        const { agents: agentRows, nextCursor } =
          await paginateLightAgentsWithSearch(
            sortedIds,
            searchQ,
            cursor,
            effectiveLimit,
            { commercial: new Map(), production: new Map() },
          );
        return c.json({ agents: agentRows, nextCursor });
      }

      let startIdx = 0;
      if (cursor) {
        const lastId = cursorToAgentIdStart(cursor);
        const idx = sortedIds.indexOf(lastId);
        startIdx = idx >= 0 ? idx + 1 : 0;
      }

      const pageIds = sortedIds.slice(startIdx, startIdx + effectiveLimit);
      const agentRows = (
        await Promise.all(
          pageIds.map((agentId) => buildLightAgentWithDeployment(agentId)),
        )
      ).filter((row): row is LightAgent => row != null);

      const nextCursor =
        pageIds.length === effectiveLimit ? pageIds[pageIds.length - 1]! : null;

      return c.json({ agents: agentRows, nextCursor });
    }

    const collRefProd = production.collection("agent_configurations");

    if (admin && light) {
      const effectiveLimit = pageLimit ?? 15;
      const { sortedIds, commercialMap, productionMap } =
        await mergedAgentIdsAndData();

      if (searchQ) {
        if (cursor && isGrowerCursor(cursor)) {
          return c.json(
            { error: "cursor de grower no válido para listado de administrador" },
            400,
          );
        }
        const { agents, nextCursor } = await paginateLightAgentsWithSearch(
          sortedIds,
          searchQ,
          cursor,
          effectiveLimit,
          { commercial: commercialMap, production: productionMap },
        );
        return c.json({ agents, nextCursor });
      }

      let startIdx = 0;
      if (cursor) {
        if (isGrowerCursor(cursor)) {
          return c.json(
            { error: "cursor de grower no válido para listado de administrador" },
            400,
          );
        }
        const lastId = cursor;
        const idx = sortedIds.indexOf(lastId);
        startIdx = idx >= 0 ? idx + 1 : 0;
      }

      const pageIds = sortedIds.slice(startIdx, startIdx + effectiveLimit);
      const agents: LightAgent[] = [];
      for (const id of pageIds) {
        const row = await buildLightAgentWithDeployment(id);
        if (row) agents.push(row);
      }
      const nextCursor =
        pageIds.length === effectiveLimit ? pageIds[pageIds.length - 1]! : null;
      return c.json({ agents, nextCursor });
    }

    if (admin && !light) {
      let agentsSnapshot;
      if (usePagination && pageLimit != null) {
        let query: Query = collRefProd
          .orderBy(FieldPath.documentId())
          .limit(pageLimit);
        if (cursor) {
          if (isGrowerCursor(cursor)) {
            return c.json(
              { error: "cursor de grower no válido para listado de administrador" },
              400,
            );
          }
          const cursorDoc = await collRefProd.doc(cursor).get();
          if (!cursorDoc.exists) {
            return c.json(
              { error: "cursor inválido o documento no encontrado" },
              400,
            );
          }
          query = collRefProd
            .orderBy(FieldPath.documentId())
            .startAfter(cursorDoc)
            .limit(pageLimit);
        }
        agentsSnapshot = await query.get();
      } else {
        agentsSnapshot = await collRefProd.get();
      }

      const agents = agentsSnapshot.docs
        .map((doc: AgentDocument) => parseAgentDoc(doc, includePrompt))
        .filter((agent): agent is NonNullable<typeof agent> => agent !== null);

      if (usePagination && pageLimit != null) {
        const lastDoc = agentsSnapshot.docs[agentsSnapshot.docs.length - 1];
        const nextCursor =
          agentsSnapshot.docs.length === pageLimit && lastDoc != null
            ? lastDoc.id
            : null;
        return c.json({ agents, nextCursor });
      }
      return c.json({ agents });
    }

    return c.json({ agents: [] });
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

export async function assignAgentToUser(
  c: Context,
  _authCtx: AgentsInfoAuthContext,
  agentId: string,
) {
  const commercial = getFirestoreCommercial();
  const agentSnap = await commercial.collection("agent_configurations").doc(agentId).get();
  if (!agentSnap.exists) {
    return c.json({ error: "El agente no existe en asistente comercial" }, 404);
  }

  const session = await auth.api.getSession({ headers: c.req.raw.headers });
  if (!session?.user?.id) {
    return c.json({ error: "No autorizado" }, 401);
  }

  const userId = session.user.id as string;
  const rows = await db.select({ phone: user.phone, name: user.name }).from(user).where(eq(user.id, userId)).limit(1);
  if (!rows[0]) {
    return c.json({ error: "Usuario no encontrado" }, 404);
  }

  const phone = rows[0].phone;
  if (!phone || phone.trim().length === 0) {
    return c.json({ error: "El usuario no tiene teléfono configurado" }, 400);
  }

  const phoneId = phone.trim();
  const userName = rows[0].name ?? session.user.name ?? "";
  const assignmentRef = commercial.collection("agents_assignment").doc(phoneId);
  const assignmentSnap = await assignmentRef.get();

  if (assignmentSnap.exists) {
    await assignmentRef.update({
      custom_agent_doc_id: agentId,
      agente: "KAIROUTER",
      name: userName,
    });
  } else {
    await assignmentRef.set({
      custom_agent_doc_id: agentId,
      agente: "KAIROUTER",
      name: userName,
    });
  }

  return c.json({ ok: true });
}
