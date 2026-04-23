import type { Context } from "hono";
import type { Firestore } from "firebase-admin/firestore";
import { FieldValue, Timestamp } from "firebase-admin/firestore";

import type { AgentsInfoAuthContext } from "@/types/agents-types";
import { resolveAgentWriteDatabase, userCanAccessAgent, userCanEditAgent } from "@/utils/agents";
import {
  extractFirestoreIndexUrl,
  firestoreFailureHint,
  isFirebaseConfigError,
} from "@/utils/firestore/errors";
import {
  appendImplementationActivityEntry,
} from "@/services/implementation-activity.service";

const COMMERCIAL_STATUS_VALUES = [
  "building",
  "internal_test",
  "client_test",
  "iterating",
  "delivered",
] as const;

const SERVER_STATUS_VALUES = [
  "active",
  "disabled",
  "no_connected_number",
] as const;

type CommercialStatus = (typeof COMMERCIAL_STATUS_VALUES)[number];
type ServerStatus = (typeof SERVER_STATUS_VALUES)[number];

type LifecycleDoc = {
  createdAt?: unknown;
  soldAt?: unknown;
  deliveredAt?: unknown;
  nextMeetingAt?: unknown;
  commercialStatus?: unknown;
  serverStatusOverride?: unknown;
  autoServerStatus?: unknown;
  updatedAt?: unknown;
};

function isCommercialStatus(value: unknown): value is CommercialStatus {
  return typeof value === "string" && COMMERCIAL_STATUS_VALUES.includes(value as CommercialStatus);
}

function isServerStatus(value: unknown): value is ServerStatus {
  return typeof value === "string" && SERVER_STATUS_VALUES.includes(value as ServerStatus);
}

function toIsoOrNull(value: unknown): string | null {
  if (value == null) return null;
  if (typeof value === "string") {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
  }
  if (value instanceof Timestamp) {
    return value.toDate().toISOString();
  }
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

function parseInputDate(value: unknown): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value !== "string") return undefined;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return undefined;
  return d.toISOString();
}

