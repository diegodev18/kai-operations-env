import type { Context } from "hono";

import {
  FieldPath,
  type Firestore,
  type Query,
  type QueryDocumentSnapshot,
} from "firebase-admin/firestore";

import { getFirestore } from "@/lib/firestore";
import {
  fetchGrowersForAgent,
  parseAgentDoc,
  type GrowerPayload,
} from "@/utils/agents";
import { isOperationsAdmin } from "@/utils/operations-access";

const MAX_PAGE_LIMIT = 100;

type AgentDocument = QueryDocumentSnapshot;

export type AgentsInfoAuthContext = {
  userEmail?: string;
  userRole?: string;
};

const isFirebaseConfigError = (e: unknown): boolean =>
  e instanceof Error && e.message.includes("Credenciales Firebase");

function extractFirestoreIndexUrl(message: string): string | undefined {
  const m = message.match(/https:\/\/console\.firebase\.google\.com\/[^\s)'"]+/);
  return m?.[0];
}

/** Mensaje legible para errores de Firestore (p. ej. índice faltante en collection group). */
function firestoreFailureHint(error: unknown): string | null {
  const msg = error instanceof Error ? error.message : String(error);
  if (
    /FAILED_PRECONDITION|failed-precondition|\bcode.?9\b|requires an index/i.test(
      msg,
    )
  ) {
    return "Firestore necesita un índice de collection group para growers (email + __name__). En apps/api, con Firebase CLI vinculado al proyecto: firebase deploy --only firestore:indexes (usa firebase.json). O abre el enlace createIndexUrl si viene en la respuesta.";
  }
  if (/PERMISSION_DENIED|permission denied|7:/i.test(msg)) {
    return "Permiso denegado en Firestore: revisa que la cuenta de servicio tenga rol de lectura en el proyecto correcto.";
  }
  if (/UNAVAILABLE|DEADLINE_EXCEEDED|ECONNREFUSED/i.test(msg)) {
    return "No se pudo conectar a Firestore (red o servicio temporalmente no disponible).";
  }
  return null;
}

function isGrowerCursor(cursor: string): boolean {
  return cursor.includes("/growers/");
}

interface LightAgent {
  enabled: boolean;
  growers: GrowerPayload[];
  id: string;
  injectCommandsInPrompt?: boolean;
  isMultiMessageResponseEnable?: boolean;
  isValidatorAgentEnable?: boolean;
  model?: string;
  name: string;
  omitFirstEchoes?: boolean;
  owner: string;
  prompt: string;
  temperature?: number;
  waitTime?: number;
}

async function buildLightAgent(
  database: Firestore,
  doc: AgentDocument,
): Promise<LightAgent | null> {
  const parsed = parseAgentDoc(doc, false);
  if (!parsed) return null;
  const agentRef = database.collection("agent_configurations").doc(doc.id);
  const [agentSnap, aiSnap, promptSnap, responseSnap, growers] =
    await Promise.all([
      agentRef.collection("properties").doc("agent").get(),
      agentRef.collection("properties").doc("ai").get(),
      agentRef.collection("properties").doc("prompt").get(),
      agentRef.collection("properties").doc("response").get(),
      fetchGrowersForAgent(agentRef),
    ]);
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
  return {
    ...parsed,
    growers,
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
  };
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
        MAX_PAGE_LIMIT,
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
      const effectiveLimit = Math.min(MAX_PAGE_LIMIT, pageLimit ?? 15);
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
