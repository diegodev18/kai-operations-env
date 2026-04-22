/** Listas fijas del editor de schema JSON (tools / parámetros). */

export const SCHEMA_TYPES = ["string", "number", "boolean", "array", "object"] as const;

export type SchemaType = (typeof SCHEMA_TYPES)[number];

export const EMPTY_SCHEMA: Record<string, unknown> = {
  type: "OBJECT",
  properties: {},
  required: [],
};
