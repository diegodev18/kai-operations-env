export type TimestampLike = { _seconds?: number; _nanoseconds?: number };
export type GeoPointLike = { _latitude?: number; _longitude?: number };

export function isTimestamp(value: unknown): value is TimestampLike {
  return value !== null && typeof value === "object" && "_seconds" in (value as object) && typeof (value as TimestampLike)._seconds === "number";
}

export function isGeoPoint(value: unknown): value is GeoPointLike {
  return value !== null && typeof value === "object" && "_latitude" in (value as object) && typeof (value as GeoPointLike)._latitude === "number";
}

export function collectAllPaths(data: unknown, prefix = "root"): Set<string> {
  const out = new Set<string>([prefix]);
  if (Array.isArray(data) && data.length > 0) {
    data.forEach((item, i) => {
      const p = `${prefix}.${i}`;
      out.add(p);
      if (item !== null && typeof item === "object" && !isTimestamp(item) && !isGeoPoint(item)) {
        collectAllPaths(item, p).forEach((k) => out.add(k));
      }
    });
  }
  if (typeof data === "object" && data !== null && !Array.isArray(data) && !isTimestamp(data) && !isGeoPoint(data)) {
    const obj = data as Record<string, unknown>;
    Object.keys(obj).forEach((k) => {
      const p = `${prefix}.${k}`;
      out.add(p);
      const v = obj[k];
      if (v !== null && typeof v === "object" && !isTimestamp(v) && !isGeoPoint(v)) {
        collectAllPaths(v, p).forEach((key) => out.add(key));
      }
    });
  }
  return out;
}