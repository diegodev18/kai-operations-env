import type { Context } from "hono";

import { FieldPath, type Query } from "firebase-admin/firestore";

import { ApiErrors } from "@/lib/api-error";
import { AGENTS_INFO_MAX_PAGE_LIMIT } from "@/constants/agents";
import { getFirestore } from "@/lib/firestore";
import type {
  AgentDocument,
  AgentsInfoAuthContext,
  LightAgent,
} from "@/types/agents";
import type { PrefetchedAgentData } from "@/utils/agents/agentSearchMatch";
import {
  agentMatchesGrowersSearchQuery,
  agentMatchesRootSearchQuery,
  agentMatchesSearchQuery,
  buildLightAgent,
  fetchGrowersForAgent,
  isGrowerCursor,
  normalizeAgentsSearchQuery,
  parseAgentDoc,
  parseAgentDocFromData,
  parseBillingDoc,
} from "@/utils/agents";
import {
  extractFirestoreIndexUrl,
  firestoreFailureHint,
  isFirebaseConfigError,
} from "@/utils/firestore/errors";
import { isOperationsAdmin, isOperationsCommercial } from "@/utils/operations-access";
import { auth } from "@/lib/auth";
import { db } from "@/db/client";
import { user, userFavoriteAgents } from "@/db/schema/auth";
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

function normalizeAgentStatus(value: unknown): "active" | "archived" {
  return value === "archived" ? "archived" : "active";
}

