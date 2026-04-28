/** Normaliza `allowedSchemaIds` desde el documento raíz `agent_configurations/{id}`. */
export function normalizeallowedSchemaIdsFromAgentRoot(
  data: Record<string, unknown> | undefined,
): string[] {
  if (!data) return [];
  const raw = data.allowedSchemaIds ?? data.allowed_schemas_ids;
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (x): x is string => typeof x === "string" && x.trim() !== "",
  );
}
