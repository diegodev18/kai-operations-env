/**
 * Si el cliente envía México sin el 1 de móvil (12 dígitos: 52 + 10 nacionales),
 * normaliza a 521… para alinear con WhatsApp Cloud API.
 * No altera otros formatos (p. ej. ya 521… o países distintos).
 */
export function normalizeMexicoMobileWhatsappPhone(
  phone: string | null | undefined,
): string | null | undefined {
  if (phone == null) return phone;
  const trimmed = phone.trim();
  if (!trimmed) return null;
  const digits = trimmed.replace(/\D/g, "");
  if (
    digits.length === 12 &&
    digits.startsWith("52") &&
    digits.charAt(2) !== "1"
  ) {
    return `521${digits.slice(2)}`;
  }
  return trimmed;
}
