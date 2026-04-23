/** Valor de lada con prefijo +, p. ej. "+52". */
export type WhatsappLadaValue = string;

export const DEFAULT_WHATSAPP_LADA: WhatsappLadaValue = "+52";

export const WHATSAPP_LADA_OPTIONS: ReadonlyArray<{
  value: WhatsappLadaValue;
  label: string;
}> = [
  { value: "+52", label: "🇲🇽 +52 (México)" },
  { value: "+1", label: "🇺🇸 +1 (EE.UU.)" },
  { value: "+34", label: "🇪🇸 +34 (España)" },
  { value: "+54", label: "🇦🇷 +54 (Argentina)" },
  { value: "+57", label: "🇨🇴 +57 (Colombia)" },
  { value: "+56", label: "🇨🇱 +56 (Chile)" },
  { value: "+51", label: "🇵🇪 +51 (Perú)" },
  { value: "+593", label: "🇪🇨 +593 (Ecuador)" },
  { value: "+507", label: "🇵🇦 +507 (Panamá)" },
  { value: "+506", label: "🇨🇷 +506 (Costa Rica)" },
];

export function digitsOnly(input: string): string {
  return input.replace(/\D/g, "");
}

/**
 * Formato guardado para integraciones tipo WhatsApp Cloud API (sin +).
 * México (+52): inserta el 1 de marcación móvil → prefijo 521.
 */
export function buildWhatsappApiPhone(
  lada: string,
  nationalNumber: string,
): string {
  const ladaDigits = lada.replace("+", "");
  const clean = digitsOnly(nationalNumber);
  if (lada === "+52") {
    return `${ladaDigits}1${clean}`;
  }
  return `${ladaDigits}${clean}`;
}

/** Parte un teléfono almacenado (sin +, típicamente solo dígitos) para el editor lada + número. */
export function parseStoredPhoneForEditor(
  stored: string | null | undefined,
): { lada: WhatsappLadaValue; nationalNumber: string } {
  const existing = stored ?? "";
  if (existing.startsWith("521") && existing.length > 3) {
    return { lada: "+52", nationalNumber: existing.slice(3) };
  }
  if (existing.startsWith("52") && existing.length > 2) {
    return { lada: "+52", nationalNumber: existing.slice(2) };
  }
  if (existing.startsWith("+")) {
    const match = existing.match(/^\+(\d+)/);
    if (match) {
      return {
        lada: `+${match[1]}`,
        nationalNumber: existing.replace(`+${match[1]}`, ""),
      };
    }
    return { lada: DEFAULT_WHATSAPP_LADA, nationalNumber: existing };
  }
  return { lada: DEFAULT_WHATSAPP_LADA, nationalNumber: existing };
}
