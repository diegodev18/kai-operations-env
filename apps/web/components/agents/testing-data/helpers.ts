import type { DocField, FieldDisplay } from "./types";

export function generateRandomDocId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function getValueType(value: unknown): DocField["type"] {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  if (typeof value === "object") return "object";
  if (typeof value === "number") return "number";
  if (typeof value === "boolean") return "boolean";
  return "string";
}

export function docToFields(doc: Record<string, unknown>): DocField[] {
  return Object.entries(doc).map(([key, value]) => ({
    key,
    value,
    type: getValueType(value),
  }));
}

export function arrayToFields(arr: unknown[]): DocField[] {
  return arr.map((value, index) => ({
    key: String(index),
    value,
    type: getValueType(value),
  }));
}

export function fieldsToDoc(fields: DocField[]): Record<string, unknown> {
  const doc: Record<string, unknown> = {};
  for (const field of fields) {
    if (!field.key.trim()) continue;
    doc[field.key.trim()] = field.value;
  }
  return doc;
}

export function normalizeArrayRowKeys(rows: DocField[]): DocField[] {
  return rows.map((f, i) => ({ ...f, key: String(i) }));
}

export function isDocFieldRow(item: unknown): item is DocField {
  if (item === null || typeof item !== "object" || Array.isArray(item)) return false;
  const o = item as Record<string, unknown>;
  if (!("value" in o) || typeof o.type !== "string") return false;
  return ["string", "number", "boolean", "null", "object", "array"].includes(o.type);
}

export function coerceNestedArrayFromSavePayload(data: Record<string, unknown>): unknown[] {
  const raw = data._array;
  if (!Array.isArray(raw)) return [];
  return raw.map((item) => (isDocFieldRow(item) ? item.value : item));
}

export function getFieldType(value: unknown): FieldDisplay["type"] {
  if (value === null || value === undefined) return "null";
  if (Array.isArray(value)) return "array";
  if (typeof value === "object") {
    const obj = value as { _seconds?: number; _nanoseconds?: number; _latitude?: number; _longitude?: number; _path?: string };
    if ("_seconds" in obj && "_nanoseconds" in obj) return "timestamp";
    if ("_latitude" in obj && "_longitude" in obj) return "geopoint";
    if ("_path" in obj) return "docref";
    return "object";
  }
  return typeof value as "string" | "number" | "boolean";
}

export function formatFieldValue(value: unknown): string {
  if (value === null) return "null";
  if (value === undefined) return "undefined";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) return `Array(${value.length})`;
  if (typeof value === "object") {
    const obj = value as { _seconds?: number; _nanoseconds?: number; _latitude?: number; _longitude?: number; _path?: string };
    if (obj._seconds !== undefined && obj._nanoseconds !== undefined) {
      return new Date(obj._seconds * 1000).toLocaleString();
    }
    if (obj._latitude !== undefined && obj._longitude !== undefined) {
      return `${obj._latitude}, ${obj._longitude}`;
    }
    if (obj._path) return obj._path;
    return "Object";
  }
  return String(value);
}

export function parseJsonToFields(jsonStr: string): FieldDisplay[] | null {
  try {
    const parsed = JSON.parse(jsonStr);
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return null;
    return Object.entries(parsed).map(([key, value]) => ({
      key,
      value,
      type: getFieldType(value),
    }));
  } catch {
    return null;
  }
}
