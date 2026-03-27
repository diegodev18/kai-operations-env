import type { Context } from "hono";
import type { DocumentReference, Firestore } from "firebase-admin/firestore";
import { z } from "zod";

import {
  getBuilderAllowlistEntry,
  isBuilderTechnicalDocumentId,
  normalizeAndValidateBuilderPropertyValue,
} from "@/constants/builder-suggested-properties";
import {
  PROPERTY_DOC_IDS,
  serverTimestampField,
  syncAiFieldsToDraftRoot,
  writeDefaultAgentProperties,
} from "@/constants/agentPropertyDefaults";
import { getFirestore, FieldValue } from "@/lib/firestore";
import logger, { formatError } from "@/lib/logger";
import {
  runSystemPromptGenerationJob,
  setSystemPromptGeneratingFlags,
} from "@/services/system-prompt-generation-job";
import type { AgentsInfoAuthContext } from "@/types/agents";
import {
  extractFirestoreIndexUrl,
  firestoreFailureHint,
  isFirebaseConfigError,
} from "@/utils/firestore/errors";
import { isOperationsAdmin } from "@/utils/operations-access";

const AGENT_DRAFTS = "agent_drafts";
const TOOLS_CATALOG = "toolsCatalog";
const PENDING_TASKS = "pending_tasks";
const DRAFT_PROPERTY_DOC_IDS = new Set(["personality", "business"]);

const postDraftBodySchema = z.object({
  agent_name: z.string().trim().min(1, "agent_name es obligatorio"),
  agent_personality: z
    .string()
    .trim()
    .min(1, "agent_personality es obligatorio"),
});

const patchPersonalitySchema = z.object({
  step: z.literal("personality"),
  agent_name: z.string().trim().min(1),
  agent_personality: z.string().trim().min(1),
});

const patchBusinessSchema = z.object({
  step: z.literal("business"),
  business_name: z.string().trim().min(1),
  owner_name: z.string().trim().min(1),
  industry: z.string().trim().min(1),
  description: z.string().trim().min(1),
  agent_description: z.string().trim().min(1),
  target_audience: z.string().trim().min(1),
  escalation_rules: z.string().trim().min(1),
  country: z.string().trim().optional(),
  phone_number_id: z.string().trim().optional(),
  whatsapp_token: z.string().trim().optional(),
});

const patchToolsSchema = z.object({
  step: z.literal("tools"),
  selected_tools: z.array(z.string().trim().min(1)).min(1),
});

const patchCompleteSchema = z.object({
  step: z.literal("complete"),
});

const createDraftPendingTaskSchema = z.object({
  title: z.string().trim().min(1, "title es obligatorio"),
  context: z.string().trim().optional(),
  postponed_from: z.string().trim().optional(),
});

const patchDraftPendingTaskSchema = z.object({
  status: z.enum(["pending", "completed"]).optional(),
  title: z.string().trim().min(1).optional(),
  context: z.string().trim().optional(),
});

const createDraftPropertyItemSchema = z.object({
  title: z.string().trim().min(1, "title es obligatorio"),
  content: z.string().trim().min(1, "content es obligatorio"),
});

const patchDraftPropertyItemSchema = z
  .object({
    title: z.string().trim().min(1).optional(),
    content: z.string().trim().min(1).optional(),
  })
  .refine((body) => Object.keys(body).length > 0, {
    message: "No hay cambios para aplicar",
  });

const patchDraftBodySchema = z.discriminatedUnion("step", [
  patchPersonalitySchema,
  patchBusinessSchema,
  patchToolsSchema,
  patchCompleteSchema,
]);

function canAccessDraft(
  authCtx: AgentsInfoAuthContext,
  draftData: Record<string, unknown>,
): boolean {
  if (isOperationsAdmin(authCtx.userRole)) return true;
  const hasLegacy =
    draftData.creator_email == null &&
    draftData.creator_user_id == null;
  if (hasLegacy) return false;
  const email = authCtx.userEmail?.toLowerCase().trim();
  const uid = authCtx.userId;
  const ce =
    typeof draftData.creator_email === "string"
      ? draftData.creator_email.toLowerCase().trim()
      : "";
  const cid =
    typeof draftData.creator_user_id === "string"
      ? draftData.creator_user_id
      : "";
  if (uid && cid && uid === cid) return true;
  if (email && ce && email === ce) return true;
  return false;
}

function requireEmailForGrower(
  c: Context,
  authCtx: AgentsInfoAuthContext,
): Response | null {
  const email = authCtx.userEmail?.trim().toLowerCase() ?? "";
  if (!email.includes("@")) {
    return c.json(
      {
        error:
          "Tu cuenta debe tener un email para crear un agente y asignarte como grower.",
      },
      400,
    );
  }
  return null;
}

