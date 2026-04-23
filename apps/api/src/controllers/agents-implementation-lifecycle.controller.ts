import type { Context } from "hono";
import type { Firestore } from "firebase-admin/firestore";
import { FieldValue, Timestamp } from "firebase-admin/firestore";

import {
  canTransitionCommercialStatus,
  isCommercialStatus,
  isLifecycleUpdatedFrom,
  isServerStatus,
  type LifecycleUpdatedFrom,
  type ServerStatus,
} from "@/constants/implementation-lifecycle";
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
import { appendLifecycleEvent } from "@/services/implementation-lifecycle-events.service";

type LifecycleDoc = {
  createdAt?: unknown;
  soldAt?: unknown;
  deliveredAt?: unknown;
  nextMeetingAt?: unknown;
  commercialStatus?: unknown;
  serverStatusOverride?: unknown;
  autoServerStatus?: unknown;
  commercialStateChangedAt?: unknown;
  serverStateChangedAt?: unknown;
  updatedBy?: unknown;
  updatedFrom?: unknown;
  reasonCode?: unknown;
  updatedAt?: unknown;
};

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

function sameValue(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a == null && b == null) return true;
  return false;
}

function computeDaysSince(iso: string | null): number {
  if (!iso) return 0;
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return 0;
  const diffMs = Date.now() - t;
  if (diffMs <= 0) return 0;
  return Math.floor(diffMs / 86_400_000);
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
  const updatedBy =
    typeof raw?.updatedBy === "string" && raw.updatedBy.trim().length > 0
      ? raw.updatedBy.trim().toLowerCase()
      : null;
  const updatedFrom = isLifecycleUpdatedFrom(raw?.updatedFrom)
    ? raw.updatedFrom
    : "automation";
  const reasonCode =
    typeof raw?.reasonCode === "string" && raw.reasonCode.trim().length > 0
      ? raw.reasonCode.trim()
      : null;
  const updatedAt = toIsoOrNull(raw?.updatedAt);
  const commercialStateChangedAt =
    toIsoOrNull(raw?.commercialStateChangedAt) ?? createdAt;
  const serverStateChangedAt = toIsoOrNull(raw?.serverStateChangedAt) ?? createdAt;
  return {
    createdAt,
    soldAt,
    deliveredAt,
    nextMeetingAt,
    commercialStatus,
    serverStatusAuto,
    serverStatusOverride,
    serverStatus: effectiveServerStatus,
    updatedBy,
    updatedFrom,
    reasonCode,
    updatedAt,
    commercialStateChangedAt,
    serverStateChangedAt,
    daysInCommercialState: computeDaysSince(commercialStateChangedAt),
    daysInServerState: computeDaysSince(serverStateChangedAt),
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
  updatedFrom: LifecycleUpdatedFrom,
  reasonCode: string | null,
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
      updatedFrom,
      reasonCode,
    },
  });
}

