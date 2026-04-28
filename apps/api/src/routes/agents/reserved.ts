/** Evita que `drafts`, `info`, etc. se interpreten como ID de agente. */
export function isReservedAgentPathSegment(id: string): boolean {
  return id === "drafts" || id === "info" || id === "tools-catalog";
}