async function buildLightAgentWithDeployment(
  agentId: string,
  prefetchedData?: {
    production?: Record<string, unknown> | null;
    hasTestingData?: boolean;
    growers?: { name: string; email: string }[] | null;
    techLeads?: { name: string; email: string }[] | null;
  },
): Promise<LightAgent | null> {
  const db = getFirestore();
  const hasTestingData = prefetchedData?.hasTestingData ?? false;
  let prodDocData = prefetchedData?.production;

  if (!prodDocData) {
    const prodDoc = await db.collection("agent_configurations").doc(agentId).get();
    if (!prodDoc.exists) return null;
    prodDocData = prodDoc.data() as Record<string, unknown>;
  }

  const parsed = parseAgentDocFromData(agentId, prodDocData, false);
  if (!parsed) return null;

  let growers = prefetchedData?.growers ?? undefined;
  let techLeads = prefetchedData?.techLeads ?? undefined;

  const agentRef = db.collection("agent_configurations").doc(agentId);
  const fetchTasks: Promise<unknown>[] = [
    agentRef.collection("properties").doc("agent").get(),
    agentRef.collection("properties").doc("ai").get(),
    agentRef.collection("properties").doc("prompt").get(),
    agentRef.collection("properties").doc("response").get(),
    agentRef.collection("billing").doc("main").get(),
  ];

  let growersIdx: number | undefined;
  let techLeadsIdx: number | undefined;

  if (growers === undefined) {
    growersIdx = fetchTasks.length;
    fetchTasks.push(agentRef.collection("growers").get());
  }
  if (techLeads === undefined) {
    techLeadsIdx = fetchTasks.length;
    fetchTasks.push(agentRef.collection("techLeads").get());
  }

  const results = await Promise.all(fetchTasks);
  const [agentSnap, aiSnap, promptSnap, responseSnap, billingSnap] = results.slice(0, 5) as [
    FirebaseFirestore.DocumentSnapshot,
    FirebaseFirestore.DocumentSnapshot,
    FirebaseFirestore.DocumentSnapshot,
    FirebaseFirestore.DocumentSnapshot,
    FirebaseFirestore.DocumentSnapshot,
  ];

  if (growers === undefined && growersIdx !== undefined) {
    const growersSnap = results[growersIdx] as FirebaseFirestore.QuerySnapshot;
    growers = growersSnap.docs.map((d) => {
      const data = d.data() as Record<string, unknown>;
      const email = typeof data.email === "string" ? data.email.trim().toLowerCase() : (d.id.includes("@") ? d.id.trim().toLowerCase() : "");
      const name = typeof data.name === "string" ? data.name.trim() : "";
      return { email, name: name || email };
    });
  }
  growers ??= [];

  if (techLeads === undefined && techLeadsIdx !== undefined) {
    const techLeadsSnap = results[techLeadsIdx] as FirebaseFirestore.QuerySnapshot;
    techLeads = techLeadsSnap.docs.map((d) => {
      const data = d.data() as Record<string, unknown>;
      const email = typeof data.email === "string" ? data.email.trim().toLowerCase() : (d.id.includes("@") ? d.id.trim().toLowerCase() : "");
      const name = typeof data.name === "string" ? data.name.trim() : "";
      return { email, name: name || email };
    });
  }
  techLeads ??= [];

  const agentData = agentSnap.exists ? agentSnap.data() : undefined;
  const aiData = aiSnap.exists ? aiSnap.data() : undefined;
  const promptData = promptSnap.exists ? promptSnap.data() : undefined;
  const responseData = responseSnap.exists ? responseSnap.data() : undefined;
  const enabled = (agentData?.enabled as boolean | undefined) !== false;
  const modelFromAi =
    typeof aiData?.model === "string" ? aiData.model : undefined;
  const tempFromAi =
    typeof aiData?.temperature === "number"
      ? aiData.temperature
      : typeof aiData?.temperature === "string"
        ? Number(aiData.temperature)
        : undefined;
  const model =
    modelFromAi ??
    (typeof promptData?.model === "string" ? promptData.model : undefined);
  const temperature = Number.isFinite(tempFromAi)
    ? tempFromAi
    : typeof promptData?.temperature === "number"
      ? promptData.temperature
      : typeof promptData?.temperature === "string"
        ? Number(promptData.temperature)
        : undefined;
  const waitTime =
    typeof responseData?.waitTime === "number"
      ? responseData.waitTime
      : typeof responseData?.waitTime === "string"
        ? Number(responseData.waitTime)
        : undefined;
  const status = normalizeAgentStatus(prodDocData?.status);

  return {
    ...parsed,
    growers,
    techLeads,
    enabled,
    injectCommandsInPrompt:
      agentData?.injectCommandsInPrompt === true ||
      agentData?.isCommandsEnable === true,
    isMultiMessageResponseEnable: agentData?.isMultiMessageResponseEnable as
      | boolean
      | undefined,
    isValidatorAgentEnable: agentData?.isValidatorAgentEnable as
      | boolean
      | undefined,
    model: model ?? undefined,
    omitFirstEchoes: agentData?.omitFirstEchoes as boolean | undefined,
    temperature: Number.isFinite(temperature) ? temperature : undefined,
    waitTime: Number.isFinite(waitTime) ? waitTime : undefined,
    billing: billingSnap.exists ? parseBillingDoc(billingSnap) : undefined,
    status,
  };
}

/** Retorna IDs únicos y mapas de datos (comercial, producción) para evitar re-fetches.
 * Si preview=true, no carga growers/techLeads para respuestas más rápidas. */