function normalizeLifecycleForResponse(
  raw: LifecycleDoc | null,
  serverStatusAuto: ServerStatus,
  createdAtFallback: string | null,
) {
  const createdAt = toIsoOrNull(raw?.createdAt) ?? createdAtFallback;
  const soldAt = toIsoOrNull(raw?.soldAt);
  const deliveredAt = toIsoOrNull(raw?.deliveredAt);
  const nextMeetingAt = toIsoOrNull(raw?.nextMeetingAt);
  const commercialStatus = isCommercialStatus(raw?.commercialStatus)
    ? raw?.commercialStatus
    : "building";
  const serverStatusOverride = isServerStatus(raw?.serverStatusOverride)
    ? raw?.serverStatusOverride
    : null;
  const effectiveServerStatus = serverStatusOverride ?? serverStatusAuto;
  return {
    createdAt,
    soldAt,
    deliveredAt,
    nextMeetingAt,
    commercialStatus,
    serverStatusAuto,
    serverStatusOverride,
    serverStatus: effectiveServerStatus,
  };
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

async function resolveServerStatusAuto(
  db: Firestore,
  agentId: string,
): Promise<{ enabled: boolean; hasConnectedNumber: boolean; status: ServerStatus }> {
  const [agentPropsSnap, waSnap] = await Promise.all([
    db
      .collection("agent_configurations")
      .doc(agentId)
      .collection("properties")
      .doc("agent")
      .get(),
    db
      .collection("whatsapp_integrations")
      .where("agentDocId", "==", agentId)
      .limit(10)
      .get(),
  ]);

  const enabled = (agentPropsSnap.data()?.enabled as boolean | undefined) !== false;
  const hasConnectedNumber = waSnap.docs.some((doc) => {
    const d = doc.data() as Record<string, unknown>;
    const setupStatus = d.setupStatus;
    const registrationStatus = d.registrationStatus;
    const hasPhone = typeof d.phoneNumber === "string" && d.phoneNumber.trim().length > 0;
    return (
      setupStatus === "completed" ||
      registrationStatus === "connected" ||
      hasPhone
    );
  });

  if (!enabled) return { enabled, hasConnectedNumber, status: "disabled" };
  if (!hasConnectedNumber) {
    return { enabled, hasConnectedNumber, status: "no_connected_number" };
  }
  return { enabled, hasConnectedNumber, status: "active" };
}

async function appendLifecycleChangeLog(
  db: Firestore,
  agentId: string,
  actorEmail: string | null,
  field: string,
  prevValue: unknown,
  nextValue: unknown,
) {
  const prevDisplay = prevValue == null ? "vacío" : String(prevValue);
  const nextDisplay = nextValue == null ? "vacío" : String(nextValue);
  await appendImplementationActivityEntry(db, agentId, {
    kind: "system",
    actorEmail,
    action: "lifecycle_updated",
    summary: `Actualizó ${field}: ${prevDisplay} → ${nextDisplay}.`,
    metadata: {
      field,
      previous: prevValue ?? null,
      next: nextValue ?? null,
    },
  });
}

export async function getImplementationLifecycle(
  c: Context,
  authCtx: AgentsInfoAuthContext,
  agentId: string,
) {
  try {
    const canAccess = await userCanAccessAgent(authCtx, agentId);
    if (!canAccess) {
      return c.json({ error: "No autorizado para este agente" }, 403);
    }

    const { db, hasTestingData, inProduction } = await resolveAgentWriteDatabase(agentId);
    if (!hasTestingData && !inProduction) {
      return c.json({ error: "Agente no encontrado" }, 404);
    }

    const agentRef = db.collection("agent_configurations").doc(agentId);
    const lifecycleRef = agentRef.collection("implementation").doc("lifecycle");
    const [agentSnap, lifecycleSnap, autoStatus] = await Promise.all([
      agentRef.get(),
      lifecycleRef.get(),
      resolveServerStatusAuto(db, agentId),
    ]);
    if (!agentSnap.exists) {
      return c.json({ error: "Agente no encontrado" }, 404);
    }

    const current = (lifecycleSnap.exists ? lifecycleSnap.data() : {}) as LifecycleDoc;
    const createdAtFallback = agentSnap.createTime
      ? agentSnap.createTime.toDate().toISOString()
      : null;
    const previousAuto = isServerStatus(current.autoServerStatus)
      ? current.autoServerStatus
      : null;

    const patch: Record<string, unknown> = {};
    if (!toIsoOrNull(current.createdAt) && createdAtFallback) {
      patch.createdAt = createdAtFallback;
    }
    if (previousAuto !== autoStatus.status) {
      patch.autoServerStatus = autoStatus.status;
      if (previousAuto !== "active" && autoStatus.status === "active") {
        patch.deliveredAt = new Date().toISOString();
      }
    }

    if (Object.keys(patch).length > 0) {
      patch.updatedAt = FieldValue.serverTimestamp();
      await lifecycleRef.set(patch, { merge: true });
      const actorEmail = authCtx.userEmail?.toLowerCase().trim() ?? null;
      if (previousAuto !== autoStatus.status) {
        await appendLifecycleChangeLog(
          db,
          agentId,
          actorEmail,
          "serverStatusAuto",
          previousAuto,
          autoStatus.status,
        );
      }
      if ("deliveredAt" in patch) {
        await appendLifecycleChangeLog(
          db,
          agentId,
          actorEmail,
          "deliveredAt",
          toIsoOrNull(current.deliveredAt),
          patch.deliveredAt,
        );
      }
    }

    const finalSnap = await lifecycleRef.get();
    const finalData = (finalSnap.exists ? finalSnap.data() : null) as LifecycleDoc | null;
    return c.json(
      normalizeLifecycleForResponse(finalData, autoStatus.status, createdAtFallback),
    );
  } catch (error) {
    return handleFirestoreError(c, error, "[implementation lifecycle GET]");
  }
}

export async function patchImplementationLifecycle(
  c: Context,
  authCtx: AgentsInfoAuthContext,
  agentId: string,
) {
  try {
    const canAccess = await userCanAccessAgent(authCtx, agentId);
    if (!canAccess) {
      return c.json({ error: "No autorizado para este agente" }, 403);
    }
    const canEdit = await userCanEditAgent(authCtx, agentId);
    if (!canEdit) {
      return c.json({ error: "No tienes permisos para editar este agente" }, 403);
    }

    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: "JSON inválido" }, 400);
    }
    if (body == null || typeof body !== "object" || Array.isArray(body)) {
      return c.json({ error: "El cuerpo debe ser un objeto" }, 400);
    }
    const payload = body as Record<string, unknown>;

    const soldAt = parseInputDate(payload.soldAt);
    if (payload.soldAt !== undefined && soldAt === undefined) {
      return c.json({ error: "soldAt debe ser fecha ISO o null" }, 400);
    }
    const nextMeetingAt = parseInputDate(payload.nextMeetingAt);
    if (payload.nextMeetingAt !== undefined && nextMeetingAt === undefined) {
      return c.json({ error: "nextMeetingAt debe ser fecha ISO o null" }, 400);
    }

    const commercialStatusRaw = payload.commercialStatus;
    if (
      commercialStatusRaw !== undefined &&
      !isCommercialStatus(commercialStatusRaw)
    ) {
      return c.json(
        {
          error:
            "commercialStatus inválido. Usa: building, internal_test, client_test, iterating, delivered",
        },
        400,
      );
    }

    const overrideRaw = payload.serverStatusOverride;
    if (
      overrideRaw !== undefined &&
      overrideRaw !== null &&
      !isServerStatus(overrideRaw)
    ) {
      return c.json(
        {
          error:
            "serverStatusOverride inválido. Usa: active, disabled, no_connected_number o null",
        },
        400,
      );
    }

    const { db, hasTestingData, inProduction } = await resolveAgentWriteDatabase(agentId);
    if (!hasTestingData && !inProduction) {
      return c.json({ error: "Agente no encontrado" }, 404);
    }

    const agentRef = db.collection("agent_configurations").doc(agentId);
    const lifecycleRef = agentRef.collection("implementation").doc("lifecycle");
    const [agentSnap, lifecycleSnap, autoStatus] = await Promise.all([
      agentRef.get(),
      lifecycleRef.get(),
      resolveServerStatusAuto(db, agentId),
    ]);
    if (!agentSnap.exists) {
      return c.json({ error: "Agente no encontrado" }, 404);
    }

    const createdAtFallback = agentSnap.createTime
      ? agentSnap.createTime.toDate().toISOString()
      : null;
    const current = (lifecycleSnap.exists ? lifecycleSnap.data() : {}) as LifecycleDoc;
    const previousAuto = isServerStatus(current.autoServerStatus)
      ? current.autoServerStatus
      : null;

    const patch: Record<string, unknown> = {};
    if (!toIsoOrNull(current.createdAt) && createdAtFallback) {
      patch.createdAt = createdAtFallback;
    }
    if (payload.soldAt !== undefined) patch.soldAt = soldAt;
    if (payload.nextMeetingAt !== undefined) patch.nextMeetingAt = nextMeetingAt;
    if (commercialStatusRaw !== undefined) patch.commercialStatus = commercialStatusRaw;
    if (overrideRaw !== undefined) patch.serverStatusOverride = overrideRaw;

    if (previousAuto !== autoStatus.status) {
      patch.autoServerStatus = autoStatus.status;
      if (previousAuto !== "active" && autoStatus.status === "active") {
        patch.deliveredAt = new Date().toISOString();
      }
    }
    patch.updatedAt = FieldValue.serverTimestamp();

    await lifecycleRef.set(patch, { merge: true });

    const actorEmail = authCtx.userEmail?.toLowerCase().trim() ?? null;
    const logTasks: Promise<void>[] = [];
    if (payload.soldAt !== undefined) {
      logTasks.push(
        appendLifecycleChangeLog(
          db,
          agentId,
          actorEmail,
          "soldAt",
          toIsoOrNull(current.soldAt),
          patch.soldAt,
        ),
      );
    }
    if (payload.nextMeetingAt !== undefined) {
      logTasks.push(
        appendLifecycleChangeLog(
          db,
          agentId,
          actorEmail,
          "nextMeetingAt",
          toIsoOrNull(current.nextMeetingAt),
          patch.nextMeetingAt,
        ),
      );
    }
    if (commercialStatusRaw !== undefined) {
      logTasks.push(
        appendLifecycleChangeLog(
          db,
          agentId,
          actorEmail,
          "commercialStatus",
          isCommercialStatus(current.commercialStatus)
            ? current.commercialStatus
            : "building",
          commercialStatusRaw,
        ),
      );
    }
    if (overrideRaw !== undefined) {
      logTasks.push(
        appendLifecycleChangeLog(
          db,
          agentId,
          actorEmail,
          "serverStatusOverride",
          isServerStatus(current.serverStatusOverride)
            ? current.serverStatusOverride
            : null,
          overrideRaw,
        ),
      );
    }
    if (previousAuto !== autoStatus.status) {
      logTasks.push(
        appendLifecycleChangeLog(
          db,
          agentId,
          actorEmail,
          "serverStatusAuto",
          previousAuto,
          autoStatus.status,
        ),
      );
    }
    if ("deliveredAt" in patch) {
      logTasks.push(
        appendLifecycleChangeLog(
          db,
          agentId,
          actorEmail,
          "deliveredAt",
          toIsoOrNull(current.deliveredAt),
          patch.deliveredAt,
        ),
      );
    }
    await Promise.all(logTasks);

    const finalSnap = await lifecycleRef.get();
    const finalData = (finalSnap.exists ? finalSnap.data() : null) as LifecycleDoc | null;
    return c.json(
      normalizeLifecycleForResponse(finalData, autoStatus.status, createdAtFallback),
    );
  } catch (error) {
    return handleFirestoreError(c, error, "[implementation lifecycle PATCH]");
  }
}
