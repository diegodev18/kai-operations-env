/** Texto legible para burbujas de usuario cuando no hay displayText (p. ej. mensajes antiguos). */
export function formatUserBubbleText(raw: string): string {
  const valueMatch = /^UI_VALUE:([^:]+):([\s\S]+)$/.exec(raw);
  if (valueMatch) {
    try {
      return decodeURIComponent(valueMatch[2]);
    } catch {
      return valueMatch[2];
    }
  }
  const formMatch = /^UI_FORM:([^:]+):([\s\S]+)$/.exec(raw);
  if (formMatch) {
    try {
      const obj = JSON.parse(formMatch[2]) as Record<string, string>;
      const entries = Object.entries(obj).filter(([, v]) => String(v).trim());
      if (entries.length === 0) return "Formulario enviado";
      return entries
        .slice(0, 5)
        .map(([k, v]) => `${k}: ${v}`)
        .join(" · ");
    } catch {
      return "Formulario enviado";
    }
  }
  const multiMatch = /^UI_MULTI:([^:]+):([\s\S]+)$/.exec(raw);
  if (multiMatch) {
    try {
      const parsed = JSON.parse(multiMatch[2]) as {
        selected?: Array<{ label?: string; value?: string }>;
      };
      const items = parsed.selected ?? [];
      if (items.length === 0) return "Selección vacía";
      return items
        .map((s) => (s.label ?? s.value ?? "").trim())
        .filter(Boolean)
        .join(" · ");
    } catch {
      return "Selección múltiple";
    }
  }
  return raw;
}