async function mergedAgentIdsAndData(preview = false): Promise<{
  sortedIds: string[];
  commercialMap: Map<string, Record<string, unknown>>;
  productionMap: Map<string, Record<string, unknown>>;
  growersMap: Map<string, { name: string; email: string }[]>;
  techLeadsMap: Map<string, { name: string; email: string }[]>;
}> {
  const db = getFirestore();
  const [testingDataColSnap, prodSnap] = await Promise.all([
    db.collection("agent_configurations").doc("dummy").collection("testing").doc("data").collection("properties").get(),
    db.collection("agent_configurations").get(),
  ]);

  const commercialMap = new Map<string, Record<string, unknown>>();
  const productionMap = new Map<string, Record<string, unknown>>();
  const growersMap = new Map<string, { name: string; email: string }[]>();
  const techLeadsMap = new Map<string, { name: string; email: string }[]>();
  const idSet = new Set<string>();

  // Cargar testing data en paralelo (evitar N+1)
  const testingSnapshots = await Promise.all(
    prodSnap.docs.map((d) =>
      db.collection("agent_configurations").doc(d.id).collection("testing").doc("data").get()
    )
  );

  for (let i = 0; i < prodSnap.docs.length; i++) {
    const d = prodSnap.docs[i];
    idSet.add(d.id);
    productionMap.set(d.id, d.data() as Record<string, unknown>);
    if (testingSnapshots[i].exists) {
      commercialMap.set(d.id, testingSnapshots[i].data() as Record<string, unknown>);
    }
  }

  // Precargar growers y techLeads en lotes paralelos (solo si no es preview)
  if (!preview) {
    const CHUNK_SIZE = 25;
    const sortedIds = [...idSet];
    for (let i = 0; i < sortedIds.length; i += CHUNK_SIZE) {
      const chunk = sortedIds.slice(i, i + CHUNK_SIZE);
      const fetchTasks = chunk.map(async (agentId) => {
        const agentRef = db.collection("agent_configurations").doc(agentId);
        const [growersSnap, techLeadsSnap] = await Promise.all([
          agentRef.collection("growers").get(),
          agentRef.collection("techLeads").get(),
        ]);
        const growers = growersSnap.docs.map((d) => {
          const data = d.data() as Record<string, unknown>;
          const email = typeof data.email === "string" ? data.email.trim().toLowerCase() : (d.id.includes("@") ? d.id.trim().toLowerCase() : "");
          const name = typeof data.name === "string" ? data.name.trim() : "";
          return { email, name: name || email };
        });
        const techLeads = techLeadsSnap.docs.map((d) => {
          const data = d.data() as Record<string, unknown>;
          const email = typeof data.email === "string" ? data.email.trim().toLowerCase() : (d.id.includes("@") ? d.id.trim().toLowerCase() : "");
          const name = typeof data.name === "string" ? data.name.trim() : "";
          return { email, name: name || email };
        });
        return { agentId, growers, techLeads };
      });
      const results = await Promise.all(fetchTasks);
      for (const r of results) {
        if (r.growers.length > 0) growersMap.set(r.agentId, r.growers);
        if (r.techLeads.length > 0) techLeadsMap.set(r.agentId, r.techLeads);
      }
    }
  }

  return {
    sortedIds: [...idSet].sort((a, b) => a.localeCompare(b)),
    commercialMap,
    productionMap,
    growersMap,
    techLeadsMap,
  };
}

type AgentFilters = {
  status?: string;
  billingAlert?: string;
  domiciliated?: string;
};