async function appendLifecycleArtifacts(
  db: Firestore,
  agentId: string,
  actorEmail: string | null,
  field: string,
  prevValue: unknown,
  nextValue: unknown,
  updatedFrom: LifecycleUpdatedFrom,
  reasonCode: string | null,
  idempotencyKey?: string | null,
) {
  await Promise.all([
    appendLifecycleChangeLog(
      db,
      agentId,
      actorEmail,
      field,
      prevValue,
      nextValue,
      updatedFrom,
      reasonCode,
    ),
    appendLifecycleEvent(db, agentId, {
      eventType: "lifecycle_field_updated",
      field,
      previous: prevValue ?? null,
      next: nextValue ?? null,
      actorEmail,
      updatedFrom,
      reasonCode,
      idempotencyKey,
      metadata: {
        source: "lifecycle_controller",
      },
    }),
  ]);
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
    if (!toIsoOrNull(current.commercialStateChangedAt)) {
      patch.commercialStateChangedAt =
        toIsoOrNull(current.createdAt) ?? createdAtFallback ?? new Date().toISOString();
    }
    if (previousAuto !== autoStatus.status) {
      patch.autoServerStatus = autoStatus.status;
      patch.serverStateChangedAt = new Date().toISOString();
      if (previousAuto !== "active" && autoStatus.status === "active") {
        patch.deliveredAt = new Date().toISOString();
      }
    }

    if (Object.keys(patch).length > 0) {
      patch.updatedBy = null;
      patch.updatedFrom = "automation";
      patch.reasonCode = "auto_status_recalc";
      patch.updatedAt = FieldValue.serverTimestamp();
      await lifecycleRef.set(patch, { merge: true });
      const actorEmail = authCtx.userEmail?.toLowerCase().trim() ?? null;
      if (previousAuto !== autoStatus.status) {
        await appendLifecycleArtifacts(
          db,
          agentId,
          actorEmail,
          "serverStatusAuto",
          previousAuto,
          autoStatus.status,
          "automation",
          "auto_status_recalc",
          `auto-get:${toIsoOrNull(current.updatedAt) ?? "none"}:serverStatusAuto`,
        );
      }
      if ("deliveredAt" in patch) {
        await appendLifecycleArtifacts(
          db,
          agentId,
          actorEmail,
          "deliveredAt",
          toIsoOrNull(current.deliveredAt),
          patch.deliveredAt,
          "automation",
          "auto_status_recalc",
          `auto-get:${toIsoOrNull(current.updatedAt) ?? "none"}:deliveredAt`,
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

    const updatedFromRaw = payload.updatedFrom;
    const updatedFrom: LifecycleUpdatedFrom =
      updatedFromRaw === undefined
        ? "manual"
        : isLifecycleUpdatedFrom(updatedFromRaw)
          ? updatedFromRaw
          : ("manual" as const);
    if (updatedFromRaw !== undefined && !isLifecycleUpdatedFrom(updatedFromRaw)) {
      return c.json(
        {
          error: "updatedFrom inválido. Usa: manual, automation o sync",
        },
        400,
      );
    }
    const reasonCodeRaw = payload.reasonCode;
    const reasonCode =
      typeof reasonCodeRaw === "string" && reasonCodeRaw.trim().length > 0
        ? reasonCodeRaw.trim().slice(0, 120)
        : null;
    const idempotencyKeyRaw = payload.idempotencyKey;
    const idempotencyKey =
      typeof idempotencyKeyRaw === "string" && idempotencyKeyRaw.trim().length > 0
        ? idempotencyKeyRaw.trim().slice(0, 200)
        : null;

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
    const currentSoldAt = toIsoOrNull(current.soldAt);
    const currentNextMeetingAt = toIsoOrNull(current.nextMeetingAt);
    const currentServerOverride = isServerStatus(current.serverStatusOverride)
      ? current.serverStatusOverride
      : null;
    const previousCommercial = isCommercialStatus(current.commercialStatus)
      ? current.commercialStatus
      : "building";
    const nextCommercial =
      commercialStatusRaw !== undefined ? commercialStatusRaw : previousCommercial;
    if (!canTransitionCommercialStatus(previousCommercial, nextCommercial)) {
      return c.json(
        {
          error: `Transición no permitida de commercialStatus: ${previousCommercial} -> ${nextCommercial}`,
        },
        409,
      );
    }

    const patch: Record<string, unknown> = {};
    if (!toIsoOrNull(current.createdAt) && createdAtFallback) {
      patch.createdAt = createdAtFallback;
    }
    if (!toIsoOrNull(current.commercialStateChangedAt)) {
      patch.commercialStateChangedAt =
        toIsoOrNull(current.createdAt) ?? createdAtFallback ?? new Date().toISOString();
    }
    if (payload.soldAt !== undefined && !sameValue(currentSoldAt, soldAt)) {
      patch.soldAt = soldAt;
    }
    if (
      payload.nextMeetingAt !== undefined &&
      !sameValue(currentNextMeetingAt, nextMeetingAt)
    ) {
      patch.nextMeetingAt = nextMeetingAt;
    }
    if (commercialStatusRaw !== undefined) {
      if (!sameValue(previousCommercial, commercialStatusRaw)) {
        patch.commercialStatus = commercialStatusRaw;
        patch.commercialStateChangedAt = new Date().toISOString();
      }
    }
    if (
      overrideRaw !== undefined &&
      !sameValue(currentServerOverride, overrideRaw)
    ) {
      patch.serverStatusOverride = overrideRaw;
    }

    if (previousAuto !== autoStatus.status) {
      patch.autoServerStatus = autoStatus.status;
      patch.serverStateChangedAt = new Date().toISOString();
      if (previousAuto !== "active" && autoStatus.status === "active") {
        patch.deliveredAt = new Date().toISOString();
      }
    }
    const actorEmail = authCtx.userEmail?.toLowerCase().trim() ?? null;
    const hasBusinessChanges =
      "soldAt" in patch ||
      "nextMeetingAt" in patch ||
      "commercialStatus" in patch ||
      "serverStatusOverride" in patch ||
      "autoServerStatus" in patch ||
      "deliveredAt" in patch;
    if (hasBusinessChanges) {
      patch.updatedBy = actorEmail;
      patch.updatedFrom = updatedFrom;
      patch.reasonCode = reasonCode;
      patch.updatedAt = FieldValue.serverTimestamp();
      await lifecycleRef.set(patch, { merge: true });
    }
    const logTasks: Promise<void>[] = [];
    if ("soldAt" in patch) {
      logTasks.push(
        appendLifecycleArtifacts(
          db,
          agentId,
          actorEmail,
          "soldAt",
          currentSoldAt,
          patch.soldAt,
          updatedFrom,
          reasonCode,
          idempotencyKey ? `${idempotencyKey}:soldAt` : null,
        ),
      );
    }
    if ("nextMeetingAt" in patch) {
      logTasks.push(
        appendLifecycleArtifacts(
          db,
          agentId,
          actorEmail,
          "nextMeetingAt",
          currentNextMeetingAt,
          patch.nextMeetingAt,
          updatedFrom,
          reasonCode,
          idempotencyKey ? `${idempotencyKey}:nextMeetingAt` : null,
        ),
      );
    }
    if ("commercialStatus" in patch) {
      logTasks.push(
        appendLifecycleArtifacts(
          db,
          agentId,
          actorEmail,
          "commercialStatus",
          isCommercialStatus(current.commercialStatus)
            ? current.commercialStatus
            : "building",
          commercialStatusRaw,
          updatedFrom,
          reasonCode,
          idempotencyKey ? `${idempotencyKey}:commercialStatus` : null,
        ),
      );
    }
    if ("serverStatusOverride" in patch) {
      logTasks.push(
        appendLifecycleArtifacts(
          db,
          agentId,
          actorEmail,
          "serverStatusOverride",
          currentServerOverride,
          patch.serverStatusOverride,
          updatedFrom,
          reasonCode,
          idempotencyKey ? `${idempotencyKey}:serverStatusOverride` : null,
        ),
      );
    }
    if (previousAuto !== autoStatus.status) {
      logTasks.push(
        appendLifecycleArtifacts(
          db,
          agentId,
          actorEmail,
          "serverStatusAuto",
          previousAuto,
          autoStatus.status,
          "automation",
          "auto_status_recalc",
          idempotencyKey ? `${idempotencyKey}:serverStatusAuto` : null,
        ),
      );
    }
    if ("deliveredAt" in patch) {
      logTasks.push(
        appendLifecycleArtifacts(
          db,
          agentId,
          actorEmail,
          "deliveredAt",
          toIsoOrNull(current.deliveredAt),
          patch.deliveredAt,
          "automation",
          "auto_status_recalc",
          idempotencyKey ? `${idempotencyKey}:deliveredAt` : null,
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