function handleFirestoreError(c: Context, error: unknown, logPrefix: string) {
  if (isFirebaseConfigError(error)) {
    return c.json(
      {
        error:
          "Firebase no configurado. Define credenciales de servicio (env o tokens).",
      },
      503,
    );
  }
  const hint = firestoreFailureHint(error);
  const msg = error instanceof Error ? error.message : String(error);
  const createIndexUrl = extractFirestoreIndexUrl(msg);
  console.error(`${logPrefix} Firestore:`, msg);
  if (hint) {
    return c.json(
      { error: hint, ...(createIndexUrl ? { createIndexUrl } : {}) },
      503,
    );
  }
  return c.json({ error: "Error al acceder a Firestore." }, 500);
}

export async function postAgentDraft(
  c: Context,
  authCtx: AgentsInfoAuthContext,
) {
  const emailDenied = requireEmailForGrower(c, authCtx);
  if (emailDenied) return emailDenied;

  let raw: unknown;
  try {
    raw = await c.req.json();
  } catch {
    return c.json({ error: "JSON inválido" }, 400);
  }

  const parsed = postDraftBodySchema.safeParse(raw);
  if (!parsed.success) {
    const msg = parsed.error.issues.map((i) => i.message).join("; ");
    return c.json({ error: msg }, 400);
  }

  const { agent_name, agent_personality } = parsed.data;

  try {
    const db = getFirestore();
    const draftRef = db.collection(AGENT_DRAFTS).doc();
    const ts = serverTimestampField();
    const creatorEmail = authCtx.userEmail!.trim().toLowerCase();
    const nameFromProfile = authCtx.userName?.trim();
    const growerName =
      nameFromProfile && nameFromProfile.length > 0
        ? nameFromProfile
        : creatorEmail;

    const draftPayload: Record<string, unknown> = {
      agent_name,
      agent_personality,
      creation_step: "personality",
      selected_tools: [],
      creator_user_id: authCtx.userId ?? null,
      creator_email: creatorEmail,
      mcp_configuration: {
        agent_personalization: {
          agent_name,
          agent_personality,
        },
        system_prompt: "",
        system_prompt_generation_status: "idle",
      },
      created_at: ts,
      updated_at: ts,
    };

    const batch = db.batch();
    batch.set(draftRef, draftPayload);
    batch.set(draftRef.collection("growers").doc(creatorEmail), {
      email: creatorEmail,
      name: growerName,
    });
    await batch.commit();

    return c.json({
      id: draftRef.id,
      creation_step: "personality",
      agent_name,
      agent_personality,
    });
  } catch (error) {
    const r = handleFirestoreError(c, error, "[agents/drafts POST]");
    return r ?? c.json({ error: "Error al crear borrador." }, 500);
  }
}

export async function getAgentDraft(
  c: Context,
  authCtx: AgentsInfoAuthContext,
  draftId: string,
) {
  try {
    const db = getFirestore();
    const snap = await db.collection(AGENT_DRAFTS).doc(draftId).get();
    if (!snap.exists) {
      return c.json({ error: "Borrador no encontrado" }, 404);
    }
    const data = snap.data() ?? {};
    if (!canAccessDraft(authCtx, data)) {
      return c.json({ error: "No autorizado" }, 403);
    }
    const genFields = extractMcpGenerationMeta(data);
    return c.json({
      id: snap.id,
      draft: serializeDraftForClient(data),
      ...genFields,
    });
  } catch (error) {
    const r = handleFirestoreError(c, error, "[agents/drafts GET]");
    return r ?? c.json({ error: "Error al leer borrador." }, 500);
  }
}