/** Paginación sobre `sortedIds` filtrando por subcadena `qLower` (coincidencias consecutivas en orden). */
async function paginateLightAgentsWithSearch(
  sortedIds: string[],
  qLower: string,
  cursor: string | undefined,
  effectiveLimit: number,
  docsMaps: {
    commercial: Map<string, Record<string, unknown>>;
    production: Map<string, Record<string, unknown>>;
    growersMap: Map<string, { name: string; email: string }[]>;
    techLeadsMap: Map<string, { name: string; email: string }[]>;
  },
  filters?: AgentFilters,
): Promise<{ agents: LightAgent[]; nextCursor: string | null }> {
  let startIdx = 0;
  if (cursor) {
    const lastId = cursorToAgentIdStart(cursor);
    const idx = sortedIds.indexOf(lastId);
    startIdx = idx >= 0 ? idx + 1 : 0;
  }
  const agents: LightAgent[] = [];

  // Procesamos en lotes para paralelizar el acceso a subcolecciones de growers / tech leads
  const CHUNK_SIZE = 25;
  for (let i = startIdx; i < sortedIds.length; i += CHUNK_SIZE) {
    const chunk = sortedIds.slice(i, i + CHUNK_SIZE);

    // 1. Identificar quiénes coinciden (paralelizado)
    // Solo búsqueda en production (no commercial/testing)
    const matchTasks = chunk.map(async (id) => {
      const data = docsMaps.production.get(id);
      // Coincidencia en raíz (business_name)
      if (data && agentMatchesRootSearchQuery(id, qLower, data)) {
        return id;
      }
      // Coincidencia con growers/techLeads precargados
      const prefetched: PrefetchedAgentData = {
        production: docsMaps.production.get(id) ?? null,
        growers: docsMaps.growersMap.get(id) ?? null,
        techLeads: docsMaps.techLeadsMap.get(id) ?? null,
      };
      const ok = await agentMatchesGrowersSearchQuery(id, qLower, prefetched);
      return ok ? id : null;
    });

    const results = await Promise.all(matchTasks);
    const matchesInChunk = results.filter((id): id is string => id !== null);

    // 2. Construir los resultados para este lote (paralelizado)
    // Nota: construir TODOS los matches del chunk, no solo hasta effectiveLimit
    const buildTasks = matchesInChunk.map((id) =>
      buildLightAgentWithDeployment(id, {
        production: docsMaps.production.get(id) ?? null,
        hasTestingData: docsMaps.commercial.has(id),
        growers: docsMaps.growersMap.get(id),
        techLeads: docsMaps.techLeadsMap.get(id),
      }),
    );
    const buildResults = await Promise.all(buildTasks);
    
    // Filtrar resultados nulos Y aplicar filtros
    for (const row of buildResults) {
      if (!row) continue;

      // Aplicar filtros server-side
      if (filters) {
        if (filters.status === "production" && !row.inProduction) continue;
        if (filters.status === "commercial" && !row.inCommercial) continue;
        if (filters.status === "testing" && row.inProduction) continue;
        if (filters.billingAlert === "true" && !row.billing?.paymentAlert) continue;
        if (filters.domiciliated === "true" && !row.billing?.domiciliated) continue;
        if (filters.domiciliated === "false" && row.billing?.domiciliated) continue;
      }

      agents.push(row);
    }

    // Solo retornar si ya alcanzamos el límite Y procesamos todos los chunks
    // (cambiado: procesar todos los matches del chunk actual antes de verificar límite)
    if (agents.length >= effectiveLimit) {
      return { agents: agents.slice(0, effectiveLimit), nextCursor: agents[effectiveLimit - 1]!.id };
    }
  }

  return { agents, nextCursor: null };
}

