const COUNTRY_CODE_MAPPING: Record<
  string,
  { country: string; lada: string; timezone: string }
> = {
  "1": { country: "USA", lada: "1", timezone: "America/New_York" },
  "52": { country: "Mexico", lada: "52", timezone: "America/Mexico_City" },
  "521": { country: "Mexico", lada: "521", timezone: "America/Mexico_City" },
  "54": {
    country: "Argentina",
    lada: "54",
    timezone: "America/Argentina/Buenos_Aires",
  },
  "55": { country: "Brazil", lada: "55", timezone: "America/Sao_Paulo" },
  "51": { country: "Peru", lada: "51", timezone: "America/Lima" },
  "57": { country: "Colombia", lada: "57", timezone: "America/Bogota" },
  "593": { country: "Ecuador", lada: "593", timezone: "America/Guayaquil" },
  "502": { country: "Guatemala", lada: "502", timezone: "America/Guatemala" },
  "503": {
    country: "El Salvador",
    lada: "503",
    timezone: "America/El_Salvador",
  },
  "504": { country: "Honduras", lada: "504", timezone: "America/Tegucigalpa" },
  "505": { country: "Nicaragua", lada: "505", timezone: "America/Managua" },
  "506": { country: "Costa Rica", lada: "506", timezone: "America/Costa_Rica" },
  "507": { country: "Panama", lada: "507", timezone: "America/Panama" },
  "56": { country: "Chile", lada: "56", timezone: "America/Santiago" },
  "58": { country: "Venezuela", lada: "58", timezone: "America/Caracas" },
};

export function detectAreaCodeFromPhoneNumber(phoneNumber: string): {
  country: string;
  lada: string;
  timezone: string;
} {
  const cleanedNumber = phoneNumber.replace(/\D/g, "");

  if (!cleanedNumber || cleanedNumber.length === 0) {
    return { country: "Mexico", lada: "521", timezone: "America/Mexico_City" };
  }

  for (let length = 3; length >= 1; length--) {
    if (cleanedNumber.length >= length) {
      const countryCode = cleanedNumber.substring(0, length);
      const mapping = COUNTRY_CODE_MAPPING[countryCode];
      if (mapping) {
        return mapping;
      }
    }
  }

  return { country: "Mexico", lada: "521", timezone: "America/Mexico_City" };
}
