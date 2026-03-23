import type { Context } from "hono";
import type { DocumentReference, Firestore } from "firebase-admin/firestore";
import { z } from "zod";

import {
  serverTimestampField,
  syncAiFieldsToDraftRoot,
  writeDefaultAgentProperties,
} from "@/constants/agentPropertyDefaults";
import { getFirestore, FieldValue } from "@/lib/firestore";
import type { AgentsInfoAuthContext } from "@/types/agents";
import {
  extractFirestoreIndexUrl,
  firestoreFailureHint,
  isFirebaseConfigError,
} from "@/utils/firestore/errors";
import { isOperationsAdmin } from "@/utils/operations-access";

const AGENT_DRAFTS = "agent_drafts";
const TOOLS_CATALOG = "toolsCatalog";

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
    return c.json({
      id: snap.id,
      draft: serializeDraftForClient(data),
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

    // complete
    await draftRef.update({
      creation_step: "complete",
      updated_at: ts,
    });
    return c.json({ id: draftId, creation_step: "complete" });
  } catch (error) {
    const r = handleFirestoreError(c, error, "[agents/drafts PATCH]");
    return r ?? c.json({ error: "Error al actualizar borrador." }, 500);
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
