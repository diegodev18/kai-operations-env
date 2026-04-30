import type { Context } from "hono";
import { randomUUID } from "node:crypto";

import { FieldPath, type Query } from "firebase-admin/firestore";

import { ApiErrors } from "@/lib/api-error";
import { AGENTS_INFO_MAX_PAGE_LIMIT } from "@/constants/agents";
import { getFirestore } from "@/lib/firestore";
import type {
  AgentDocument,
  AgentsInfoAuthContext,
  LightAgent,
} from "@/types/agents-types";
import type { PrefetchedAgentData } from "@/utils/agents/agentSearchMatch";
import {
  agentMatchesGrowersSearchQuery,
  agentMatchesRootSearchQuery,
  agentMatchesSearchQuery,
  applyUsersBuildersTestingAssignment,
  assignTestingByPhoneNumber,
  assignTestingToUsersBuilderDocId,
  collectAgentStakeholderEmails,
  fetchGrowersForAgent,
  isGrowerCursor,
  normalizeAgentsSearchQuery,
  normalizePhoneDigits,
  parseAgentDoc,
  searchUsersBuildersByPhoneDigits,
  parseAgentDocFromData,
  parseBillingDoc,
  userCanAccessAgent,
  userCanEditAgent,
} from "@/utils/agents";
import { lifecycleSummaryFromFirestoreData } from "@/utils/agents/lifecycle-doc";
import {
  extractFirestoreIndexUrl,
  firestoreFailureHint,
  isFirebaseConfigError,
} from "@/utils/firestore/errors";
import { isOperationsAdmin, isOperationsCommercial } from "@/utils/operations-access";
import { auth } from "@/lib/auth";
import { db } from "@/db/client";
import { user, userFavoriteAgents } from "@/db/schema/auth";
import { eq, sql } from "drizzle-orm";
import { z } from "zod";

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
    agentRef.collection("implementation").doc("lifecycle").get(),
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
  const [agentSnap, aiSnap, promptSnap, responseSnap, billingSnap, lifecycleSnap] =
    results.slice(0, 6) as [
      FirebaseFirestore.DocumentSnapshot,
      FirebaseFirestore.DocumentSnapshot,
      FirebaseFirestore.DocumentSnapshot,
      FirebaseFirestore.DocumentSnapshot,
      FirebaseFirestore.DocumentSnapshot,
      FirebaseFirestore.DocumentSnapshot,
    ];

  const lifecycleSummary = lifecycleSnap.exists
    ? lifecycleSummaryFromFirestoreData(
        lifecycleSnap.data() as Record<string, unknown>,
      )
    : undefined;

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
    inProduction: true,
    inCommercial: hasTestingData,
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
    ...(lifecycleSummary != null ? { lifecycleSummary } : {}),
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
  archivedOnly?: boolean;
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
        if (filters.domiciliated === "true" && row.billing?.domiciliated !== true) {
          continue;
        }
        if (filters.domiciliated === "false" && row.billing?.domiciliated !== false) {
          continue;
        }
        if (filters.domiciliated === "unknown" && row.billing?.domiciliated != null) {
          continue;
        }
        if (filters.archivedOnly && row.status !== "archived") continue;
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
  const archivedOnly = c.req.query("archived") === "only";
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
      let sortedIds = [...idSet].sort((a, b) => a.localeCompare(b));
      if (archivedOnly && sortedIds.length > 0) {
        const checks = await Promise.all(
          sortedIds.map(async (id) => {
            const snap = await db.collection("agent_configurations").doc(id).get();
            const status = snap.exists ? normalizeAgentStatus(snap.data()?.status) : "active";
            return { id, archived: status === "archived" };
          }),
        );
        sortedIds = checks.filter((item) => item.archived).map((item) => item.id);
      }

      if (searchQ) {
        const { agents: agentRows, nextCursor } =
          await paginateLightAgentsWithSearch(
            sortedIds,
            searchQ,
            cursor,
            effectiveLimit,
            { commercial: new Map(), production: new Map(), growersMap: new Map(), techLeadsMap: new Map() },
            {
              status: statusFilter,
              billingAlert: billingAlertFilter,
              domiciliated: domiciliatedFilter,
              archivedOnly,
            },
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
      if (archivedOnly) {
        sortedIds = sortedIds.filter(
          (id) => normalizeAgentStatus(productionMap.get(id)?.status) === "archived",
        );
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
          {
            status: statusFilter,
            billingAlert: billingAlertFilter,
            domiciliated: domiciliatedFilter,
            archivedOnly,
          },
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
      if (domiciliatedFilter === "true") {
        filterFns.push((a) => a.billing?.domiciliated === true);
      }
      if (domiciliatedFilter === "false") {
        filterFns.push((a) => a.billing?.domiciliated === false);
      }
      if (domiciliatedFilter === "unknown") {
        filterFns.push((a) => a.billing?.domiciliated == null);
      }
      if (archivedOnly) filterFns.push((a) => a.status === "archived");

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

const newUserBuilderSchema = z.object({
  name: z.string().min(1),
});

/** Correo canónico para usersBuilders creado desde Operations (no inbox real). */
function syntheticUserBuilderEmail(phoneDigits: string): string {
  return `${phoneDigits}@userBuilder.com`;
}

/** `uid`: id de usuario en Postgres si el teléfono coincide; si no, UUID nuevo. */
async function resolveUsersBuilderUidForPhone(phoneDigits: string): Promise<string> {
  const rows = await db
    .select({ id: user.id })
    .from(user)
    .where(
      sql`regexp_replace(coalesce(${user.phone}, ''), '[^0-9]', '', 'g') = ${phoneDigits}`,
    )
    .limit(1);
  if (rows[0]?.id) return rows[0].id;
  return randomUUID();
}

const assignToUserBodySchema = z
  .object({
    targetUserId: z.string().min(1).optional(),
    targetPhoneNumber: z.string().min(1).optional(),
    targetUsersBuilderDocId: z.string().min(1).optional(),
    newUserBuilder: newUserBuilderSchema.optional(),
  })
  .strict()
  .refine((d) => !(d.targetUserId && d.targetPhoneNumber), {
    message: "No combines targetUserId y targetPhoneNumber",
  })
  .refine((d) => !(d.targetUserId && d.targetUsersBuilderDocId), {
    message: "No combines targetUserId y targetUsersBuilderDocId",
  })
  .refine((d) => !(d.targetUsersBuilderDocId && d.newUserBuilder), {
    message: "No combines targetUsersBuilderDocId con newUserBuilder",
  });

async function stakeholderPhoneDigitsForAgent(agentId: string): Promise<Set<string>> {
  const emails = await collectAgentStakeholderEmails(agentId);
  if (emails.size === 0) return new Set();
  const emailList = [...emails];
  const rows = await db
    .select({ phone: user.phone })
    .from(user)
    .where(sql`lower(${user.email}) in (${sql.join(emailList.map((e) => sql`${e}`), sql`, `)})`);
  const out = new Set<string>();
  for (const r of rows) {
    const d = normalizePhoneDigits(r.phone ?? "");
    if (d.length > 0) out.add(d);
  }
  return out;
}

export async function getTestingAssignTargets(
  c: Context,
  authCtx: AgentsInfoAuthContext,
  agentId: string,
) {
  const firestore = getFirestore();
  const agentSnap = await firestore.collection("agent_configurations").doc(agentId).get();
  if (!agentSnap.exists) {
    return ApiErrors.notFound(c, "El agente no existe");
  }
  const canAccess = await userCanAccessAgent(authCtx, agentId);
  if (!canAccess) {
    return ApiErrors.forbidden(c, "No autorizado");
  }

  const phoneQ = c.req.query("phone");
  const rawPhone = Array.isArray(phoneQ) ? (phoneQ[0] ?? "") : (phoneQ ?? "");
  const digits = normalizePhoneDigits(rawPhone);
  if (digits.length < 3) {
    return c.json({
      scope: "usersBuilders" as const,
      targets: [],
      exactMatchFound: false,
      minDigits: 3,
    });
  }

  const { hits, exactMatchFound } = await searchUsersBuildersByPhoneDigits(digits);
  return c.json({
    scope: "usersBuilders" as const,
    targets: hits.map((h) => ({
      usersBuilderDocId: h.docId,
      phoneNumber: h.phoneNumber,
      name: h.name,
      email: h.email,
      uid: h.uid,
      fromFirestore: true,
      assignable: true,
    })),
    exactMatchFound,
  });
}

export async function assignAgentToUser(
  c: Context,
  authCtx: AgentsInfoAuthContext,
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

  const canAccess = await userCanAccessAgent(authCtx, agentId);
  if (!canAccess) {
    return ApiErrors.forbidden(c, "No autorizado");
  }

  let body: unknown = {};
  const contentType = c.req.header("content-type") ?? "";
  if (contentType.includes("application/json")) {
    try {
      body = await c.req.json();
    } catch {
      body = {};
    }
  }
  const parsed = assignToUserBodySchema.safeParse(body);
  if (!parsed.success) {
    const msg =
      parsed.error.issues.map((i) => i.message).join(", ") || "Cuerpo de solicitud inválido";
    return ApiErrors.validation(c, msg);
  }

  const sessionUserId = session.user.id as string;
  const docIdFromBody = parsed.data.targetUsersBuilderDocId?.trim();
  const rawTargetPhone = parsed.data.targetPhoneNumber?.trim();

  if (docIdFromBody) {
    const ref = firestore.collection("usersBuilders").doc(docIdFromBody);
    const docSnap = await ref.get();
    if (!docSnap.exists) {
      return ApiErrors.notFound(c, "usersBuilders no encontrado");
    }
    if (rawTargetPhone) {
      const phoneDigits = normalizePhoneDigits(rawTargetPhone);
      const data = docSnap.data() as Record<string, unknown>;
      const docPhone = normalizePhoneDigits(String(data.phoneNumber ?? ""));
      if (docPhone !== phoneDigits) {
        return ApiErrors.validation(
          c,
          "El documento no coincide con el teléfono indicado",
        );
      }
    }
    try {
      await assignTestingToUsersBuilderDocId(docIdFromBody, agentId);
    } catch (e: unknown) {
      if (e instanceof Error && e.message === "USERS_BUILDERS_DOC_NOT_FOUND") {
        return ApiErrors.notFound(c, "usersBuilders no encontrado");
      }
      throw e;
    }
    return c.json({ ok: true, createdUserBuilder: false });
  }

  if (rawTargetPhone) {
    const phoneDigits = normalizePhoneDigits(rawTargetPhone);
    if (phoneDigits.length < 10) {
      return ApiErrors.validation(
        c,
        "Indica un número completo (al menos 10 dígitos) para usersBuilders",
      );
    }

    const byPhone = await firestore
      .collection("usersBuilders")
      .where("phoneNumber", "==", phoneDigits)
      .get();

    if (!byPhone.empty) {
      if (byPhone.size > 1) {
        return ApiErrors.validation(
          c,
          "Hay varios usersBuilders con ese número. Elige una fila en la lista (cada una tiene su id de documento).",
        );
      }
      await assignTestingToUsersBuilderDocId(byPhone.docs[0]!.id, agentId);
      return c.json({ ok: true, createdUserBuilder: false });
    }

    const nb = parsed.data.newUserBuilder;
    if (!nb) {
      return ApiErrors.validation(
        c,
        "No hay usersBuilders con ese phoneNumber. Envía newUserBuilder con name para crear el documento.",
      );
    }

    const syntheticEmail = syntheticUserBuilderEmail(phoneDigits);

    const ops =
      isOperationsAdmin(authCtx.userRole) || isOperationsCommercial(authCtx.userRole);
    const canEdit = await userCanEditAgent(authCtx, agentId);
    if (!ops && !canEdit) {
      return ApiErrors.forbidden(c, "No autorizado");
    }
    if (!ops) {
      const stakePhones = await stakeholderPhoneDigitsForAgent(agentId);
      const stakeEmails = await collectAgentStakeholderEmails(agentId);
      const phoneOk = stakePhones.has(phoneDigits);
      const emailOk = stakeEmails.has(syntheticEmail.toLowerCase());
      if (!phoneOk && !emailOk) {
        return ApiErrors.forbidden(c, "No autorizado");
      }
    }

    try {
      const uid = await resolveUsersBuilderUidForPhone(phoneDigits);
      const { createdUserBuilder } = await assignTestingByPhoneNumber({
        agentId,
        phoneNumber: phoneDigits,
        actorUserId: sessionUserId,
        identity: {
          name: nb.name.trim(),
          email: syntheticEmail,
          uid,
        },
      });
      return c.json({ ok: true, createdUserBuilder });
    } catch (e: unknown) {
      if (
        e instanceof Error &&
        e.message === "USERS_BUILDERS_CREATE_REQUIRES_IDENTITY"
      ) {
        return ApiErrors.validation(
          c,
          "Faltan datos para crear usersBuilders (name).",
        );
      }
      if (e instanceof Error && e.message === "USERS_BUILDERS_ALREADY_EXISTS") {
        return ApiErrors.validation(
          c,
          "Ya existe usersBuilders con ese número; usa la búsqueda y elige el documento.",
        );
      }
      throw e;
    }
  }

  const targetUserId = parsed.data.targetUserId?.trim() || sessionUserId;

  const targetRows = await db
    .select({
      id: user.id,
      phone: user.phone,
      name: user.name,
      email: user.email,
    })
    .from(user)
    .where(eq(user.id, targetUserId))
    .limit(1);
  if (!targetRows[0]) {
    return ApiErrors.notFound(c, "Usuario no encontrado");
  }

  const target = targetRows[0];

  if (targetUserId !== sessionUserId) {
    const ops =
      isOperationsAdmin(authCtx.userRole) || isOperationsCommercial(authCtx.userRole);
    if (!ops) {
      const canEdit = await userCanEditAgent(authCtx, agentId);
      if (!canEdit) {
        return ApiErrors.forbidden(c, "No autorizado");
      }
      const stakeholders = await collectAgentStakeholderEmails(agentId);
      const targetEmail = (target.email ?? "").toLowerCase().trim();
      if (!targetEmail || !stakeholders.has(targetEmail)) {
        return ApiErrors.forbidden(c, "No autorizado");
      }
    }
  }

  const phone = target.phone;
  if (!phone || phone.trim().length === 0) {
    return ApiErrors.validation(c, "El usuario no tiene teléfono configurado");
  }

  const phoneNumber = phone.trim();
  const sessionName =
    typeof session.user.name === "string" ? session.user.name.trim() : "";
  const userName =
    targetUserId === sessionUserId ? (target.name || sessionName) : target.name || "";
  const userEmail =
    target.email?.trim() ||
    ((session.user.email as string | undefined) ?? "");

  const { createdUserBuilder } = await applyUsersBuildersTestingAssignment({
    agentId,
    phoneNumber,
    userId: target.id,
    userName,
    userEmail,
  });

  return c.json({ ok: true, createdUserBuilder });
}

export async function getAssignedAgentForUser(
  c: Context,
  _authCtx: AgentsInfoAuthContext,
) {
  const session = await auth.api.getSession({ headers: c.req.raw.headers });
  if (!session?.user?.id) {
    return ApiErrors.unauthorized(c, "No autorizado");
  }

  const userId = session.user.id as string;
  const rows = await db
    .select({ phone: user.phone })
    .from(user)
    .where(eq(user.id, userId))
    .limit(1);
  if (!rows[0]) {
    return ApiErrors.notFound(c, "Usuario no encontrado");
  }

  const phone = rows[0].phone;
  if (!phone || phone.trim().length === 0) {
    return c.json({ assignedAgentId: null });
  }

  const firestore = getFirestore();
  const phoneNumber = phone.trim();
  const usersBuildersQuery = await firestore
    .collection("usersBuilders")
    .where("phoneNumber", "==", phoneNumber)
    .limit(1)
    .get();

  if (usersBuildersQuery.empty) {
    return c.json({ assignedAgentId: null });
  }

  const data = usersBuildersQuery.docs[0]!.data() as {
    customAgentConfigId?: string;
  };

  return c.json({ assignedAgentId: data.customAgentConfigId ?? null });
}