export const getAgentsInfo = async (
  c: Context,
  authCtx: AgentsInfoAuthContext,
) => {
  const admin = isOperationsAdmin(authCtx.userRole);
  const commercial = isOperationsCommercial(authCtx.userRole);
  const isPrivileged = admin || commercial;
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

  const statusFilter = c.req.query("status");
  const billingAlertFilter = c.req.query("billingAlert");
  const domiciliatedFilter = c.req.query("domiciliated");
  const preview = c.req.query("preview") === "1";
  const favoritesOnly = c.req.query("favorites") === "1";

  let favoriteAgentIds: string[] | null = null;
  if (favoritesOnly && authCtx.userId) {
    const favs = await db
      .select({ agentId: userFavoriteAgents.agentId })
      .from(userFavoriteAgents)
      .where(eq(userFavoriteAgents.userId, authCtx.userId));
    favoriteAgentIds = favs.map((f) => f.agentId);
  }

  if (!light && !isPrivileged) {
    return c.json(
      { error: "Este listado no está disponible para tu rol." },
      403,
    );
  }

  try {
    const db = getFirestore();

    if (light && !isPrivileged) {
      if (!emailNorm) {
        return c.json({ agents: [], nextCursor: null });
      }
      const effectiveLimit = Math.min(AGENTS_INFO_MAX_PAGE_LIMIT, pageLimit ?? 15);

      const [growerProd, collaboratorTesting, techLeadProd] = await Promise.all([
        db
          .collectionGroup("growers")
          .where("email", "==", emailNorm)
          .get(),
        db
          .collectionGroup("collaborators")
          .where("email", "==", emailNorm)
          .get(),
        db
          .collectionGroup("techLeads")
          .where("email", "==", emailNorm)
          .get(),
      ]);

      const idSet = new Set<string>();
      for (const d of growerProd.docs) {
        const parent = d.ref.parent.parent;
        if (parent) idSet.add(parent.id);
      }
      for (const d of collaboratorTesting.docs) {
        const parent = d.ref.parent?.parent?.parent?.parent;
        if (parent) idSet.add(parent.id);
      }
      for (const d of techLeadProd.docs) {
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
            { commercial: new Map(), production: new Map(), growersMap: new Map(), techLeadsMap: new Map() },
            { status: statusFilter, billingAlert: billingAlertFilter, domiciliated: domiciliatedFilter },
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

      let agentRowsFiltered = agentRows;
      if (favoriteAgentIds) {
        agentRowsFiltered = agentRows.map((a) =>
          favoriteAgentIds.includes(a.id) ? { ...a, isFavorite: true } : a,
        );
      }

      return c.json({ agents: agentRowsFiltered, nextCursor });
    }

    const collRefProd = db.collection("agent_configurations");

    if (isPrivileged && light) {
      const effectiveLimit = pageLimit ?? 15;
      let { sortedIds, commercialMap, productionMap, growersMap, techLeadsMap } =
        await mergedAgentIdsAndData(preview);

      if (favoriteAgentIds) {
        sortedIds = sortedIds.filter((id) => favoriteAgentIds.includes(id));
        for (const id of [...commercialMap.keys()]) {
          if (!favoriteAgentIds.includes(id)) commercialMap.delete(id);
        }
        for (const id of [...productionMap.keys()]) {
          if (!favoriteAgentIds.includes(id)) productionMap.delete(id);
        }
        for (const id of [...growersMap.keys()]) {
          if (!favoriteAgentIds.includes(id)) growersMap.delete(id);
        }
        for (const id of [...techLeadsMap.keys()]) {
          if (!favoriteAgentIds.includes(id)) techLeadsMap.delete(id);
        }
      }

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
          { commercial: commercialMap, production: productionMap, growersMap, techLeadsMap },
          { status: statusFilter, billingAlert: billingAlertFilter, domiciliated: domiciliatedFilter },
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
      const agentsRows = await Promise.all(
        pageIds.map((id) =>
          buildLightAgentWithDeployment(id, {
            production: productionMap.get(id),
            hasTestingData: commercialMap.has(id),
            growers: growersMap.get(id),
            techLeads: techLeadsMap.get(id),
          }),
        ),
      );

      const filterFns: ((a: LightAgent) => boolean)[] = [];
      if (statusFilter === "production") filterFns.push((a) => a.inProduction === true);
      if (statusFilter === "commercial") filterFns.push((a) => a.inCommercial === true);
      if (statusFilter === "testing") filterFns.push((a) => !a.inProduction);
      if (billingAlertFilter === "true") filterFns.push((a) => a.billing?.paymentAlert === true);
      if (domiciliatedFilter === "true") filterFns.push((a) => a.billing?.domiciliated === true);
      if (domiciliatedFilter === "false") filterFns.push((a) => a.billing?.domiciliated === false);

      let agents = agentsRows.filter((row): row is LightAgent => row != null);
      for (const fn of filterFns) {
        agents = agents.filter(fn);
      }

      if (favoriteAgentIds) {
        agents = agents.map((a) =>
          favoriteAgentIds.includes(a.id) ? { ...a, isFavorite: true } : a,
        );
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
  const firestore = getFirestore();
  const agentSnap = await firestore.collection("agent_configurations").doc(agentId).get();
  if (!agentSnap.exists) {
    return ApiErrors.notFound(c, "El agente no existe");
  }

  const session = await auth.api.getSession({ headers: c.req.raw.headers });
  if (!session?.user?.id) {
    return ApiErrors.unauthorized(c, "No autorizado");
  }

  const userId = session.user.id as string;
  const rows = await db.select({ phone: user.phone, name: user.name }).from(user).where(eq(user.id, userId)).limit(1);
  if (!rows[0]) {
    return ApiErrors.notFound(c, "Usuario no encontrado");
  }

  const phone = rows[0].phone;
  if (!phone || phone.trim().length === 0) {
    return ApiErrors.validation(c, "El usuario no tiene teléfono configurado");
  }

  const phoneId = phone.trim();
  const userName = rows[0].name ?? session.user.name ?? "";
  const assignmentRef = firestore.collection("agents_assignment").doc(phoneId);
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
