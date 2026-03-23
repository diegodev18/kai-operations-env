/** Estado y tipos del editor de schema JSON (tools / parámetros). */

export const SCHEMA_TYPES = [
  "string",
  "number",
  "boolean",
  "array",
  "object",
] as const;

export type SchemaType = (typeof SCHEMA_TYPES)[number];

export interface EditorProperty {
  id: string;
  name: string;
  type: SchemaType;
  description: string;
  required: boolean;
  enum?: string[];
  format?: string;
  /** For type === 'object' */
  properties?: EditorProperty[];
  requiredSub?: string[];
  /** For type === 'array' */
  itemsType?: SchemaType;
  itemsProperties?: EditorProperty[];
}

export interface EditorState {
  properties: EditorProperty[];
  required: string[];
}

export const EMPTY_SCHEMA: Record<string, unknown> = {
  type: "OBJECT",
  properties: {},
  required: [],
};
