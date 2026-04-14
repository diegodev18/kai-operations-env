import type { Agent } from "@/lib/agent";
import { toAgentWithOperations, type AgentWithOperations, type AgentBilling, type PaymentRecord } from "@/lib/agent";
import type {
  AgentDraftClient,
  AgentDraftPatchBody,
  DraftPendingTask,
  AgentGrowerRow,
  AgentTechLeadRow,
  ImplementationTask,
  ImplementationTaskStatus,
  ImplementationTaskType,
  ImplementationTaskAttachment,
  ToolsCatalogItem,
  BuilderChatDraftPatch,
  BuilderChatMessage,
  BuilderChatUI,
} from "@/types/agents-api";

export type {
  AgentDraftClient,
  AgentDraftPatchBody,
  DraftPendingTask,
  AgentGrowerRow,
  AgentTechLeadRow,
  ImplementationTask,
  ImplementationTaskStatus,
  ImplementationTaskType,
  ImplementationTaskAttachment,
  ToolsCatalogItem,
  BuilderChatDraftPatch,
  BuilderChatMessage,
  BuilderChatUI,
};

export type DraftPropertyItem = {
  id: string;
  title: string;
  content: string;
  created_at?: string | null;
  updated_at?: string | null;
};

/** Tama?o de cada p?gina al listar agentes (carga perezosa: primero solo esta cantidad). */
export const AGENTS_PAGE_SIZE = 10;

function agentsInfoUrl(
  light: boolean,
  paginated: boolean,
  pageSize: number,
  cursor?: string,
  q?: string,
  filters?: {
    status?: string;
    billingAlert?: string;
    domiciliated?: string;
  },
  preview?: boolean,
  favorites?: boolean,
): string {
  const params = new URLSearchParams();
  if (light) params.set("light", "1");
  if (paginated) {
    params.set("limit", String(Math.max(1, Math.min(100, pageSize))));
    if (cursor) params.set("cursor", cursor);
  }
  const trimmedQ = q?.trim();
  if (trimmedQ) params.set("q", trimmedQ);
  if (filters) {
    if (filters.status) params.set("status", filters.status);
    if (filters.billingAlert) params.set("billingAlert", filters.billingAlert);
    if (filters.domiciliated !== undefined) params.set("domiciliated", filters.domiciliated);
  }
  if (preview) params.set("preview", "1");
  if (favorites) params.set("favorites", "1");
  return `/api/agents/info?${params.toString()}`;
}

export async function fetchAgentsPage(
  options: {
    light?: boolean;
    paginated?: boolean;
    pageSize?: number;
    cursor?: string;
    /** Búsqueda en servidor (Firestore); vacío omite el parámetro. */
    q?: string;
    filters?: {
      status?: string;
      billingAlert?: string;
      domiciliated?: string;
    };
    /** Modo preview: carga más rápido sin growers/techLeads */
    preview?: boolean;
    /** Filtro de favoritos del usuario actual */
    favorites?: boolean;
  } = {},
): Promise<{ agents: AgentWithOperations[]; nextCursor: string | null } | null> {
  const {
    light = true,
    paginated = true,
    pageSize = AGENTS_PAGE_SIZE,
    cursor,
    q,
    filters,
    preview,
    favorites,
  } = options;
  const url = agentsInfoUrl(light, paginated, pageSize, cursor, q, filters, preview, favorites);
  const response = await fetch(url, {
    credentials: "include",
    cache: "no-store",
  });
  if (!response.ok) return null;
  const data = (await response.json()) as
    | { agents: Agent[]; nextCursor?: string | null }
    | { agents: Agent[] };
  const list = (data.agents ?? []).map(toAgentWithOperations);
  const nextCursor =
    "nextCursor" in data ? (data.nextCursor ?? null) : null;
  return { agents: list, nextCursor };
}

export async function postAgentGrower(
  agentId: string,
  body: { email: string; name?: string },
): Promise<
  | { ok: true; grower: { email: string; name: string } }
  | { ok: false; error: string }
> {
  const res = await fetch(
    `/api/agents/${encodeURIComponent(agentId)}/growers`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(body),
    },
  );
  let data: {
    ok?: boolean;
    grower?: { email: string; name: string };
    error?: string;
  } = {};
  try {
    data = (await res.json()) as typeof data;
  } catch {
    /* empty */
  }
  if (!res.ok) {
    return {
      ok: false,
      error: data.error ?? "No se pudo agregar el grower",
    };
  }
  if (data.ok && data.grower) {
    return { ok: true, grower: data.grower };
  }
  return { ok: false, error: "Respuesta inv?lida del servidor" };
}

export async function fetchAgentGrowers(
  agentId: string,
): Promise<{ growers: AgentGrowerRow[] } | null> {
  const res = await fetch(
    `/api/agents/${encodeURIComponent(agentId)}/growers`,
    {
      credentials: "include",
      cache: "no-store",
    },
  );
  if (!res.ok) return null;
  try {
    return (await res.json()) as { growers: AgentGrowerRow[] };
  } catch {
    return null;
  }
}