export async function patchAgentDraft(
  c: Context,
  authCtx: AgentsInfoAuthContext,
  draftId: string,
) {
  let raw: unknown;
  try {
    raw = await c.req.json();
  } catch {
    return c.json({ error: "JSON inválido" }, 400);
  }

  const parsed = patchDraftBodySchema.safeParse(raw);
  if (!parsed.success) {
    const msg = parsed.error.issues.map((i) => i.path.join(".") + ": " + i.message).join("; ");
    return c.json({ error: msg }, 400);
  }

  try {
    const db = getFirestore();
    const draftRef = db.collection(AGENT_DRAFTS).doc(draftId);
    const snap = await draftRef.get();
    if (!snap.exists) {
      return c.json({ error: "Borrador no encontrado" }, 404);
    }
    const existingDraft = snap.data() ?? {};
    if (!canAccessDraft(authCtx, existingDraft)) {
      return c.json({ error: "No autorizado" }, 403);
    }

    const body = parsed.data;
    const ts = serverTimestampField();

    if (body.step === "personality") {
      const prev = snap.data() ?? {};
      const prevMcp =
        prev.mcp_configuration != null && typeof prev.mcp_configuration === "object"
          ? { ...(prev.mcp_configuration as Record<string, unknown>) }
          : {};
      const systemPrompt =
        typeof prevMcp.system_prompt === "string" ? prevMcp.system_prompt : "";
      await draftRef.update({
        agent_name: body.agent_name,
        agent_personality: body.agent_personality,
        mcp_configuration: {
          ...prevMcp,
          system_prompt: systemPrompt,
          agent_personalization: {
            agent_name: body.agent_name,
            agent_personality: body.agent_personality,
          },
        },
        creation_step: "personality",
        updated_at: ts,
      });
      return c.json({
        id: draftId,
        creation_step: "personality",
      });
    }

    if (body.step === "business") {
      const updatePayload: Record<string, unknown> = {
        business_name: body.business_name,
        owner_name: body.owner_name,
        industry: body.industry,
        description: body.description,
        agent_description: body.agent_description,
        target_audience: body.target_audience,
        escalation_rules: body.escalation_rules,
        creation_step: "business",
        updated_at: ts,
      };
      if (body.country !== undefined && body.country !== "") {
        updatePayload.country = body.country;
      }
      if (isOperationsAdmin(authCtx.userRole)) {
        if (body.phone_number_id !== undefined && body.phone_number_id !== "") {
          updatePayload.phone_number_id = body.phone_number_id;
        }
        if (body.whatsapp_token !== undefined && body.whatsapp_token !== "") {
          updatePayload.whatsappToken = body.whatsapp_token;
        }
      }

      await draftRef.update(updatePayload);

      const agentProp = await draftRef.collection("properties").doc("agent").get();
      if (!agentProp.exists) {
        await writeDefaultAgentProperties(draftRef);
        await syncAiFieldsToDraftRoot(draftRef);
      }

      return c.json({ id: draftId, creation_step: "business" });
    }

    if (body.step === "tools") {
      const catalog = await loadActiveToolsCatalogByDocId(db);
      const missing = body.selected_tools.filter((id) => !catalog.has(id));
      if (missing.length > 0) {
        return c.json(
          {
            error: "Hay herramientas no válidas o inactivas en el catálogo.",
            invalid_ids: missing,
          },
          400,
        );
      }

      await replaceDraftTools(draftRef, catalog, body.selected_tools);

      await draftRef.update({
        selected_tools: body.selected_tools,
        creation_step: "tools",
        updated_at: ts,
      });

      return c.json({
        id: draftId,
        creation_step: "tools",
        selected_tools: body.selected_tools,
      });
    }

    // complete — generación async del system prompt (no bloquea la respuesta)
    const genPatch = {
      creation_step: "complete",
      updated_at: ts,
      "mcp_configuration.system_prompt_generation_status": "generating",
      "mcp_configuration.system_prompt_generation_error": null,
      "mcp_configuration.system_prompt_generation_updated_at":
        FieldValue.serverTimestamp(),
    };
    await draftRef.update(genPatch);

    const agentRef = db.collection("agent_configurations").doc(draftId);
    const agentSnap = await agentRef.get();
    if (agentSnap.exists) {
      await agentRef.update({
        "mcp_configuration.system_prompt_generation_status": "generating",
        "mcp_configuration.system_prompt_generation_error": null,
        "mcp_configuration.system_prompt_generation_updated_at":
          FieldValue.serverTimestamp(),
      });
    }

    void runSystemPromptGenerationJob(draftId).catch((e) => {
      logger.error("[agents/drafts] system prompt generation job", formatError(e));
    });

    return c.json({ id: draftId, creation_step: "complete" });
  } catch (error) {
    const r = handleFirestoreError(c, error, "[agents/drafts PATCH]");
    return r ?? c.json({ error: "Error al actualizar borrador." }, 500);
  }
}

function extractMcpGenerationMeta(data: Record<string, unknown>): {
  systemPromptGenerationStatus?: string;
  systemPromptGenerationError?: string | null;
} {
  const mcp = data.mcp_configuration;
  if (mcp == null || typeof mcp !== "object" || Array.isArray(mcp)) {
    return {};
  }
  const o = mcp as Record<string, unknown>;
  const st = o.system_prompt_generation_status;
  const err = o.system_prompt_generation_error;
  const out: {
    systemPromptGenerationStatus?: string;
    systemPromptGenerationError?: string | null;
  } = {};
  if (typeof st === "string" && st.length > 0) {
    out.systemPromptGenerationStatus = st;
  }
  if (typeof err === "string") {
    out.systemPromptGenerationError = err;
  } else if (err == null && "system_prompt_generation_error" in o) {
    out.systemPromptGenerationError = null;
  }
  return out;
}

