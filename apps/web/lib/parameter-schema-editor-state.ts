/**
 * Conversion between OpenAPI-style parameter schema and editor state for ParameterSchemaEditor.
 * Exported for tests and reuse; the editor component imports from here.
 */

export const SCHEMA_TYPES = [
  "string",
  "number",
  "boolean",
  "array",
  "object",
] as const;
export type SchemaType = (typeof SCHEMA_TYPES)[number];

function normalizeType(t: unknown): SchemaType {
  if (typeof t !== "string") return "string";
  const lower = t.toLowerCase();
  if (SCHEMA_TYPES.includes(lower as SchemaType)) return lower as SchemaType;
  const upper = t.toUpperCase();
  const map: Record<string, SchemaType> = {
    STRING: "string",
    NUMBER: "number",
    BOOLEAN: "boolean",
    ARRAY: "array",
    OBJECT: "object",
  };
  return map[upper] ?? "string";
}

/** API/backend expects types in uppercase: STRING, NUMBER, BOOLEAN, ARRAY, OBJECT */
const SCHEMA_TYPE_TO_API: Record<SchemaType, string> = {
  string: "STRING",
  number: "NUMBER",
  boolean: "BOOLEAN",
  array: "ARRAY",
  object: "OBJECT",
};

function toApiType(t: SchemaType): string {
  return SCHEMA_TYPE_TO_API[t];
}

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

function parseProperty(
  key: string,
  prop: Record<string, unknown>,
  requiredSet: Set<string>,
  idPrefix: string
): EditorProperty {
  const type = normalizeType(prop.type ?? (prop.properties ? "object" : "string"));
  const required = requiredSet.has(key);
  const description = typeof prop.description === "string" ? prop.description : "";
  const enumArr = Array.isArray(prop.enum)
    ? (prop.enum.filter((e): e is string => typeof e === "string") as string[])
    : undefined;
  const format = typeof prop.format === "string" ? prop.format : undefined;
  const id = idPrefix ? `${idPrefix}.${key}` : key;

  const base: EditorProperty = {
    id,
    name: key,
    type,
    description,
    required,
    enum: enumArr?.length ? enumArr : undefined,
    format: format || undefined,
  };

  if (type === "object") {
    const inner = prop.properties as Record<string, unknown> | undefined;
    const innerRequired = (prop.required as string[] | undefined) ?? [];
    const innerReqSet = new Set(innerRequired);
    const properties =
      inner && typeof inner === "object"
        ? Object.entries(inner).map(([k, v], i) =>
            parseProperty(k, (v as Record<string, unknown>) ?? {}, innerReqSet, `${id}.${i}-${k}`)
          )
        : [];
    base.properties = properties;
    base.requiredSub = innerRequired.length ? innerRequired : undefined;
  }

  if (type === "array") {
    const items = prop.items as Record<string, unknown> | undefined;
    if (items && typeof items === "object") {
      const itemType = normalizeType(items.type ?? (items.properties ? "object" : "string"));
      base.itemsType = itemType;
      if (itemType === "object") {
        const inner = items.properties as Record<string, unknown> | undefined;
        const innerRequired = (items.required as string[] | undefined) ?? [];
        const innerReqSet = new Set(innerRequired);
        base.itemsProperties =
          inner && typeof inner === "object"
            ? Object.entries(inner).map(([k, v], i) =>
                parseProperty(k, (v as Record<string, unknown>) ?? {}, innerReqSet, `${id}.items.${i}-${k}`)
              )
            : [];
      }
    } else {
      base.itemsType = "string";
    }
  }

  return base;
}

export function schemaToEditorState(
  schema: Record<string, unknown> | null | undefined
): EditorState {
  if (!schema || typeof schema !== "object") {
    return { properties: [], required: [] };
  }
  const type = normalizeType(schema.type ?? "object");
  if (type !== "object") {
    return { properties: [], required: [] };
  }
  const propertiesObj = schema.properties as Record<string, unknown> | undefined;
  const requiredList = (schema.required as string[] | undefined) ?? [];
  const requiredSet = new Set(requiredList);
  const properties =
    propertiesObj && typeof propertiesObj === "object"
      ? Object.entries(propertiesObj).map(([k, v], i) =>
          parseProperty(k, (v as Record<string, unknown>) ?? {}, requiredSet, `root.${i}-${k}`)
        )
      : [];
  return { properties, required: requiredList };
}

function buildPropertySchema(prop: EditorProperty): Record<string, unknown> {
  const out: Record<string, unknown> = {
    type: toApiType(prop.type),
  };
  if (prop.description) out.description = prop.description;
  if (prop.format) out.format = prop.format;
  if (prop.enum?.length) out.enum = prop.enum;

  if (prop.type === "object") {
    const innerProps = prop.properties ?? [];
    const innerRequired = innerProps
      .filter((p) => p.required && p.name.trim())
      .map((p) => p.name.trim());
    const properties: Record<string, unknown> = {};
    for (const p of innerProps) {
      if (p.name.trim()) properties[p.name.trim()] = buildPropertySchema(p);
    }
    out.properties = properties;
    if (innerRequired.length) out.required = innerRequired;
  }

  if (prop.type === "array") {
    const itemType = prop.itemsType ?? "string";
    if (itemType === "object") {
      const innerProps = prop.itemsProperties ?? [];
      const innerRequired = innerProps
        .filter((p) => p.required && p.name.trim())
        .map((p) => p.name.trim());
      const properties: Record<string, unknown> = {};
      for (const p of innerProps) {
        if (p.name.trim()) properties[p.name.trim()] = buildPropertySchema(p);
      }
      out.items = {
        type: "OBJECT",
        properties,
        ...(innerRequired.length ? { required: innerRequired } : {}),
      };
    } else {
      out.items = { type: toApiType(itemType) };
    }
  }

  return out;
}

export function editorStateToSchema(state: EditorState): Record<string, unknown> {
  const properties: Record<string, unknown> = {};
  for (const prop of state.properties) {
    const key = prop.name.trim();
    if (!key) continue;
    properties[key] = buildPropertySchema(prop);
  }
  const required = state.required.filter((r) => r.trim());
  return {
    type: "OBJECT",
    properties,
    required,
  };
}
