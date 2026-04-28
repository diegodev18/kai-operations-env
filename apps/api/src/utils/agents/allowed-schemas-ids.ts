/** Normaliza `allowedSchemasIds` desde el documento raíz `agent_configurations/{id}`. */
export function normalizeAllowedSchemasIdsFromAgentRoot(
  data: Record<string, unknown> | undefined,
): string[] {
  if (!data) return [];
  const raw = data.allowedSchemasIds ?? data.allowed_schemas_ids;
  if (!Array.isArray(raw)) return [];
  return raw.filter((x): x is string => typeof x === "string" && x.trim() !== "");
}