/**
 * Reintenta la generación multi-fase del system prompt (draft + agent con mismo id).
 */
export async function postDraftSystemPromptRegenerate(
  c: Context,
  authCtx: AgentsInfoAuthContext,
  draftId: string,
) {
  try {
    const auth = await getAuthorizedDraftRef(authCtx, draftId);
    if (!auth.ok) {
      return c.json(
        { error: auth.code === 404 ? "Borrador no encontrado" : "No autorizado" },
        auth.code,
      );
    }
    const db = getFirestore();
    const draftRef = db.collection(AGENT_DRAFTS).doc(draftId);
    const snap = await draftRef.get();
    const data = snap.data() ?? {};
    const mcp = data.mcp_configuration as Record<string, unknown> | undefined;
    const st =
      typeof mcp?.system_prompt_generation_status === "string"
        ? mcp.system_prompt_generation_status
        : "";
    if (st === "generating") {
      return c.json(
        { error: "La generación del system prompt ya está en curso." },
        409,
      );
    }
    await setSystemPromptGeneratingFlags(draftId);
    void runSystemPromptGenerationJob(draftId).catch((e) => {
      logger.error(
        "[agents/drafts] system prompt regenerate job",
        formatError(e),
      );
    });
    return c.json({ ok: true });
  } catch (error) {
    const r = handleFirestoreError(c, error, "[agents/drafts system-prompt POST]");
    return r ?? c.json({ error: "No se pudo reintentar la generación." }, 500);
  }
}

export async function getToolsCatalog(c: Context, _authCtx: AgentsInfoAuthContext) {
  try {
    const db = getFirestore();
    const snap = await db.collection(TOOLS_CATALOG).get();
    const tools = snap.docs
      .map((doc) => {
        const d = doc.data() as Record<string, unknown>;
        const status = typeof d.status === "string" ? d.status : "";
        if (status !== "active") return null;
        return {
          id: doc.id,
          name: typeof d.name === "string" ? d.name : "",
          displayName:
            typeof d.displayName === "string" ? d.displayName : "",
          description:
            typeof d.description === "string" ? d.description : "",
          path: typeof d.path === "string" ? d.path : "",
          type: typeof d.type === "string" ? d.type : "default",
          category: typeof d.category === "string" ? d.category : "",
          parameters:
            d.parameters != null &&
            typeof d.parameters === "object" &&
            !Array.isArray(d.parameters)
              ? d.parameters
              : undefined,
          properties:
            d.properties != null &&
            typeof d.properties === "object" &&
            !Array.isArray(d.properties)
              ? d.properties
              : undefined,
        };
      })
      .filter((t): t is NonNullable<typeof t> => t !== null && t.name.length > 0);

    tools.sort((a, b) =>
      (a.displayName || a.name).localeCompare(b.displayName || b.name, "es"),
    );

    return c.json({ tools });
  } catch (error) {
    const r = handleFirestoreError(c, error, "[agents/tools-catalog]");
    return r ?? c.json({ error: "Error al leer catálogo." }, 500);
  }
}

function serializePendingTaskForClient(
  id: string,
  data: Record<string, unknown>,
): Record<string, unknown> {
  return {
    id,
    title: typeof data.title === "string" ? data.title : "",
    context: typeof data.context === "string" ? data.context : "",
    status: data.status === "completed" ? "completed" : "pending",
    postponed_from:
      typeof data.postponed_from === "string" ? data.postponed_from : "",
    created_at: serializeValue(data.created_at),
    updated_at: serializeValue(data.updated_at),
    completed_at: serializeValue(data.completed_at),
  };
}

function isDraftPropertyDocumentId(value: string): boolean {
  return DRAFT_PROPERTY_DOC_IDS.has(value);
}

function serializeDraftPropertyItemForClient(
  id: string,
  data: Record<string, unknown>,
): Record<string, unknown> {
  return {
    id,
    title: typeof data.title === "string" ? data.title : "",
    content: typeof data.content === "string" ? data.content : "",
    created_at: serializeValue(data.created_at),
    updated_at: serializeValue(data.updated_at),
  };
}

async function getAuthorizedDraftRef(
  authCtx: AgentsInfoAuthContext,
  draftId: string,
): Promise<
  | { ok: true; draftRef: DocumentReference; draftData: Record<string, unknown> }
  | { ok: false; code: 403 | 404 }
