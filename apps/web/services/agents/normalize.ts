export function normalizeAgentStatus(value: unknown): "active" | "archived" {
  return value === "archived" ? "archived" : "active";
}
