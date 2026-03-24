import type { Agent } from "@/lib/agent";
import { toAgentWithOperations, type AgentWithOperations } from "@/lib/agent";
import type {
  AgentDraftClient,
  AgentDraftPatchBody,
  DraftPendingTask,
  AgentGrowerRow,
  ImplementationTask,
  ImplementationTaskStatus,
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
  ImplementationTask,
  ImplementationTaskStatus,
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
export const AGENTS_PAGE_SIZE = 15;

function agentsInfoUrl(
  light: boolean,
  paginated: boolean,
  pageSize: number,
  cursor?: string,
): string {
  const params = new URLSearchParams();
  if (light) params.set("light", "1");
  if (paginated) {
    params.set("limit", String(Math.max(1, Math.min(100, pageSize))));
    if (cursor) params.set("cursor", cursor);
  }
  return `/api/agents/info?${params.toString()}`;
}

export async function fetchAgentsPage(
  options: {
    light?: boolean;
    paginated?: boolean;
    pageSize?: number;
    cursor?: string;
  } = {},
): Promise<{ agents: AgentWithOperations[]; nextCursor: string | null } | null> {
  const {
    light = true,
    paginated = true,
    pageSize = AGENTS_PAGE_SIZE,
    cursor,
  } = options;
  const url = agentsInfoUrl(light, paginated, pageSize, cursor);
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
  | { ok: true; id: string; draft: AgentDraftClient }
  | { ok: false; error: string }
> {
  const res = await fetch(
    `/api/agents/drafts/${encodeURIComponent(draftId)}`,
    {
      credentials: "include",
      cache: "no-store",
    },
  );
  let data: { id?: string; draft?: AgentDraftClient; error?: string } = {};
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
    return { ok: true, id: data.id, draft: data.draft };
  }
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
    return (await res.json()) as Agent;
  } catch {
    return null;
  }
}

/** Proxy de simulaci?n (POST /api/agents-testing/simulate). */
export async function postAgentsTestingSimulate(
  body: Record<string, unknown>,
): Promise<Response> {
  return fetch("/api/agents-testing/simulate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(body),
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

export async function createImplementationTask(
  agentId: string,
  body: {
    title: string;
    description?: string;
    dueDate?: string | null;
    assigneeEmails?: string[];
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
  if (!data.task) return { ok: false, error: "Respuesta inv?lida del servidor" };
  return { ok: true, task: data.task };
}