> {
  const db = getFirestore();
  const draftRef = db.collection(AGENT_DRAFTS).doc(draftId);
  const snap = await draftRef.get();
  if (!snap.exists) {
    return { ok: false, code: 404 };
  }
  const draftData = snap.data() ?? {};
  if (!canAccessDraft(authCtx, draftData)) {
    return { ok: false, code: 403 };
  }
  return { ok: true, draftRef, draftData };
}

export async function getDraftPendingTasks(
  c: Context,
  authCtx: AgentsInfoAuthContext,
  draftId: string,
) {
  try {
    const auth = await getAuthorizedDraftRef(authCtx, draftId);
    if (!auth.ok) {
      return c.json(
        { error: auth.code === 404 ? "Borrador no encontrado" : "No autorizado" },
        auth.code,
      );
    }
    const snap = await auth.draftRef
      .collection(PENDING_TASKS)
      .orderBy("created_at", "desc")
      .get();
    const tasks = snap.docs.map((doc) =>
      serializePendingTaskForClient(
        doc.id,
        (doc.data() as Record<string, unknown>) ?? {},
      ),
    );
    return c.json({ tasks });
  } catch (error) {
    const r = handleFirestoreError(c, error, "[agents/drafts/:id/tasks GET]");
    return r ?? c.json({ error: "Error al listar tareas pendientes." }, 500);
  }
}

export async function postDraftPendingTask(
  c: Context,
  authCtx: AgentsInfoAuthContext,
  draftId: string,
) {
  let raw: unknown;
  try {
    raw = await c.req.json();
  } catch {
    return c.json({ error: "JSON inválido" }, 400);
  }
  const parsed = createDraftPendingTaskSchema.safeParse(raw);
  if (!parsed.success) {
    const msg = parsed.error.issues.map((i) => i.message).join("; ");
    return c.json({ error: msg }, 400);
  }
  try {
    const auth = await getAuthorizedDraftRef(authCtx, draftId);
    if (!auth.ok) {
      return c.json(
        { error: auth.code === 404 ? "Borrador no encontrado" : "No autorizado" },
        auth.code,
      );
    }
    const ts = serverTimestampField();
    const payload: Record<string, unknown> = {
      title: parsed.data.title,
      context: parsed.data.context ?? "",
      postponed_from: parsed.data.postponed_from ?? "",
      status: "pending",
      created_at: ts,
      updated_at: ts,
      completed_at: null,
    };
    const docRef = await auth.draftRef.collection(PENDING_TASKS).add(payload);
    const created = await docRef.get();
    return c.json({
      task: serializePendingTaskForClient(
        docRef.id,
        (created.data() as Record<string, unknown>) ?? payload,
      ),
    });
  } catch (error) {
    const r = handleFirestoreError(c, error, "[agents/drafts/:id/tasks POST]");
    return r ?? c.json({ error: "Error al crear tarea pendiente." }, 500);
  }
}

export async function patchDraftPendingTask(
  c: Context,
  authCtx: AgentsInfoAuthContext,
  draftId: string,
  taskId: string,
) {
  let raw: unknown;
  try {
    raw = await c.req.json();
  } catch {
    return c.json({ error: "JSON inválido" }, 400);
  }
  const parsed = patchDraftPendingTaskSchema.safeParse(raw);
  if (!parsed.success) {
    const msg = parsed.error.issues.map((i) => i.message).join("; ");
    return c.json({ error: msg }, 400);
  }
  if (Object.keys(parsed.data).length === 0) {
    return c.json({ error: "No hay cambios para aplicar" }, 400);
  }
  try {
    const auth = await getAuthorizedDraftRef(authCtx, draftId);
    if (!auth.ok) {
      return c.json(
        { error: auth.code === 404 ? "Borrador no encontrado" : "No autorizado" },
        auth.code,
      );
    }
    const taskRef = auth.draftRef.collection(PENDING_TASKS).doc(taskId);
    const snap = await taskRef.get();
    if (!snap.exists) return c.json({ error: "Tarea no encontrada" }, 404);

    const next: Record<string, unknown> = {
      updated_at: serverTimestampField(),
    };
    if (parsed.data.status) {
      next.status = parsed.data.status;
      if (parsed.data.status === "completed") {
        next.completed_at = serverTimestampField();
      } else {
        next.completed_at = null;
      }
    }
    if (parsed.data.title !== undefined) next.title = parsed.data.title;
    if (parsed.data.context !== undefined) next.context = parsed.data.context;

    await taskRef.update(next);
    const updated = await taskRef.get();
    return c.json({
      task: serializePendingTaskForClient(
        taskId,
        (updated.data() as Record<string, unknown>) ?? {},
      ),
    });
  } catch (error) {
    const r = handleFirestoreError(c, error, "[agents/drafts/:id/tasks PATCH]");
    return r ?? c.json({ error: "Error al actualizar tarea pendiente." }, 500);
  }
}

