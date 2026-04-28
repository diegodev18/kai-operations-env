import { Timestamp } from "firebase-admin/firestore";

import {
  isCommercialStatus,
  type CommercialStatus,
} from "@/constants/implementation-lifecycle";

function toIso(value: unknown): string | null {
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

export type LifecycleSummaryPayload = {
  commercialStatus: CommercialStatus;
  estimatedDeliveryAt: string | null;
};

export function lifecycleSummaryFromFirestoreData(
  data: Record<string, unknown> | null | undefined,
): LifecycleSummaryPayload | undefined {
  if (data == null) return undefined;
  const commercialStatus = isCommercialStatus(data.commercialStatus)
    ? data.commercialStatus
    : "building";
  return {
    commercialStatus,
    estimatedDeliveryAt: toIso(data.estimatedDeliveryAt),
  };
}
