type SerializedTimestamp = {
  _seconds: number;
  _nanoseconds?: number;
};

export function isSerializedTimestamp(value: unknown): value is SerializedTimestamp {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const typed = value as Record<string, unknown>;
  return typeof typed._seconds === "number";
}

export function formatFirestoreValue(value: unknown): string {
  if (value === undefined || value === null) return "—";
  if (isSerializedTimestamp(value)) {
    const ms = value._seconds * 1000 + Math.floor((value._nanoseconds ?? 0) / 1_000_000);
    const date = new Date(ms);
    return Number.isNaN(date.getTime())
      ? `Timestamp(${value._seconds}, ${value._nanoseconds ?? 0})`
      : date.toISOString();
  }
  if (typeof value === "object") return JSON.stringify(value, null, 2);
  return String(value);
}
