/**
 * Serializes `agent_configurations/{id}` root document for API clients:
 * strips WhatsApp secrets and converts Firestore timestamps to ISO strings.
 * Shared by GET /drafts/:id and GET /:agentId/builder-form.
 */
export function serializeValue(v: unknown): unknown {
  if (v == null) return v;
  if (
    typeof v === "object" &&
    v !== null &&
    "toDate" in v &&
    typeof (v as { toDate: () => Date }).toDate === "function"
  ) {
    try {
      return (v as { toDate: () => Date }).toDate().toISOString();
    } catch {
      return null;
    }
  }
  if (Array.isArray(v)) return v.map(serializeValue);
  if (typeof v === "object" && v !== null) {
    const o = v as Record<string, unknown>;
    const next: Record<string, unknown> = {};
    for (const [k, val] of Object.entries(o)) {
      next[k] = serializeValue(val);
    }
    return next;
  }
  return v;
}

export function serializeAgentConfigurationRootForClient(
  data: Record<string, unknown>,
): Record<string, unknown> {
  const secretKeys = new Set([
    "whatsappToken",
    "whatsapp_token",
    "AGENT_WHATSAPP_TOKEN",
    "AGENT_LONG_LIVED_TOKEN",
  ]);
  let hasWhatsappToken = false;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(data)) {
    if (secretKeys.has(k)) {
      hasWhatsappToken =
        hasWhatsappToken || (typeof v === "string" ? v.length > 0 : Boolean(v));
      continue;
    }
    out[k] = serializeValue(v);
  }
  if (hasWhatsappToken) out.has_whatsapp_token = true;
  return out;
}