export async function getDraftPropertyItems(
  c: Context,
  authCtx: AgentsInfoAuthContext,
  draftId: string,
  documentId: string,
) {
  if (!isDraftPropertyDocumentId(documentId)) {
    return c.json({ error: "documentId inválido" }, 400);
  }
  try {
    const auth = await getAuthorizedDraftRef(authCtx, draftId);
    if (!auth.ok) {
      return c.json(
        { error: auth.code === 404 ? "Borrador no encontrado" : "No autorizado" },
        auth.code,
      );
    }
    const snap = await auth.draftRef
      .collection("properties")
      .doc(documentId)
      .collection("items")
      .orderBy("created_at", "asc")
      .get();
    const items = snap.docs.map((doc) =>
      serializeDraftPropertyItemForClient(
        doc.id,
        (doc.data() as Record<string, unknown>) ?? {},
      ),
    );
    return c.json({ items });
  } catch (error) {
    const r = handleFirestoreError(
      c,
      error,
      "[agents/drafts/:id/properties/:documentId/items GET]",
    );
    return r ?? c.json({ error: "Error al listar items de properties." }, 500);
  }
}

export async function postDraftPropertyItem(
  c: Context,
  authCtx: AgentsInfoAuthContext,
  draftId: string,
  documentId: string,
) {
  if (!isDraftPropertyDocumentId(documentId)) {
    return c.json({ error: "documentId inválido" }, 400);
  }
  let raw: unknown;
  try {
    raw = await c.req.json();
  } catch {
    return c.json({ error: "JSON inválido" }, 400);
  }
  const parsed = createDraftPropertyItemSchema.safeParse(raw);
  if (!parsed.success) {
    const msg = parsed.error.issues.map((i) => i.message).join("; ");
    return c.json({ error: msg }, 400);
  }
  try {
    const auth = await getAuthorizedDraftRef(authCtx, draftId);
    if (!auth.ok) {
      return c.json(
        { error: auth.code === 404 ? "Borrador no encontrado" : "No autorizado" },
        auth.code,
      );
    }
    const ts = serverTimestampField();
    const payload: Record<string, unknown> = {
      title: parsed.data.title,
      content: parsed.data.content,
      created_at: ts,
      updated_at: ts,
    };
    const docRef = await auth.draftRef
      .collection("properties")
      .doc(documentId)
      .collection("items")
      .add(payload);
    const created = await docRef.get();
    return c.json({
      item: serializeDraftPropertyItemForClient(
        docRef.id,
        (created.data() as Record<string, unknown>) ?? payload,
      ),
    });
  } catch (error) {
    const r = handleFirestoreError(
      c,
      error,
      "[agents/drafts/:id/properties/:documentId/items POST]",
    );
    return r ?? c.json({ error: "Error al crear item de properties." }, 500);
  }
}

export async function patchDraftPropertyItem(
  c: Context,
  authCtx: AgentsInfoAuthContext,
  draftId: string,
  documentId: string,
  itemId: string,
) {
  if (!isDraftPropertyDocumentId(documentId)) {
    return c.json({ error: "documentId inválido" }, 400);
  }
  let raw: unknown;
  try {
    raw = await c.req.json();
  } catch {
    return c.json({ error: "JSON inválido" }, 400);
  }
  const parsed = patchDraftPropertyItemSchema.safeParse(raw);
  if (!parsed.success) {
    const msg = parsed.error.issues.map((i) => i.message).join("; ");
    return c.json({ error: msg }, 400);
  }
  try {
    const auth = await getAuthorizedDraftRef(authCtx, draftId);
    if (!auth.ok) {
      return c.json(
        { error: auth.code === 404 ? "Borrador no encontrado" : "No autorizado" },
        auth.code,
      );
    }
    const itemRef = auth.draftRef
      .collection("properties")
      .doc(documentId)
      .collection("items")
      .doc(itemId);
    const snap = await itemRef.get();
    if (!snap.exists) return c.json({ error: "Item no encontrado" }, 404);
    await itemRef.update({
      ...parsed.data,
      updated_at: serverTimestampField(),
    });
    const updated = await itemRef.get();
    return c.json({
      item: serializeDraftPropertyItemForClient(
        itemId,
        (updated.data() as Record<string, unknown>) ?? {},
      ),
    });
  } catch (error) {
    const r = handleFirestoreError(
      c,
      error,
      "[agents/drafts/:id/properties/:documentId/items PATCH]",
    );
    return r ?? c.json({ error: "Error al actualizar item de properties." }, 500);
  }
}