export async function deleteAgentGrower(
  agentId: string,
  email: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const enc = encodeURIComponent(email.trim().toLowerCase());
  const res = await fetch(
    `/api/agents/${encodeURIComponent(agentId)}/growers/${enc}`,
    {
      method: "DELETE",
      credentials: "include",
    },
  );
  let data: { ok?: boolean; error?: string } = {};
  try {
    data = (await res.json()) as typeof data;
  } catch {
    /* empty */
  }
  if (!res.ok) {
    return {
      ok: false,
      error: data.error ?? "No se pudo quitar el grower",
    };
  }
  if (data.ok) {
    return { ok: true };
  }
  return { ok: false, error: "Respuesta inv?lida del servidor" };
}

export async function postAgentTechLead(
  agentId: string,
  body: { email: string; name?: string },
): Promise<
  | { ok: true; techLead: { email: string; name: string } }
  | { ok: false; error: string }
> {
  const res = await fetch(
    `/api/agents/${encodeURIComponent(agentId)}/techLeads`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(body),
    },
  );
  let data: {
    ok?: boolean;
    techLead?: { email: string; name: string };
    error?: string;
  } = {};
  try {
    data = (await res.json()) as typeof data;
  } catch {
    /* empty */
  }
  if (!res.ok) {
    return {
      ok: false,
      error: data.error ?? "No se pudo agregar el tech lead",
    };
  }
  if (data.ok && data.techLead) {
    return { ok: true, techLead: data.techLead };
  }
  return { ok: false, error: "Respuesta inv?lida del servidor" };
}

export async function fetchAgentTechLeads(
  agentId: string,
): Promise<{ techLeads: AgentTechLeadRow[] } | null> {
  const res = await fetch(
    `/api/agents/${encodeURIComponent(agentId)}/techLeads`,
    {
      credentials: "include",
      cache: "no-store",
    },
  );
  if (!res.ok) return null;
  try {
    return (await res.json()) as { techLeads: AgentTechLeadRow[] };
  } catch {
    return null;
  }
}

export async function deleteAgentTechLead(
  agentId: string,
  email: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const enc = encodeURIComponent(email.trim().toLowerCase());
  const res = await fetch(
    `/api/agents/${encodeURIComponent(agentId)}/techLeads/${enc}`,
    {
      method: "DELETE",
      credentials: "include",
    },
  );
  let data: { ok?: boolean; error?: string } = {};
  try {
    data = (await res.json()) as typeof data;
  } catch {
    /* empty */
  }
  if (!res.ok) {
    return {
      ok: false,
      error: data.error ?? "No se pudo quitar el tech lead",
    };
  }
  if (data.ok) {
    return { ok: true };
  }
  return { ok: false, error: "Respuesta inv?lida del servidor" };
}

// --- Agent drafts (colecci?n agent_drafts; miembros y admins; grower creador en POST) ---

export async function fetchToolsCatalog(): Promise<
  ToolsCatalogItem[] | null
> {
  const res = await fetch("/api/agents/tools-catalog", {
    credentials: "include",
    cache: "no-store",
  });
  if (!res.ok) return null;
  try {
    const data = (await res.json()) as { tools?: ToolsCatalogItem[] };
    return Array.isArray(data.tools) ? data.tools : [];
  } catch {
    return null;
  }
}

export async function postAgentDraft(body: {
  agent_name: string;
  agent_personality: string;
}): Promise<
  | { ok: true; id: string; creation_step?: string }
  | { ok: false; error: string }
> {
  const res = await fetch("/api/agents/drafts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(body),
  });
  let data: {
    id?: string;
    creation_step?: string;
    error?: string;
  } = {};
  try {
    data = (await res.json()) as typeof data;
  } catch {
    /* empty */
  }
  if (!res.ok) {
    return {
      ok: false,
      error: data.error ?? "No se pudo crear el borrador",
    };
  }
  if (data.id) {
    return {
      ok: true,
      id: data.id,
      creation_step: data.creation_step,
    };
  }
  return { ok: false, error: "Respuesta inv?lida del servidor" };
}

export async function patchAgentDraft(
  draftId: string,
  body: AgentDraftPatchBody,
): Promise<
  | { ok: true; creation_step?: string; selected_tools?: string[] }
  | { ok: false; error: string; invalid_ids?: string[] }
> {
  const res = await fetch(
    `/api/agents/drafts/${encodeURIComponent(draftId)}`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(body),
    },
  );
  let data: {
    creation_step?: string;
    selected_tools?: string[];
    error?: string;
    invalid_ids?: string[];
  } = {};
  try {
    data = (await res.json()) as typeof data;
  } catch {
    /* empty */
  }
  if (!res.ok) {
    return {
      ok: false,
      error: data.error ?? "No se pudo actualizar el borrador",
      invalid_ids: data.invalid_ids,
    };
  }
  return {
    ok: true,
    creation_step: data.creation_step,
    selected_tools: data.selected_tools,
  };
}

export async function fetchAgentDraft(
  draftId: string,
): Promise<
  | {
      ok: true;
      id: string;
      draft: AgentDraftClient;
      systemPromptGenerationStatus?: string;
      systemPromptGenerationError?: string | null;
    }
  | { ok: false; error: string }
