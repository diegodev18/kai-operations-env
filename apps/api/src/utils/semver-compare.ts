/** Numeric major.minor.patch for simple semver strings (aligned with web `getAllVersions`). */
function semverParts(v: string): [number, number, number] {
  const parts = String(v).split(".");
  const n0 = Number.parseInt(parts[0] ?? "", 10);
  const n1 = Number.parseInt(parts[1] ?? "", 10);
  const n2 = Number.parseInt(parts[2] ?? "", 10);
  return [
    Number.isFinite(n0) ? n0 : 0,
    Number.isFinite(n1) ? n1 : 0,
    Number.isFinite(n2) ? n2 : 0,
  ];
}

/**
 * Sort descending: higher semver first (e.g. 2.2.0 before 2.0.0).
 * Return value follows `Array.sort` comparator.
 */
export function compareSemverDesc(a: string, b: string): number {
  const [aM, am, ap] = semverParts(a);
  const [bM, bm, bp] = semverParts(b);
  if (aM !== bM) return bM - aM;
  if (am !== bm) return bm - am;
  return bp - ap;
}

/** Firestore-mapped changelog rows use loose field types from `mapEntryDoc`. */
export function compareChangelogEntriesVersionThenRegisterDateDesc(
  a: { version: unknown; registerDate?: unknown },
  b: { version: unknown; registerDate?: unknown },
): number {
  const byVersion = compareSemverDesc(String(a.version ?? ""), String(b.version ?? ""));
  if (byVersion !== 0) return byVersion;
  const ta = Date.parse(String(a.registerDate ?? "")) || 0;
  const tb = Date.parse(String(b.registerDate ?? "")) || 0;
  return tb - ta;
}