export async function deleteDraftPropertyItem(
  c: Context,
  authCtx: AgentsInfoAuthContext,
  draftId: string,
  documentId: string,
  itemId: string,
) {
  if (!isDraftPropertyDocumentId(documentId)) {
    return c.json({ error: "documentId inválido" }, 400);
  }
  try {
    const auth = await getAuthorizedDraftRef(authCtx, draftId);
    if (!auth.ok) {
      return c.json(
        { error: auth.code === 404 ? "Borrador no encontrado" : "No autorizado" },
        auth.code,
      );
    }
    const itemRef = auth.draftRef
      .collection("properties")
      .doc(documentId)
      .collection("items")
      .doc(itemId);
    const snap = await itemRef.get();
    if (!snap.exists) return c.json({ error: "Item no encontrado" }, 404);
    await itemRef.delete();
    return c.json({ ok: true, id: itemId });
  } catch (error) {
    const r = handleFirestoreError(
      c,
      error,
      "[agents/drafts/:id/properties/:documentId/items DELETE]",
    );
    return r ?? c.json({ error: "Error al eliminar item de properties." }, 500);
  }
}

const DRAFT_TECHNICAL_PROPERTY_DOC_IDS = [
  "agent",
  "response",
  "prompt",
  "memory",
  "limitation",
  "answer",
] as const satisfies readonly (typeof PROPERTY_DOC_IDS)[number][];

export async function mergeBuilderTechnicalPropertyPatchesForChat(
  authCtx: AgentsInfoAuthContext,
  draftId: string,
  rawPatches: Array<{ documentId: string; fieldKey: string; value: unknown }>,
): Promise<
  | { ok: true; applied: Array<{ documentId: string; fieldKey: string; value: unknown }> }
  | { ok: false; status: number; error: string }
> {
  if (rawPatches.length === 0) return { ok: true, applied: [] };
  const auth = await getAuthorizedDraftRef(authCtx, draftId);
  if (!auth.ok) {
    return {
      ok: false,
      status: auth.code,
      error:
        auth.code === 404 ? "Borrador no encontrado" : "No autorizado",
    };
  }

  const agentProp = await auth.draftRef.collection("properties").doc("agent").get();
  if (!agentProp.exists) {
    await writeDefaultAgentProperties(auth.draftRef);
    await syncAiFieldsToDraftRoot(auth.draftRef);
  }

  const byDoc = new Map<string, Record<string, unknown>>();
  const applied: Array<{ documentId: string; fieldKey: string; value: unknown }> =
    [];

  for (const p of rawPatches) {
    const entry = getBuilderAllowlistEntry(p.documentId, p.fieldKey);
    if (!entry) {
      return {
        ok: false,
        status: 400,
        error: `Campo no permitido en property_patch: ${p.documentId}.${p.fieldKey}`,
      };
    }
    const norm = normalizeAndValidateBuilderPropertyValue(entry, p.value);
    if (!norm.ok) {
      return { ok: false, status: 400, error: norm.error };
    }
    const docId = entry.documentId;
    const prev = byDoc.get(docId) ?? {};
    prev[entry.fieldKey] = norm.value;
    byDoc.set(docId, prev);
    applied.push({ documentId: docId, fieldKey: entry.fieldKey, value: norm.value });
  }

  const batch = auth.draftRef.firestore.batch();
  for (const [docId, data] of byDoc) {
    batch.set(auth.draftRef.collection("properties").doc(docId), data, {
      merge: true,
    });
  }
  batch.update(auth.draftRef, {
    updated_at: serverTimestampField(),
  });
  await batch.commit();

  return { ok: true, applied };
}

export async function getDraftTechnicalPropertiesBundle(
  c: Context,
  authCtx: AgentsInfoAuthContext,
  draftId: string,
) {
  try {
    const auth = await getAuthorizedDraftRef(authCtx, draftId);
    if (!auth.ok) {
      return c.json(
        { error: auth.code === 404 ? "Borrador no encontrado" : "No autorizado" },
        auth.code,
      );
    }
    const out: Record<string, Record<string, unknown>> = {};
    for (const docId of DRAFT_TECHNICAL_PROPERTY_DOC_IDS) {
      const snap = await auth.draftRef.collection("properties").doc(docId).get();
      out[docId] = snap.exists
        ? { ...((snap.data() as Record<string, unknown>) ?? {}) }
        : {};
    }
    return c.json({ properties: out });
  } catch (error) {
    const r = handleFirestoreError(
      c,
      error,
      "[agents/drafts/:id/technical-properties GET]",
    );
    return r ?? c.json({ error: "Error al leer propiedades técnicas del borrador." }, 500);
  }
}

