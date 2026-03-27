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

async function mergedAgentIdsSorted(): Promise<string[]> {
  const commercial = getFirestoreCommercial();
  const production = getFirestore();
  const [comSnap, prodSnap] = await Promise.all([
    commercial.collection("agent_configurations").get(),
    production.collection("agent_configurations").get(),
  ]);
  const idSet = new Set<string>();
  for (const d of comSnap.docs) idSet.add(d.id);
  for (const d of prodSnap.docs) idSet.add(d.id);
  return [...idSet].sort((a, b) => a.localeCompare(b));
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
      const sortedIds = await mergedAgentIdsSorted();

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
