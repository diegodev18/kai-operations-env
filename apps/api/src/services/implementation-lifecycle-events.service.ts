import { createHash } from "node:crypto";

import type { Firestore } from "firebase-admin/firestore";
import { FieldValue } from "firebase-admin/firestore";

import logger, { formatError } from "@/lib/logger";
import type {
  LifecycleUpdatedFrom,
} from "@/constants/implementation-lifecycle";

export type LifecycleEventInput = {
  eventType: "lifecycle_field_updated";
  field: string;
  previous: unknown;
  next: unknown;
  actorEmail: string | null;
  updatedFrom: LifecycleUpdatedFrom;
  reasonCode: string | null;
  idempotencyKey?: string | null;
  metadata?: Record<string, unknown>;
};

function getLifecycleEventsRef(db: Firestore, agentId: string) {
  return db
    .collection("agent_configurations")
    .doc(agentId)
    .collection("implementation")
    .doc("events")
    .collection("items");
}

function deterministicEventId(input: string): string {
  return createHash("sha256").update(input).digest("hex").slice(0, 40);
}

/**
 * Registra un evento inmutable de lifecycle. Si se provee idempotencyKey, evita duplicados.
 * Errores se registran en logger y no se relanzan.
 */
export async function appendLifecycleEvent(
  db: Firestore,
  agentId: string,
  input: LifecycleEventInput,
): Promise<void> {
  try {
    const payload: Record<string, unknown> = {
      eventType: input.eventType,
      field: input.field,
      previous: input.previous ?? null,
      next: input.next ?? null,
      actorEmail: input.actorEmail?.toLowerCase().trim() || null,
      updatedFrom: input.updatedFrom,
      reasonCode: input.reasonCode ?? null,
      createdAt: FieldValue.serverTimestamp(),
    };
    if (input.metadata && Object.keys(input.metadata).length > 0) {
      payload.metadata = input.metadata;
    }

    const normalizedIdempotencyKey =
      typeof input.idempotencyKey === "string" && input.idempotencyKey.trim().length > 0
        ? input.idempotencyKey.trim().slice(0, 200)
        : null;
    if (normalizedIdempotencyKey) {
      payload.idempotencyKey = normalizedIdempotencyKey;
      const eventId = deterministicEventId(
        `${agentId}:${input.eventType}:${input.field}:${normalizedIdempotencyKey}`,
      );
      try {
        await getLifecycleEventsRef(db, agentId).doc(eventId).create(payload);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        if (msg.includes("Already exists")) {
          return;
        }
        throw e;
      }
      return;
    }

    await getLifecycleEventsRef(db, agentId).add(payload);
  } catch (e) {
    logger.error(
      "[implementation-lifecycle-events] append failed",
      formatError(e),
      { agentId, field: input.field, eventType: input.eventType },
    );
  }
}
