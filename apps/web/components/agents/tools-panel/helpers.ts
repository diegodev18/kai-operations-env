import type { AgentToolType } from "@/types";
import {
  fetchAgentProperties,
  patchAgentPropertyDoc,
} from "@/services/agents-api";
import type { badgeVariants } from "@/components/ui/badge";
import type { VariantProps } from "class-variance-authority";

import type { JsonRecord } from "./types";

type BadgeVariant = NonNullable<VariantProps<typeof badgeVariants>["variant"]>;

export function normalizeObjectSchema(schema: unknown): JsonRecord | null {
  if (!schema || typeof schema !== "object" || Array.isArray(schema)) {
    return null;
  }
  const typed = schema as JsonRecord;
  const type =
    typeof typed.type === "string" ? typed.type.toUpperCase() : "OBJECT";
  if (type !== "OBJECT") return null;
  const properties = typed.properties;
  if (
    !properties ||
    typeof properties !== "object" ||
    Array.isArray(properties)
  ) {
    return null;
  }
  return typed;
}

export function getDocSchemasFromToolSchema(
  schema: unknown,
): Record<string, JsonRecord> {
  const normalized = normalizeObjectSchema(schema);
  if (!normalized) return {};
  const rootProps = normalized.properties as JsonRecord;
  const entries = Object.entries(rootProps).filter(([, value]) => {
    const item = normalizeObjectSchema(value);
    return !!item;
  });
  return Object.fromEntries(entries.map(([k, v]) => [k, v as JsonRecord]));
}

export async function fetchAgentPropertiesMap(
  agentId: string,
): Promise<JsonRecord | null> {
  const result = await fetchAgentProperties(agentId);
  return (result as JsonRecord) || null;
}

export async function patchAgentPropertyDocLocal(
  agentId: string,
  docId: string,
  payload: JsonRecord,
): Promise<boolean> {
  const result = await patchAgentPropertyDoc(
    agentId,
    docId,
    payload as Record<string, unknown>,
  );
  return result.ok;
}

export function getSchemaType(schema: unknown): string {
  if (!schema || typeof schema !== "object" || Array.isArray(schema)) {
    return "string";
  }
  const type = (schema as JsonRecord).type;
  return typeof type === "string" ? type.toLowerCase() : "string";
}

export function getSchemaDescription(schema: unknown): string {
  if (!schema || typeof schema !== "object" || Array.isArray(schema)) return "";
  const raw = (schema as JsonRecord).description;
  if (typeof raw === "string") return raw;
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    const es = (raw as JsonRecord).es;
    return typeof es === "string" ? es : "";
  }
  return "";
}

export function getObjectProperties(schema: unknown): JsonRecord {
  if (!schema || typeof schema !== "object" || Array.isArray(schema)) return {};
  const props = (schema as JsonRecord).properties;
  if (!props || typeof props !== "object" || Array.isArray(props)) return {};
  return props as JsonRecord;
}

export function getNestedValue(obj: JsonRecord, path: string[]): unknown {
  let current: unknown = obj;
  for (const key of path) {
    if (!current || typeof current !== "object" || Array.isArray(current)) {
      return undefined;
    }
    current = (current as JsonRecord)[key];
  }
  return current;
}

export function setNestedValue(
  obj: JsonRecord,
  path: string[],
  value: unknown,
): JsonRecord {
  if (path.length === 0) return obj;
  const [head, ...rest] = path;
  const next = { ...obj };
  if (rest.length === 0) {
    next[head] = value;
    return next;
  }
  const currentChild =
    next[head] && typeof next[head] === "object" && !Array.isArray(next[head])
      ? (next[head] as JsonRecord)
      : {};
  next[head] = setNestedValue(currentChild, rest, value);
  return next;
}

export function toolTypeBadgeVariant(type: AgentToolType): BadgeVariant {
  switch (type) {
    case "custom":
      return "default";
    case "preset":
      return "outline";
    case "default":
    default:
      return "secondary";
  }
}