export async function patchDraftTechnicalPropertyDocument(
  c: Context,
  authCtx: AgentsInfoAuthContext,
  draftId: string,
  documentId: string,
) {
  if (!isBuilderTechnicalDocumentId(documentId)) {
    return c.json({ error: "documentId no permitido" }, 400);
  }
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "JSON inválido" }, 400);
  }
  if (body == null || typeof body !== "object" || Array.isArray(body)) {
    return c.json({ error: "El cuerpo debe ser un objeto" }, 400);
  }
  const bodyObj = body as Record<string, unknown>;
  const patches: Array<{ documentId: string; fieldKey: string; value: unknown }> =
    [];
  for (const [fieldKey, value] of Object.entries(bodyObj)) {
    if (!getBuilderAllowlistEntry(documentId, fieldKey)) continue;
    patches.push({ documentId, fieldKey, value });
  }
  if (patches.length === 0) {
    return c.json({ error: "Ningún campo permitido en el cuerpo" }, 400);
  }

  const merged = await mergeBuilderTechnicalPropertyPatchesForChat(
    authCtx,
    draftId,
    patches,
  );
  if (!merged.ok) {
    const code = merged.status as 400 | 403 | 404;
    return c.json({ error: merged.error }, code);
  }

  return c.json({ documentId, success: true, applied: merged.applied });
}

async function loadActiveToolsCatalogByDocId(
  db: Firestore,
): Promise<Map<string, Record<string, unknown>>> {
  const snap = await db.collection(TOOLS_CATALOG).get();
  const map = new Map<string, Record<string, unknown>>();
  for (const doc of snap.docs) {
    const d = doc.data() as Record<string, unknown>;
    if (typeof d.status === "string" && d.status === "active") {
      map.set(doc.id, d);
    }
  }
  return map;
}

async function replaceDraftTools(
  draftRef: DocumentReference,
  catalogById: Map<string, Record<string, unknown>>,
  selectedIds: string[],
): Promise<void> {
  const toolsCol = draftRef.collection("tools");
  const existing = await toolsCol.get();
  const db = draftRef.firestore;
  let batch = db.batch();
  let ops = 0;

  const flush = async () => {
    if (ops > 0) {
      await batch.commit();
      batch = db.batch();
      ops = 0;
    }
  };

  for (const doc of existing.docs) {
    batch.delete(doc.ref);
    ops++;
    if (ops >= 400) await flush();
  }
  await flush();

  for (const toolId of selectedIds) {
    const raw = catalogById.get(toolId);
    if (!raw) continue;
    const type =
      typeof raw.type === "string" && raw.type.trim() !== ""
        ? raw.type
        : "default";
    const plain = stripFirestoreSentinels({ ...raw });
    batch.set(toolsCol.doc(toolId), {
      ...plain,
      id: toolId,
      type,
      updatedAt: FieldValue.serverTimestamp(),
    });
    ops++;
    if (ops >= 400) await flush();
  }
  await flush();
}

function stripFirestoreSentinels(obj: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v == null) continue;
    if (typeof v === "object" && v !== null && "_methodName" in (v as object)) {
      continue;
    }
    if (typeof v === "object" && !Array.isArray(v) && v !== null) {
      out[k] = stripFirestoreSentinels(v as Record<string, unknown>);
    } else {
      out[k] = v;
    }
  }
  return out;
}

function serializeDraftForClient(data: Record<string, unknown>): Record<string, unknown> {
  const secretKeys = new Set([
    "whatsappToken",
    "whatsapp_token",
    "AGENT_WHATSAPP_TOKEN",
    "AGENT_LONG_LIVED_TOKEN",
  ]);
  let hasWhatsappToken = false;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(data)) {
    if (secretKeys.has(k)) {
      hasWhatsappToken =
        hasWhatsappToken ||
        (typeof v === "string" ? v.length > 0 : Boolean(v));
      continue;
    }
    out[k] = serializeValue(v);
  }
  if (hasWhatsappToken) out.has_whatsapp_token = true;
  return out;
}

function serializeValue(v: unknown): unknown {
  if (v == null) return v;
  if (typeof v === "object" && v !== null && "toDate" in v && typeof (v as { toDate: () => Date }).toDate === "function") {
    try {
      return (v as { toDate: () => Date }).toDate().toISOString();
    } catch {
      return null;
    }
  }
  if (Array.isArray(v)) return v.map(serializeValue);
  if (typeof v === "object" && v !== null) {
    const o = v as Record<string, unknown>;
    const next: Record<string, unknown> = {};
    for (const [k, val] of Object.entries(o)) {
      next[k] = serializeValue(val);
    }
    return next;
  }
  return v;
}
