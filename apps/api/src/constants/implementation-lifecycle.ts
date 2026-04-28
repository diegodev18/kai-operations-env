export const COMMERCIAL_STATUS_VALUES = [
  "building",
  "internal_test",
  "client_test",
  "iterating",
  "delivered",
] as const;

export const SERVER_STATUS_VALUES = [
  "active",
  "disabled",
  "no_connected_number",
] as const;

export const LIFECYCLE_UPDATED_FROM_VALUES = [
  "manual",
  "automation",
  "sync",
] as const;

/** Días después de `soldAt` para rellenar `estimatedDeliveryAt` cuando aún está vacío. */
export const DEFAULT_ESTIMATED_DELIVERY_DAYS_AFTER_SOLD = 30;

export type CommercialStatus = (typeof COMMERCIAL_STATUS_VALUES)[number];
export type ServerStatus = (typeof SERVER_STATUS_VALUES)[number];
export type LifecycleUpdatedFrom = (typeof LIFECYCLE_UPDATED_FROM_VALUES)[number];

const COMMERCIAL_STATUS_TRANSITIONS: Record<
  CommercialStatus,
  readonly CommercialStatus[]
> = {
  building: ["internal_test"],
  internal_test: ["client_test", "iterating"],
  client_test: ["iterating", "delivered"],
  iterating: ["client_test", "delivered"],
  delivered: ["iterating"],
} as const;

export function isCommercialStatus(value: unknown): value is CommercialStatus {
  return (
    typeof value === "string" &&
    COMMERCIAL_STATUS_VALUES.includes(value as CommercialStatus)
  );
}

export function isServerStatus(value: unknown): value is ServerStatus {
  return (
    typeof value === "string" &&
    SERVER_STATUS_VALUES.includes(value as ServerStatus)
  );
}

export function isLifecycleUpdatedFrom(
  value: unknown,
): value is LifecycleUpdatedFrom {
  return (
    typeof value === "string" &&
    LIFECYCLE_UPDATED_FROM_VALUES.includes(value as LifecycleUpdatedFrom)
  );
}

export function canTransitionCommercialStatus(
  from: CommercialStatus,
  to: CommercialStatus,
): boolean {
  if (from === to) return true;
  return COMMERCIAL_STATUS_TRANSITIONS[from].includes(to);
}