> {
  const res = await fetch(
    `/api/agents/drafts/${encodeURIComponent(draftId)}`,
    {
      credentials: "include",
      cache: "no-store",
    },
  );
  let data: {
    id?: string;
    draft?: AgentDraftClient;
    error?: string;
    systemPromptGenerationStatus?: string;
    systemPromptGenerationError?: string | null;
  } = {};
  try {
    data = (await res.json()) as typeof data;
  } catch {
    /* empty */
  }
  if (!res.ok) {
    return {
      ok: false,
      error: data.error ?? "No se pudo cargar el borrador",
    };
  }
  if (data.id && data.draft && typeof data.draft === "object") {
    return {
      ok: true,
      id: data.id,
      draft: data.draft,
      ...(data.systemPromptGenerationStatus != null
        ? { systemPromptGenerationStatus: data.systemPromptGenerationStatus }
        : {}),
      ...(data.systemPromptGenerationError !== undefined
        ? { systemPromptGenerationError: data.systemPromptGenerationError }
        : {}),
    };
  }
  return { ok: false, error: "Respuesta inv?lida del servidor" };
}

export async function postDraftSystemPromptRegenerate(
  draftId: string,
): Promise<{ ok: true } | { ok: false; error: string; conflict?: boolean }> {
  const res = await fetch(
    `/api/agents/drafts/${encodeURIComponent(draftId)}/system-prompt/regenerate`,
    { method: "POST", credentials: "include" },
  );
  let data: { ok?: boolean; error?: string } = {};
  try {
    data = (await res.json()) as typeof data;
  } catch {
    /* empty */
  }
  if (res.status === 409) {
    return {
      ok: false,
      error: data.error ?? "Ya hay una generación en curso.",
      conflict: true,
    };
  }
  if (!res.ok) {
    return {
      ok: false,
      error: data.error ?? "No se pudo reintentar la generación",
    };
  }
  if (data.ok) return { ok: true };
  return { ok: false, error: "Respuesta inv?lida del servidor" };
}

export async function postAgentSystemPromptRegenerate(
  agentId: string,
): Promise<{ ok: true } | { ok: false; error: string; conflict?: boolean }> {
  const res = await fetch(
    `/api/agents/${encodeURIComponent(agentId)}/system-prompt/regenerate`,
    { method: "POST", credentials: "include" },
  );
  let data: { ok?: boolean; error?: string } = {};
  try {
    data = (await res.json()) as typeof data;
  } catch {
    /* empty */
  }
  if (res.status === 409) {
    return {
      ok: false,
      error: data.error ?? "Ya hay una generación en curso.",
      conflict: true,
    };
  }
  if (!res.ok) {
    return {
      ok: false,
      error: data.error ?? "No se pudo reintentar la generación",
    };
  }
  if (data.ok) return { ok: true };
  return { ok: false, error: "Respuesta inv?lida del servidor" };
}

export async function fetchDraftPendingTasks(
  draftId: string,
): Promise<{ tasks: DraftPendingTask[] } | null> {
  const res = await fetch(
    `/api/agents/drafts/${encodeURIComponent(draftId)}/tasks`,
    {
      credentials: "include",
      cache: "no-store",
    },
  );
  if (!res.ok) return null;
  try {
    return (await res.json()) as { tasks: DraftPendingTask[] };
  } catch {
    return null;
  }
}

export async function createDraftPendingTask(
  draftId: string,
  body: { title: string; context?: string; postponed_from?: string },
): Promise<{ ok: true; task: DraftPendingTask } | { ok: false; error: string }> {
  const res = await fetch(
    `/api/agents/drafts/${encodeURIComponent(draftId)}/tasks`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(body),
    },
  );
  let data: { task?: DraftPendingTask; error?: string } = {};
  try {
    data = (await res.json()) as typeof data;
  } catch {
    /* empty */
  }
  if (!res.ok) {
    return { ok: false, error: data.error ?? "No se pudo crear la tarea" };
  }
  if (!data.task) return { ok: false, error: "Respuesta inv?lida del servidor" };
  return { ok: true, task: data.task };
}

export async function patchDraftPendingTask(
  draftId: string,
  taskId: string,
  body: { status?: "pending" | "completed"; title?: string; context?: string },
): Promise<{ ok: true; task: DraftPendingTask } | { ok: false; error: string }> {
  const res = await fetch(
    `/api/agents/drafts/${encodeURIComponent(draftId)}/tasks/${encodeURIComponent(taskId)}`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(body),
    },
  );
  let data: { task?: DraftPendingTask; error?: string } = {};
  try {
    data = (await res.json()) as typeof data;
  } catch {
    /* empty */
  }
  if (!res.ok) {
    return { ok: false, error: data.error ?? "No se pudo actualizar la tarea" };
  }
  if (!data.task) return { ok: false, error: "Respuesta inv?lida del servidor" };
  return { ok: true, task: data.task };
}

export async function fetchDraftTechnicalProperties(
  draftId: string,
): Promise<Record<string, Record<string, unknown>> | null> {
  const res = await fetch(
    `/api/agents/drafts/${encodeURIComponent(draftId)}/technical-properties`,
    {
      credentials: "include",
      cache: "no-store",
    },
  );
  if (!res.ok) return null;
  try {
    const data = (await res.json()) as { properties?: Record<string, Record<string, unknown>> };
    return data.properties ?? null;
  } catch {
    return null;
  }
}

