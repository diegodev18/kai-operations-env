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

export type CommercialStatus = (typeof COMMERCIAL_STATUS_VALUES)[number];
export type ServerStatus = (typeof SERVER_STATUS_VALUES)[number];
export type LifecycleUpdatedFrom = (typeof LIFECYCLE_UPDATED_FROM_VALUES)[number];

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
