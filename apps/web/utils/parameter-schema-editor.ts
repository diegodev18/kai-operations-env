/**
 * Conversión entre schema estilo OpenAPI y estado del ParameterSchemaEditor.
 */
import type {
  EditorProperty,
  EditorState,
  SchemaType,
} from "@/types/parameter-schema";
import { SCHEMA_TYPES } from "@/types/parameter-schema";

/** Filas sin nombre aún: se serializan con esta prefijo para que el estado round-tripe al padre. */
export const DRAFT_PROPERTY_KEY_PREFIX = "__draft_";

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

function parseProperty(
  key: string,
  prop: Record<string, unknown>,
  requiredSet: Set<string>,
  idPrefix: string,
): EditorProperty {
  const isDraftKey = key.startsWith(DRAFT_PROPERTY_KEY_PREFIX);
  const displayName = isDraftKey ? "" : key;
  const draftId = isDraftKey ? key.slice(DRAFT_PROPERTY_KEY_PREFIX.length) : "";
  const type = normalizeType(
    prop.type ?? (prop.properties ? "object" : "string"),
  );
  const required = requiredSet.has(key);
  const description =
    typeof prop.description === "string" ? prop.description : "";
  const enumArr = Array.isArray(prop.enum)
    ? (prop.enum.filter((e): e is string => typeof e === "string") as string[])
    : undefined;
  const format = typeof prop.format === "string" ? prop.format : undefined;
  const id =
    isDraftKey && draftId ? draftId : idPrefix ? `${idPrefix}.${key}` : key;

  const base: EditorProperty = {
    id,
    name: displayName,
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
            parseProperty(
              k,
              (v as Record<string, unknown>) ?? {},
              innerReqSet,
              `${id}.${i}-${k}`,
            ),
          )
        : [];
    base.properties = properties;
    base.requiredSub = innerRequired.length ? innerRequired : undefined;
  }

  if (type === "array") {
    const items = prop.items as Record<string, unknown> | undefined;
    if (items && typeof items === "object") {
      const itemType = normalizeType(
        items.type ?? (items.properties ? "object" : "string"),
      );
      base.itemsType = itemType;
      if (itemType === "object") {
        const inner = items.properties as Record<string, unknown> | undefined;
        const innerRequired = (items.required as string[] | undefined) ?? [];
        const innerReqSet = new Set(innerRequired);
        base.itemsProperties =
          inner && typeof inner === "object"
            ? Object.entries(inner).map(([k, v], i) =>
                parseProperty(
                  k,
                  (v as Record<string, unknown>) ?? {},
                  innerReqSet,
                  `${id}.items.${i}-${k}`,
                ),
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
  schema: Record<string, unknown> | null | undefined,
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
          parseProperty(
            k,
            (v as Record<string, unknown>) ?? {},
            requiredSet,
            `root.${i}-${k}`,
          ),
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
      const k = p.name.trim();
      if (!k) {
        properties[`${DRAFT_PROPERTY_KEY_PREFIX}${p.id}`] = buildPropertySchema(p);
        continue;
      }
      properties[k] = buildPropertySchema(p);
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
        const k = p.name.trim();
        if (!k) {
          properties[`${DRAFT_PROPERTY_KEY_PREFIX}${p.id}`] = buildPropertySchema(p);
          continue;
        }
        properties[k] = buildPropertySchema(p);
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
    if (!key) {
      properties[`${DRAFT_PROPERTY_KEY_PREFIX}${prop.id}`] = buildPropertySchema(prop);
      continue;
    }
    properties[key] = buildPropertySchema(prop);
  }
  const required = state.required.filter((r) => r.trim());
  return {
    type: "OBJECT",
    properties,
    required,
  };
}

function stripPropertiesMap(props: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(props)) {
    if (k.startsWith(DRAFT_PROPERTY_KEY_PREFIX)) continue;
    out[k] =
      v && typeof v === "object" && !Array.isArray(v)
        ? stripNestedPropertySchema(v as Record<string, unknown>)
        : v;
  }
  return out;
}

function stripNestedPropertySchema(node: Record<string, unknown>): Record<string, unknown> {
  const next = { ...node };
  if (next.properties && typeof next.properties === "object" && !Array.isArray(next.properties)) {
    next.properties = stripPropertiesMap(next.properties as Record<string, unknown>);
  }
  if (next.items && typeof next.items === "object" && !Array.isArray(next.items)) {
    next.items = stripNestedPropertySchema(next.items as Record<string, unknown>);
  }
  return next;
}

/** Quita parámetros de borrador antes de persistir en API (no deben existir en producción). */
export function stripDraftPropertyKeysFromSchema(
  schema: Record<string, unknown> | null | undefined,
): Record<string, unknown> | null {
  if (!schema || typeof schema !== "object") return null;
  return stripNestedPropertySchema(schema);
}

/** Schema listo para la API: sin claves `__draft_*`. `undefined` si no queda ninguna propiedad. */
export function parametersSchemaForApi(
  schema: Record<string, unknown>,
): Record<string, unknown> | undefined {
  const next = stripDraftPropertyKeysFromSchema(schema);
  if (!next) return undefined;
  const props = next.properties;
  if (!props || typeof props !== "object" || Array.isArray(props)) return undefined;
  if (Object.keys(props as Record<string, unknown>).length === 0) return undefined;
  return next;
}