export async function patchDraftTechnicalPropertyDocument(
  draftId: string,
  documentId: string,
  body: Record<string, unknown>,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const res = await fetch(
    `/api/agents/drafts/${encodeURIComponent(draftId)}/properties/${encodeURIComponent(documentId)}`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(body),
    },
  );
  let data: { error?: string } = {};
  try {
    data = (await res.json()) as typeof data;
  } catch {
    /* empty */
  }
  if (!res.ok) {
    return { ok: false, error: data.error ?? "No se pudo guardar la propiedad" };
  }
  return { ok: true };
}

export async function fetchDraftPropertyItems(
  draftId: string,
  documentId: "personality" | "business",
): Promise<{ items: DraftPropertyItem[] } | null> {
  const res = await fetch(
    `/api/agents/drafts/${encodeURIComponent(draftId)}/properties/${encodeURIComponent(documentId)}/items`,
    {
      credentials: "include",
      cache: "no-store",
    },
  );
  if (!res.ok) return null;
  try {
    return (await res.json()) as { items: DraftPropertyItem[] };
  } catch {
    return null;
  }
}

export async function createDraftPropertyItem(
  draftId: string,
  documentId: "personality" | "business",
  body: { title: string; content: string },
): Promise<{ ok: true; item: DraftPropertyItem } | { ok: false; error: string }> {
  const res = await fetch(
    `/api/agents/drafts/${encodeURIComponent(draftId)}/properties/${encodeURIComponent(documentId)}/items`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(body),
    },
  );
  let data: { item?: DraftPropertyItem; error?: string } = {};
  try {
    data = (await res.json()) as typeof data;
  } catch {
    /* empty */
  }
  if (!res.ok) {
    return { ok: false, error: data.error ?? "No se pudo crear el item" };
  }
  if (!data.item) return { ok: false, error: "Respuesta inv?lida del servidor" };
  return { ok: true, item: data.item };
}

export async function patchDraftPropertyItem(
  draftId: string,
  documentId: "personality" | "business",
  itemId: string,
  body: { title?: string; content?: string },
): Promise<{ ok: true; item: DraftPropertyItem } | { ok: false; error: string }> {
  const res = await fetch(
    `/api/agents/drafts/${encodeURIComponent(draftId)}/properties/${encodeURIComponent(documentId)}/items/${encodeURIComponent(itemId)}`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(body),
    },
  );
  let data: { item?: DraftPropertyItem; error?: string } = {};
  try {
    data = (await res.json()) as typeof data;
  } catch {
    /* empty */
  }
  if (!res.ok) return { ok: false, error: data.error ?? "No se pudo actualizar el item" };
  if (!data.item) return { ok: false, error: "Respuesta inv?lida del servidor" };
  return { ok: true, item: data.item };
}

export async function deleteDraftPropertyItem(
  draftId: string,
  documentId: "personality" | "business",
  itemId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const res = await fetch(
    `/api/agents/drafts/${encodeURIComponent(draftId)}/properties/${encodeURIComponent(documentId)}/items/${encodeURIComponent(itemId)}`,
    {
      method: "DELETE",
      credentials: "include",
    },
  );
  let data: { ok?: boolean; error?: string } = {};
  try {
    data = (await res.json()) as typeof data;
  } catch {
    /* empty */
  }
  if (!res.ok) return { ok: false, error: data.error ?? "No se pudo eliminar el item" };
  return { ok: true };
}

/** Detalle del agente (GET /api/agents/:id). */
export async function fetchAgentById(agentId: string): Promise<Agent | null> {
  const res = await fetch(`/api/agents/${encodeURIComponent(agentId)}`, {
    credentials: "include",
    cache: "no-store",
  });
  if (!res.ok) return null;
  try {
    const j = (await res.json()) as Record<string, unknown>;
    return {
      ...j,
      id: typeof j.id === "string" ? j.id : agentId,
      name: typeof j.name === "string" ? j.name : String(j.name ?? ""),
      inCommercial: Boolean(j.in_commercial ?? j.inCommercial),
      inProduction: Boolean(j.in_production ?? j.inProduction),
      primarySource:
        (j.primary_source ?? j.primarySource) === "production"
          ? "production"
          : (j.primary_source ?? j.primarySource) === "commercial"
            ? "commercial"
            : undefined,
    } as Agent;
  } catch {
    return null;
  }
}

