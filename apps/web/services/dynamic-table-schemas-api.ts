import type { DynamicTableSchemaDocument } from "@/types/dynamic-table-schema";
import type { Environment } from "@/contexts/EnvironmentContext";

const API_BASE = "/api/dynamic-table-schemas";

function envHeaders(environment: Environment): HeadersInit {
  return { "X-Environment": environment };
}

function errorFromJson(data: unknown, fallback: string, status: number): string {
  if (data && typeof data === "object") {
    const o = data as { error?: unknown };
    if (typeof o.error === "string" && o.error.trim()) return o.error;
  }
  return `${fallback} (HTTP ${status})`;
}

export type DynamicTableSchemaCreateInput = {
  label: string;
  description?: string;
  version?: number;
  targetCollection: string;
  fields: DynamicTableSchemaDocument["fields"];
};

export type DynamicTableSchemaPatchInput = Partial<
  Pick<
    DynamicTableSchemaCreateInput,
    "label" | "description" | "version" | "targetCollection" | "fields"
  >
>;

export async function fetchDynamicTableSchemas(
  environment: Environment,
): Promise<{ ok: true; schemas: DynamicTableSchemaDocument[] } | { ok: false; error: string }> {
  const res = await fetch(API_BASE, {
    credentials: "include",
    headers: envHeaders(environment),
  });
  let data: unknown = null;
  try {
    data = await res.json();
  } catch {
    /* empty */
  }
  if (!res.ok) {
    return { ok: false, error: errorFromJson(data, "No se pudieron cargar los esquemas", res.status) };
  }
  const schemas = (data as { schemas?: DynamicTableSchemaDocument[] }).schemas;
  if (!Array.isArray(schemas)) {
    return { ok: false, error: "Respuesta inválida del servidor" };
  }
  return { ok: true, schemas };
}

export async function fetchDynamicTableSchema(
  environment: Environment,
  schemaId: string,
): Promise<{ ok: true; schema: DynamicTableSchemaDocument } | { ok: false; error: string }> {
  const res = await fetch(`${API_BASE}/${encodeURIComponent(schemaId)}`, {
    credentials: "include",
    headers: envHeaders(environment),
  });
  let data: unknown = null;
  try {
    data = await res.json();
  } catch {
    /* empty */
  }
  if (!res.ok) {
    return { ok: false, error: errorFromJson(data, "No se pudo cargar el esquema", res.status) };
  }
  const schema = (data as { schema?: DynamicTableSchemaDocument }).schema;
  if (!schema || typeof schema !== "object") {
    return { ok: false, error: "Respuesta inválida del servidor" };
  }
  return { ok: true, schema };
}

export async function createDynamicTableSchema(
  environment: Environment,
  body: DynamicTableSchemaCreateInput,
): Promise<{ ok: true; schema: DynamicTableSchemaDocument } | { ok: false; error: string }> {
  const res = await fetch(API_BASE, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json", ...envHeaders(environment) },
    body: JSON.stringify(body),
  });
  let data: unknown = null;
  try {
    data = await res.json();
  } catch {
    /* empty */
  }
  if (!res.ok) {
    return { ok: false, error: errorFromJson(data, "No se pudo crear el esquema", res.status) };
  }
  const schema = (data as { schema?: DynamicTableSchemaDocument }).schema;
  if (!schema) {
    return { ok: false, error: "Respuesta inválida del servidor" };
  }
  return { ok: true, schema };
}

export async function patchDynamicTableSchema(
  environment: Environment,
  schemaId: string,
  body: DynamicTableSchemaPatchInput,
): Promise<{ ok: true; schema: DynamicTableSchemaDocument } | { ok: false; error: string }> {
  const res = await fetch(`${API_BASE}/${encodeURIComponent(schemaId)}`, {
    method: "PATCH",
    credentials: "include",
    headers: { "Content-Type": "application/json", ...envHeaders(environment) },
    body: JSON.stringify(body),
  });
  let data: unknown = null;
  try {
    data = await res.json();
  } catch {
    /* empty */
  }
  if (!res.ok) {
    return { ok: false, error: errorFromJson(data, "No se pudo guardar el esquema", res.status) };
  }
  const schema = (data as { schema?: DynamicTableSchemaDocument }).schema;
  if (!schema) {
    return { ok: false, error: "Respuesta inválida del servidor" };
  }
  return { ok: true, schema };
}

export async function deleteDynamicTableSchema(
  environment: Environment,
  schemaId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const res = await fetch(`${API_BASE}/${encodeURIComponent(schemaId)}`, {
    method: "DELETE",
    credentials: "include",
    headers: envHeaders(environment),
  });
  let data: unknown = null;
  try {
    data = await res.json();
  } catch {
    /* empty */
  }
  if (!res.ok) {
    return { ok: false, error: errorFromJson(data, "No se pudo eliminar el esquema", res.status) };
  }
  return { ok: true };
}