/** Actualiza campos del documento raíz del agente (PATCH /api/agents/:id). */
export async function patchAgent(
  agentId: string,
  body: { version?: string },
): Promise<{ ok: true } | { ok: false; error: string }> {
  const res = await fetch(`/api/agents/${encodeURIComponent(agentId)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(body),
  });
  let data: { ok?: boolean; success?: boolean; error?: string } = {};
  try {
    data = (await res.json()) as typeof data;
  } catch {
    /* empty */
  }
  if (!res.ok) {
    return {
      ok: false,
      error: data.error ?? "No se pudo actualizar el agente",
    };
  }
  if (data.ok || data.success) return { ok: true };
  return { ok: false, error: "Respuesta inválida del servidor" };
}

/** Producción → testing: setea datos de prod en testing/data/... (merge). */
export async function postAgentSyncFromProduction(
  agentId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const res = await fetch(
    `/api/agents/${encodeURIComponent(agentId)}/sync-from-production`,
    { method: "POST", credentials: "include" },
  );
  let data: { ok?: boolean; error?: string } = {};
  try {
    data = (await res.json()) as typeof data;
  } catch {
    /* empty */
  }
  if (!res.ok) {
    return {
      ok: false,
      error: data.error ?? "No se pudo sincronizar desde producción",
    };
  }
  if (data.ok) return { ok: true };
  return { ok: false, error: "Respuesta inválida del servidor" };
}

/** Testing → producción: promueve campos individuales seleccionados. */
export async function postPromoteToProduction(
  agentId: string,
  body: { fields: Array<{ collection: string; documentId: string; fieldKey: string; value: unknown }>; confirmation_agent_name: string },
): Promise<{ ok: true } | { ok: false; error: string }> {
  const res = await fetch(
    `/api/agents/${encodeURIComponent(agentId)}/promote-to-production`,
    {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
  );
  let data: { ok?: boolean; error?: string } = {};
  try {
    data = (await res.json()) as typeof data;
  } catch {
    /* empty */
  }
  if (!res.ok) {
    return {
      ok: false,
      error: data.error ?? "No se pudo promover a producción",
    };
  }
  if (data.ok) return { ok: true };
  return { ok: false, error: "Respuesta inválida del servidor" };
}

/** Obtiene el diff granular entre testing y producción. */
export async function fetchTestingDiff(
  agentId: string,
): Promise<{ diff: Array<{ collection: string; documentId: string; fieldKey: string; testingValue: unknown; productionValue: unknown }> } | null> {
  const res = await fetch(
    `/api/agents/${encodeURIComponent(agentId)}/testing/diff`,
    { credentials: "include", cache: "no-store" },
  );
  if (!res.ok) return null;
  try {
    return (await res.json()) as { diff: Array<{ collection: string; documentId: string; fieldKey: string; testingValue: unknown; productionValue: unknown }> };
  } catch {
    return null;
  }
}

/** Proxy de simulaci?n (POST /api/agents-testing/simulate). */
export async function postAgentsTestingSimulate(
  body: Record<string, unknown>,
  signal?: AbortSignal,
): Promise<Response> {
  return fetch("/api/agents-testing/simulate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(body),
    signal,
  });
}

export async function fetchImplementationTasks(
  agentId: string,
): Promise<{ tasks: ImplementationTask[] } | null> {
  const res = await fetch(
    `/api/agents/${encodeURIComponent(agentId)}/implementation-tasks`,
    {
      credentials: "include",
      cache: "no-store",
    },
  );
  if (!res.ok) return null;
  try {
    return (await res.json()) as { tasks: ImplementationTask[] };
  } catch {
    return null;
  }
}

export async function postAgentBuilderChat(body: {
  messages: BuilderChatMessage[];
  draftState: Record<string, unknown>;
  pendingTasksCount?: number;
  draftId?: string;
}): Promise<
  | {
      ok: true;
      assistantMessage: string;
      draftPatch: BuilderChatDraftPatch;
      ui?: BuilderChatUI;
      appliedPropertyPatches?: Array<{
        documentId: string;
        fieldKey: string;
        value: unknown;
      }>;
    }
  | { ok: false; error: string }
> {
  const res = await fetch("/api/agents/builder/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(body),
  });
  let data: {
    assistantMessage?: string;
    draftPatch?: BuilderChatDraftPatch;
    ui?: BuilderChatUI;
    error?: string;
    appliedPropertyPatches?: Array<{
      documentId: string;
      fieldKey: string;
      value: unknown;
    }>;
  } = {};
  try {
    data = (await res.json()) as typeof data;
  } catch {
    /* empty */
  }
  if (!res.ok) {
    return { ok: false, error: data.error ?? "No se pudo consultar el chat del builder" };
  }
  if (!data.assistantMessage) {
    return { ok: false, error: "Respuesta inv?lida del servidor" };
  }
  return {
    ok: true,
    assistantMessage: data.assistantMessage,
    draftPatch: data.draftPatch ?? {},
    ...(data.ui ? { ui: data.ui } : {}),
    ...(data.appliedPropertyPatches?.length
      ? { appliedPropertyPatches: data.appliedPropertyPatches }
      : {}),
  };
}

export type RecommendToolsPayload = {
  business_name?: string;
  owner_name?: string;
  industry?: string;
  custom_industry?: string;
  description?: string;
  target_audience?: string;
  agent_description?: string;
  escalation_rules?: string;
  country?: string;
  business_timezone?: string;
  agent_name?: string;
  agent_personality?: string;
  response_language?: string;
  business_hours?: string;
  require_auth?: boolean;
  /** Texto consolidado desde el paso Flujos (pregunta → respuesta). */
  operational_context?: string;
  tools_context_data_actions?: string;
  tools_context_commerce_reservations?: string;
  tools_context_integrations?: string;
};

export type FlowQuestionsPayload = {
  business_name?: string;
  owner_name?: string;
  industry?: string;
  custom_industry?: string;
  description?: string;
  target_audience?: string;
  agent_description?: string;
  escalation_rules?: string;
  country?: string;
  business_timezone?: string;
  agent_name?: string;
  agent_personality?: string;
  response_language?: string;
  business_hours?: string;
  require_auth?: boolean;
};

export type FlowQuestionItem = {
  field: string;
  label: string;
  type: "text" | "textarea" | "select";
  placeholder?: string;
  options?: string[];
  suggestions?: string[];
  suggestion_mode?: "single" | "multi";
  required?: boolean;
};

export async function fetchAgentFlowQuestions(
  payload: FlowQuestionsPayload,
): Promise<
  | { ok: true; questions: FlowQuestionItem[] }
  | { ok: false; error: string }
> {
  try {
    const res = await fetch("/api/agents/builder/flow-questions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(payload),
    });
    const data = (await res.json()) as {
      error?: string;
      questions?: FlowQuestionItem[];
    };
    if (!res.ok) {
      return {
        ok: false,
        error: data.error ?? "No se pudieron generar las preguntas",
      };
    }
    if (!Array.isArray(data.questions)) {
      return { ok: false, error: "Respuesta inválida del servidor" };
    }
    if (
      data.questions.length === 0 &&
      typeof data.error === "string" &&
      data.error.length > 0
    ) {
      return { ok: false, error: data.error };
    }
    return { ok: true, questions: data.questions };
  } catch (e) {
    return {
      ok: false,
      error:
        e instanceof Error ? e.message : "Error de red al generar preguntas",
    };
  }
}

export type RecommendToolsPerItem = { id: string; reason: string };

export async function recommendAgentTools(
  payload: RecommendToolsPayload,
): Promise<
  | {
      ok: true;
      toolIds: string[];
      rationale: string | null;
      perTool: RecommendToolsPerItem[];
      warnings: string[];
    }
  | { ok: false; error: string }
> {
  try {
    const res = await fetch("/api/agents/builder/recommend-tools", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(payload),
    });
    const data = (await res.json()) as {
      error?: string;
      toolIds?: string[];
      rationale?: string | null;
      perTool?: RecommendToolsPerItem[];
      warnings?: string[];
    };
    if (!res.ok) {
      return {
        ok: false,
        error: data.error ?? "No se pudo obtener la recomendación de herramientas",
      };
    }
    if (!Array.isArray(data.toolIds)) {
      return { ok: false, error: "Respuesta inválida del servidor" };
    }
    return {
      ok: true,
      toolIds: data.toolIds,
      rationale: data.rationale ?? null,
      perTool: Array.isArray(data.perTool) ? data.perTool : [],
      warnings: Array.isArray(data.warnings) ? data.warnings : [],
    };
  } catch (e) {
    return {
      ok: false,
      error:
        e instanceof Error ? e.message : "Error de red al recomendar herramientas",
    };
  }
}

export interface DynamicQuestion {
  field: string;
  label: string;
  type: "text" | "textarea" | "select";
  required: boolean;
  section: "business" | "personality";
  options?: string[];
  placeholder?: string;
  aiReason?: string;
}

export async function analyzeAgentWithAI(
  currentSection: string,
  draftData: Record<string, unknown>
): Promise<DynamicQuestion[] | null> {
  const prompt = `
Eres un asistente que ayuda a configurar agentes de WhatsApp.
Analiza esta configuración y genera hasta 5 preguntas adicionales si son necesarias para completar la información del agente.

Datos actuales del agente:
- Sección actual: ${currentSection}
- Industria: ${draftData.industry || "no especificada"}
- Descripción del negocio: ${draftData.description || "no especificada"}
- Audiencia objetivo: ${draftData.target_audience || "no especificada"}
- Rol del agente: ${draftData.agent_description || "no especificado"}
- Herramientas seleccionadas: ${(draftData.selected_tools as string[])?.join(", ") || "ninguna"}
- Nombre del agente: ${draftData.agent_name || "no especificado"}
- Personalidad: ${draftData.agent_personality || "no especificada"}

Reglas importantes:
1. Solo genera preguntas para las secciones: business, personality
2. Si la información está completa y no faltan datos importantes → retorna array vacío []
3. Las preguntas deben ser accionables, específicas y relevantes para crear un agente efectivo
4. Cada pregunta debe indicar en qué sección pertenece (business o personality)
5. Incluye un campo "aiReason" explicando brevemente por qué es necesaria esa pregunta
6. Usa tipo "text" para respuestas cortas, "textarea" para explicaciones, "select" si hay opciones predefinidas
7. Si usas "select", incluye un array "options" con las opciones disponibles

Ejemplo de respuesta:
[
  {"field": "business_size", "label": "¿Cuál es el tamaño de tu negocio?", "type": "select", "required": true, "section": "business", "options": ["Pequeño (1-10)", "Mediano (11-50)", "Grande (51+)", "No especificado"], "aiReason": "El tamaño del negocio ayuda a calibrar la complejidad de las interacciones"},
  {"field": "main_channels", "label": "¿Por qué canales principales interactúas con tus clientes?", "type": "textarea", "required": false, "section": "business", "placeholder": "WhatsApp, Instagram, Web...", "aiReason": "Conocer los canales ayuda a integrar las herramientas correctas"}
]

Si no necesitas más preguntas, retorna un array vacío: []
`;

  // Prepare draft state with required schema fields
  const draftState = {
    agent_name: String(draftData.agent_name || ""),
    agent_personality: String(draftData.agent_personality || ""),
    response_language: String(draftData.response_language || "Spanish"),
    business_name: String(draftData.business_name || ""),
    owner_name: String(draftData.owner_name || ""),
    industry: String(draftData.industry || ""),
    description: String(draftData.description || ""),
    agent_description: String(draftData.agent_description || ""),
    target_audience: String(draftData.target_audience || ""),
    escalation_rules: String(draftData.escalation_rules || ""),
    country: String(draftData.country || ""),
    use_emojis: String(draftData.use_emojis || ""),
    country_accent: String(draftData.country_accent || ""),
    agent_signature: String(draftData.agent_signature || ""),
    business_timezone: String(draftData.business_timezone || ""),
    selected_tools: Array.isArray(draftData.selected_tools) ? draftData.selected_tools : [],
    creation_step: "personality",
  };

  try {
    const res = await fetch("/api/agents/builder/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({
        messages: [{ role: "user", text: prompt }],
        draftState,
        pendingTasksCount: 0,
      }),
    });

    if (!res.ok) {
      console.error("AI analysis failed:", res.status, await res.text());
      return null;
    }

    const data = await res.json();
    
    if (!data.assistantMessage) {
      return null;
    }

    try {
      const jsonMatch = data.assistantMessage.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]) as Record<string, unknown>[];
        return parsed
          .filter((q) => q && q.field && q.label)
          .map((q) => {
            const sec = String(q.section ?? "");
            const section =
              sec === "basics" ? "business" : sec === "personality" ? "personality" : "business";
            return { ...q, section } as DynamicQuestion;
          });
      }
    } catch (parseError) {
      console.error("Failed to parse AI response:", parseError);
    }
    
    return null;
  } catch (error) {
    console.error("Error calling AI analysis:", error);
    return null;
  }
}

export async function createImplementationTask(
  agentId: string,
  body: {
    title: string;
    description?: string;
    dueDate?: string | null;
    assigneeEmails?: string[];
    attachments?: ImplementationTaskAttachment[];
  },
): Promise<
  { ok: true; task: ImplementationTask } | { ok: false; error: string }
> {
  const res = await fetch(
    `/api/agents/${encodeURIComponent(agentId)}/implementation-tasks`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(body),
    },
  );
  let data: { task?: ImplementationTask; error?: string } = {};
  try {
    data = (await res.json()) as typeof data;
  } catch {
    /* empty */
  }
  if (!res.ok) {
    return {
      ok: false,
      error: data.error ?? "No se pudo crear la tarea",
    };
  }
  if (!data.task) return { ok: false, error: "Respuesta inv?lida del servidor" };
  return { ok: true, task: data.task };
}

export async function patchImplementationTask(
  agentId: string,
  taskId: string,
  body: {
    status?: ImplementationTaskStatus;
    dueDate?: string | null;
    assigneeEmails?: string[];
    attachments?: ImplementationTaskAttachment[];
  },
): Promise<
  { ok: true; task: ImplementationTask } | { ok: false; error: string }
> {
  const res = await fetch(
    `/api/agents/${encodeURIComponent(agentId)}/implementation-tasks/${encodeURIComponent(taskId)}`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(body),
    },
  );
  let data: { task?: ImplementationTask; error?: string } = {};
  try {
    data = (await res.json()) as typeof data;
  } catch {
    /* empty */
  }
  if (!res.ok) {
    return {
      ok: false,
      error: data.error ?? "No se pudo actualizar la tarea",
    };
  }
  if (!data.task) return { ok: false, error: "Respuesta inválida del servidor" };
  return { ok: true, task: data.task };
}

export async function assignAgentToUser(
  agentId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const res = await fetch(
    `/api/agents/${encodeURIComponent(agentId)}/assign-to-user`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
    },
  );
  let data: { ok?: boolean; error?: string } = {};
  try {
    data = (await res.json()) as typeof data;
  } catch {
    /* empty */
  }
  if (!res.ok) {
    return { ok: false, error: data.error ?? "No se pudo asignar el agente" };
  }
  if (data.ok) return { ok: true };
  return { ok: false, error: "Respuesta inválida del servidor" };
}

export async function fetchAgentBilling(
  agentId: string,
): Promise<{ billing: AgentBilling; payments: PaymentRecord[] } | null> {
  const res = await fetch(
    `/api/agents/${encodeURIComponent(agentId)}/billing`,
    {
      credentials: "include",
      cache: "no-store",
    },
  );
  if (!res.ok) return null;
  try {
    return (await res.json()) as { billing: AgentBilling; payments: PaymentRecord[] };
  } catch {
    return null;
  }
}

export async function patchAgentBillingConfig(
  agentId: string,
  body: {
    domiciliated?: boolean;
    defaultPaymentAmount?: number;
    paymentDueDate?: string | null;
  },
): Promise<{ ok: true } | { ok: false; error: string }> {
  const res = await fetch(
    `/api/agents/${encodeURIComponent(agentId)}/billing`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(body),
    },
  );
  let data: { ok?: boolean; error?: string } = {};
  try {
    data = (await res.json()) as typeof data;
  } catch {
    /* empty */
  }
  if (!res.ok) {
    return { ok: false, error: data.error ?? "No se pudo actualizar la configuración" };
  }
  if (data.ok) return { ok: true };
  return { ok: false, error: "Respuesta inválida del servidor" };
}

export async function createPaymentRecord(
  agentId: string,
  body: {
    amount: number;
    period: string;
    paymentMethod: string;
    reference?: string;
    notes?: string;
    receiptUrl?: string;
  },
): Promise<{ ok: true } | { ok: false; error: string }> {
  const res = await fetch(
    `/api/agents/${encodeURIComponent(agentId)}/billing/payments`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(body),
    },
  );
  let data: { ok?: boolean; error?: string } = {};
  try {
    data = (await res.json()) as typeof data;
  } catch {
    /* empty */
  }
  if (!res.ok) {
    return { ok: false, error: data.error ?? "No se pudo registrar el pago" };
  }
  if (data.ok) return { ok: true };
  return { ok: false, error: "Respuesta inválida del servidor" };
}

export async function deletePaymentRecord(
  agentId: string,
  paymentId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const res = await fetch(
    `/api/agents/${encodeURIComponent(agentId)}/billing/payments/${encodeURIComponent(paymentId)}`,
    {
      method: "DELETE",
      credentials: "include",
    },
  );
  let data: { ok?: boolean; error?: string } = {};
  try {
    data = (await res.json()) as typeof data;
  } catch {
    /* empty */
  }
  if (!res.ok) {
    return { ok: false, error: data.error ?? "No se pudo eliminar el pago" };
  }
  if (data.ok) return { ok: true };
  return { ok: false, error: "Respuesta inválida del servidor" };
}

export async function uploadAgentFile(
  agentId: string,
  taskId: string,
  file: File,
): Promise<
  | { ok: true; file: { name: string; url: string; uploadedAt: string; type: string; size: number } }
  | { ok: false; error: string }
> {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("taskId", taskId);

  const res = await fetch(
    `/api/agents/${encodeURIComponent(agentId)}/files/upload`,
    {
      method: "POST",
      credentials: "include",
      body: formData,
    },
  );
  let data: {
    file?: { name: string; url: string; uploadedAt: string; type: string; size: number };
    error?: string;
  } = {};
  try {
    data = (await res.json()) as typeof data;
  } catch {
    /* empty */
  }
  if (!res.ok) {
    return { ok: false, error: data.error ?? "No se pudo subir el archivo" };
  }
  if (!data.file) return { ok: false, error: "Respuesta inválida del servidor" };
  return { ok: true, file: data.file };
}

export interface TestingDataCollection {
  collections: string[];
}

export interface TestingDataDocument {
  id: string;
  data: Record<string, unknown>;
}

export interface TestingDataDocuments {
  documents: TestingDataDocument[];
}

export async function fetchTestingDataCollections(
  agentId: string,
): Promise<TestingDataCollection | null> {
  const res = await fetch(
    `/api/agent_configurations/${encodeURIComponent(agentId)}/testing/data`,
    { credentials: "include" },
  );
  if (!res.ok) return null;
  return res.json();
}

export async function fetchSubcollections(
  agentId: string,
  path: string,
): Promise<TestingDataCollection | null> {
  const res = await fetch(
    `/api/agent_configurations/${encodeURIComponent(agentId)}/testing/data/${encodeURIComponent(path)}`,
    { credentials: "include" },
  );
  if (!res.ok) return null;
  return res.json();
}

export async function fetchTestingDataDocuments(
  agentId: string,
  collection: string,
): Promise<TestingDataDocuments | null> {
  const res = await fetch(
    `/api/agent_configurations/${encodeURIComponent(agentId)}/testing/data/${encodeURIComponent(collection)}`,
    { credentials: "include" },
  );
  if (!res.ok) return null;
  return res.json();
}

export async function fetchTestingDataDocument(
  agentId: string,
  collection: string,
  docId: string,
): Promise<TestingDataDocument | null> {
  const res = await fetch(
    `/api/agent_configurations/${encodeURIComponent(agentId)}/testing/data/${encodeURIComponent(collection)}/${encodeURIComponent(docId)}`,
    { credentials: "include" },
  );
  if (!res.ok) return null;
  return res.json();
}

export interface CreateTestingDataDocumentBody {
  data: Record<string, unknown>;
  merge?: boolean;
}

export async function createTestingDataDocument(
  agentId: string,
  collection: string,
  body: CreateTestingDataDocumentBody,
): Promise<TestingDataDocument | null> {
  const res = await fetch(
    `/api/agent_configurations/${encodeURIComponent(agentId)}/testing/data/${encodeURIComponent(collection)}`,
    {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
  );
  if (!res.ok) return null;
  return res.json();
}

export async function updateTestingDataDocument(
  agentId: string,
  collection: string,
  docId: string,
  body: CreateTestingDataDocumentBody,
): Promise<TestingDataDocument | null> {
  const res = await fetch(
    `/api/agent_configurations/${encodeURIComponent(agentId)}/testing/data/${encodeURIComponent(collection)}/${encodeURIComponent(docId)}`,
    {
      method: "PATCH",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
  );
  if (!res.ok) return null;
  return res.json();
}

export async function deleteTestingDataDocument(
  agentId: string,
  collection: string,
  docId: string,
): Promise<boolean> {
  const res = await fetch(
    `/api/agent_configurations/${encodeURIComponent(agentId)}/testing/data/${encodeURIComponent(collection)}/${encodeURIComponent(docId)}`,
    { method: "DELETE", credentials: "include" },
  );
  return res.ok;
}
