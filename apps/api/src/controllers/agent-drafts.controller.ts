import type { Context } from "hono";
import type { DocumentReference, Firestore } from "firebase-admin/firestore";
import { z } from "zod";

import { ApiErrors, errorResponse, type ApiErrorCode } from "@/lib/api-error";
import {
  getBuilderAllowlistEntry,
  isBuilderTechnicalDocumentId,
  normalizeAndValidateBuilderPropertyValue,
} from "@/constants/builder-suggested-properties";
import {
  PROPERTY_DOC_IDS,
  serverTimestampField,
  writeDefaultAgentProperties,
  writeDefaultTestingProperties,
} from "@/constants/agentPropertyDefaults";
import { applyBuilderAdvancedProperties } from "@/utils/apply-builder-advanced-properties";
import { db as drizzleDb } from "@/db/client";
import { user as userTable } from "@/db/schema/auth";
import { eq } from "drizzle-orm";
import { getFirestore, FieldValue } from "@/lib/firestore";
import logger, { formatError } from "@/lib/logger";
import {
  runSystemPromptGenerationJob,
  setSystemPromptGeneratingFlags,
} from "@/services/system-prompt-generation-job";
import type { AgentsInfoAuthContext } from "@/types/agents";
import { mergeMandatoryToolDocIds } from "@/controllers/agent-recommend-tools.controller";
import {
  extractFirestoreIndexUrl,
  firestoreFailureHint,
  isFirebaseConfigError,
} from "@/utils/firestore/errors";
import { isOperationsAdmin, isOperationsCommercial } from "@/utils/operations-access";

/** Builder: un solo doc por agente en asistente comercial. */
const AGENT_CONFIGURATIONS = "agent_configurations";
const TOOLS_CATALOG = "toolsCatalog";
const PENDING_TASKS = "pending_tasks";
const DRAFT_PROPERTY_DOC_IDS = new Set(["personality", "business"]);
const USERS_BUILDERS = "usersBuilders";

const COUNTRY_CODE_MAPPING: Record<string, { country: string; lada: string; timezone: string }> = {
  "1": { country: "USA", lada: "1", timezone: "America/New_York" },
  "52": { country: "Mexico", lada: "52", timezone: "America/Mexico_City" },
  "521": { country: "Mexico", lada: "521", timezone: "America/Mexico_City" },
  "54": { country: "Argentina", lada: "54", timezone: "America/Argentina/Buenos_Aires" },
  "55": { country: "Brazil", lada: "55", timezone: "America/Sao_Paulo" },
  "51": { country: "Peru", lada: "51", timezone: "America/Lima" },
  "57": { country: "Colombia", lada: "57", timezone: "America/Bogota" },
  "593": { country: "Ecuador", lada: "593", timezone: "America/Guayaquil" },
  "502": { country: "Guatemala", lada: "502", timezone: "America/Guatemala" },
  "503": { country: "El Salvador", lada: "503", timezone: "America/El_Salvador" },
  "504": { country: "Honduras", lada: "504", timezone: "America/Tegucigalpa" },
  "505": { country: "Nicaragua", lada: "505", timezone: "America/Managua" },
  "506": { country: "Costa Rica", lada: "506", timezone: "America/Costa_Rica" },
  "507": { country: "Panama", lada: "507", timezone: "America/Panama" },
  "56": { country: "Chile", lada: "56", timezone: "America/Santiago" },
  "58": { country: "Venezuela", lada: "58", timezone: "America/Caracas" },
};

function detectAreaCodeFromPhoneNumber(
  phoneNumber: string,
): { country: string; lada: string; timezone: string } {
  const cleanedNumber = phoneNumber.replace(/\D/g, "");

  if (!cleanedNumber || cleanedNumber.length === 0) {
    return { country: "Mexico", lada: "521", timezone: "America/Mexico_City" };
  }

  for (let length = 3; length >= 1; length--) {
    if (cleanedNumber.length >= length) {
      const countryCode = cleanedNumber.substring(0, length);
      const mapping = COUNTRY_CODE_MAPPING[countryCode];
      if (mapping) {
        return mapping;
      }
    }
  }

  return { country: "Mexico", lada: "521", timezone: "America/Mexico_City" };
}

type DraftStage = {
  id: string;
  name: string;
  stageType: string | null;
  order: number;
  color: string;
  icon: string;
  description: string;
  isClosedWon: boolean;
  isClosedLost: boolean;
  isDefault: boolean;
};

type DraftPipeline = {
  id: string;
  name: string;
  description: string;
  isDefault: boolean;
  stages: DraftStage[];
};

function normalizeDraftPipelines(raw: unknown): DraftPipeline[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item, idx) => {
      if (item == null || typeof item !== "object" || Array.isArray(item)) return null;
      const p = item as Record<string, unknown>;
      const pipelineIdRaw = typeof p.id === "string" && p.id.trim() ? p.id.trim() : `pipeline_${idx + 1}`;
      const stagesRaw = Array.isArray(p.stages) ? p.stages : [];
      const stages: DraftStage[] = stagesRaw
        .map((stageItem, stageIdx) => {
          if (
            stageItem == null ||
            typeof stageItem !== "object" ||
            Array.isArray(stageItem)
          ) {
            return null;
          }
          const s = stageItem as Record<string, unknown>;
          const stageName =
            typeof s.name === "string" && s.name.trim().length > 0
              ? s.name.trim()
              : `Stage ${stageIdx + 1}`;
          const stageId =
            typeof s.id === "string" && s.id.trim().length > 0
              ? s.id.trim()
              : stageIdx === 0
                ? "default"
                : "";
          return {
            id: stageId,
            name: stageName,
            stageType:
              typeof s.stageType === "string" && s.stageType.trim().length > 0
                ? s.stageType.trim()
                : null,
            order:
              typeof s.order === "number" && Number.isFinite(s.order)
                ? s.order
                : stageIdx + 1,
            color:
              typeof s.color === "string" && s.color.trim().length > 0
                ? s.color.trim()
                : "#3B82F6",
            icon:
              typeof s.icon === "string" && s.icon.trim().length > 0
                ? s.icon.trim()
                : "📥",
            description:
              typeof s.description === "string" ? s.description : "",
            isClosedWon: s.isClosedWon === true,
            isClosedLost: s.isClosedLost === true,
            isDefault: s.isDefault === true || stageIdx === 0,
          } satisfies DraftStage;
        })
        .filter((s): s is DraftStage => s != null);

      return {
        id: pipelineIdRaw,
        name:
          typeof p.name === "string" && p.name.trim().length > 0
            ? p.name.trim()
            : "Pipeline de Ventas",
        description: typeof p.description === "string" ? p.description : "",
        isDefault: p.isDefault === true || idx === 0,
        stages,
      } satisfies DraftPipeline;
    })
    .filter((p): p is DraftPipeline => p != null);
}

async function provisionAgentAfterComplete(
  draftRef: DocumentReference,
  draftData: Record<string, unknown>,
): Promise<void> {
  const db = draftRef.firestore;
  const ownerUserId =
    typeof draftData.creator_user_id === "string" ? draftData.creator_user_id : "";
  const ownerEmail =
    typeof draftData.creator_email === "string" ? draftData.creator_email : "";
  const ownerName =
    typeof draftData.owner_name === "string" && draftData.owner_name.trim().length > 0
      ? draftData.owner_name.trim()
      : ownerEmail;
  const ownerPhone =
    typeof draftData.owner_phone === "string" ? draftData.owner_phone : "";

  const toolsSnap = await draftRef.collection("tools").get();
  const selectedToolNames = toolsSnap.docs
    .map((doc) => {
      const d = doc.data() as Record<string, unknown>;
      return typeof d.name === "string" ? d.name : "";
    })
    .filter((name) => name.length > 0);

  const modules = new Set<string>(["base", "modify_agent_configuration"]);
  for (const toolName of selectedToolNames) {
    if (
      toolName === "faq_tool" ||
      toolName === "kai_knowledge_base_ask_for_knowledge_base"
    ) {
      modules.add("knowledge_base_config");
    }
    if (toolName === "kai_database_register_new_client") {
      modules.add("register_client_config");
    }
    if (toolName === "kai_maintenance_upsert_maintenance_ticket") {
      modules.add("maintenance_ticket_config");
    }
  }
  const moduleAccess = [...modules];

  const walletRef = draftRef.collection("wallet").doc("info");
  const collaboratorsRef = draftRef.collection("collaborators");
  const pipelinesRaw = normalizeDraftPipelines(draftData.pipelines);

  const pipelinesToWrite: DraftPipeline[] =
    pipelinesRaw.length > 0
      ? pipelinesRaw
      : [
          {
            id: "default",
            name: "Pipeline de Ventas",
            description: "Pipeline principal para gestionar leads",
            isDefault: true,
            stages: [
              {
                id: "default",
                name: "OPORTUNIDADES",
                stageType: "OPPORTUNITIES",
                order: 1,
                color: "#3B82F6",
                icon: "📥",
                description: "Lead recien llegado, primera interaccion",
                isClosedWon: false,
                isClosedLost: false,
                isDefault: true,
              },
              {
                id: "",
                name: "INTERES",
                stageType: "INTEREST",
                order: 2,
                color: "#F59E0B",
                icon: "🔥",
                description: "Mostro intencion clara",
                isClosedWon: false,
                isClosedLost: false,
                isDefault: false,
              },
              {
                id: "",
                name: "REQUIERE ATENCION",
                stageType: "REQUIRES_ATTENTION",
                order: 3,
                color: "#EF4444",
                icon: "👤",
                description: "Requiere intervencion humana",
                isClosedWon: false,
                isClosedLost: false,
                isDefault: false,
              },
              {
                id: "",
                name: "COMPLETADO",
                stageType: "COMPLETED",
                order: 4,
                color: "#10B981",
                icon: "✅",
                description: "Flujo completado con exito",
                isClosedWon: true,
                isClosedLost: false,
                isDefault: false,
              },
              {
                id: "",
                name: "CANCELADO",
                stageType: "CANCELLED",
                order: 5,
                color: "#6B7280",
                icon: "❌",
                description: "Cancelado o perdido",
                isClosedWon: false,
                isClosedLost: true,
                isDefault: false,
              },
            ],
          },
        ];

  // Reemplazar pipelines para mantener consistencia con el estado final del builder.
  const existingPipelines = await draftRef.collection("pipelines").get();
  if (!existingPipelines.empty) {
    for (const pDoc of existingPipelines.docs) {
      const existingStages = await pDoc.ref.collection("stages").get();
      for (const stageDoc of existingStages.docs) {
        await stageDoc.ref.delete();
      }
      await pDoc.ref.delete();
    }
  }

  const batch = db.batch();
  for (const pipeline of pipelinesToWrite) {
    const pipelineDocRef = draftRef.collection("pipelines").doc(pipeline.id || "default");
    batch.set(
      pipelineDocRef,
      {
        id: pipeline.id || "default",
        name: pipeline.name,
        description: pipeline.description,
        isDefault: pipeline.isDefault,
        createdAt: serverTimestampField(),
        updatedAt: serverTimestampField(),
      },
      { merge: true },
    );
    for (const stage of pipeline.stages) {
      const stageRef = stage.id
        ? pipelineDocRef.collection("stages").doc(stage.id)
        : pipelineDocRef.collection("stages").doc();
      batch.set(stageRef, {
        id: stage.id || stageRef.id,
        name: stage.name,
        stageType: stage.stageType,
        order: stage.order,
        color: stage.color,
        icon: stage.icon,
        description: stage.description,
        isClosedWon: stage.isClosedWon,
        isClosedLost: stage.isClosedLost,
        isDefault: stage.isDefault,
        pipelineId: pipelineDocRef.id,
        createdAt: serverTimestampField(),
        updatedAt: serverTimestampField(),
      });
    }
  }

  batch.set(
    walletRef,
    {
      balance: 0,
      updatedAt: serverTimestampField(),
    },
    { merge: true },
  );

  if (ownerUserId) {
    const areaCode = detectAreaCodeFromPhoneNumber(ownerPhone);
    batch.set(
      collaboratorsRef.doc(ownerUserId),
      {
        id: ownerUserId,
        name: ownerName,
        email: ownerEmail,
        phoneNumber: ownerPhone,
        role: "Administrador",
        areaCode,
        usersBuildersId: ownerUserId,
        usersBuildersName: ownerName,
        createdAt: serverTimestampField(),
      },
      { merge: true },
    );
  }

  batch.update(draftRef, {
    moduleAccess,
    status: "ready_for_deployment",
    tools_count: selectedToolNames.length,
    updated_at: serverTimestampField(),
  });
  await batch.commit();

  if (ownerPhone) {
    await db
      .collection(USERS_BUILDERS)
      .doc(ownerPhone)
      .set({ assignedModules: moduleAccess, updatedAt: serverTimestampField() }, { merge: true });
  }

  logger.info("[agents/drafts] agent_created", {
    agentId: draftRef.id,
    moduleAccess,
    toolsCount: selectedToolNames.length,
    userId: ownerUserId,
  });
}

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
  response_language: z.string().trim().min(1).max(80),
  use_emojis: z.string().trim().min(1),
  country_accent: z.string().trim().min(1),
  agent_signature: z.string().trim().min(1),
  tone: z.enum(["formal", "casual", "professional", "friendly"]),
  greeting_message: z.string().trim().max(500).optional(),
  response_length: z.enum(["short", "medium", "long"]).optional(),
  required_phrases: z.array(z.string().trim()).optional(),
  topics_to_avoid: z.array(z.string().trim()).optional(),
  conversation_style: z.enum(["interrogative", "informative"]).optional(),
});

const patchBusinessSchema = z.object({
  step: z.literal("business"),
  business_name: z.string().trim().min(1),
  owner_name: z.string().trim().min(1),
  industry: z.string().trim().min(1),
  custom_industry: z.string().trim().optional(),
  description: z.string().trim().min(1),
  agent_description: z.string().trim().min(1),
  target_audience: z.string().trim().min(1),
  escalation_rules: z.string().trim().min(1),
  country: z.string().trim().min(1),
  business_timezone: z.string().trim().optional(),
  phone_number_id: z.string().trim().optional(),
  whatsapp_token: z.string().trim().optional(),
  brand_values: z.array(z.string().trim()).optional(),
  featured_products: z.array(z.string().trim()).optional(),
  policies: z.string().trim().optional(),
  faq: z.string().trim().optional(),
  operating_hours: z.string().trim().optional(),
  active_promotions: z.string().trim().optional(),
  business_hours: z.string().trim().optional(),
  require_auth: z.boolean().optional(),
  flow_answers: z.record(z.string(), z.string()).optional(),
  flow_questions: z
    .array(
      z.object({
        field: z.string().trim().min(1),
        label: z.string().trim().min(1),
        type: z.enum(["text", "textarea", "select"]),
        placeholder: z.string().trim().optional(),
        options: z.array(z.string().trim()).optional(),
        suggestions: z.array(z.string().trim()).optional(),
        suggestion_mode: z.enum(["single", "multi"]).optional(),
        required: z.boolean().optional(),
      }),
    )
    .optional(),
  pipelines: z.array(z.record(z.string(), z.unknown())).optional(),
  /** Builder paso Avanzado → properties (mismo criterio que agent-configuration-editor). */
  ai_model: z.string().trim().optional(),
  ai_temperature: z.number().min(0).max(1).optional(),
  response_wait_time: z.number().int().min(0).optional(),
  is_memory_enable: z.boolean().optional(),
  is_multi_message_response_enable: z.boolean().optional(),
  is_validator_agent_enable: z.boolean().optional(),
  mcp_max_retries: z.number().int().min(0).optional(),
  answer_not_support: z.string().max(500).optional(),
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
  if (isOperationsCommercial(authCtx.userRole)) return true;
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
  return ApiErrors.internal(c, "Error al acceder a Firestore.");
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
    return ApiErrors.validation(c, "JSON inválido");
  }

  const parsed = postDraftBodySchema.safeParse(raw);
  if (!parsed.success) {
    const msg = parsed.error.issues.map((i) => i.message).join("; ");
    return ApiErrors.validation(c, msg);
  }

  const { agent_name, agent_personality } = parsed.data;

  try {
    const db = getFirestore();
    const draftRef = db.collection(AGENT_CONFIGURATIONS).doc();
    const ts = serverTimestampField();
    const creatorEmail = authCtx.userEmail!.trim().toLowerCase();
    const nameFromProfile = authCtx.userName?.trim();
    const growerName =
      nameFromProfile && nameFromProfile.length > 0
        ? nameFromProfile
        : creatorEmail;
    const userId = authCtx.userId!;

    const userRows = await drizzleDb
      .select({ phone: userTable.phone })
      .from(userTable)
      .where(eq(userTable.id, userId))
      .limit(1);

    let userPhone = "";
    if (userRows.length > 0 && userRows[0].phone) {
      userPhone = userRows[0].phone;
    }

    const areaCode = detectAreaCodeFromPhoneNumber(userPhone);

    const usersBuildersQuery = await db
      .collection(USERS_BUILDERS)
      .where("phoneNumber", "==", userPhone)
      .limit(1)
      .get();

    if (usersBuildersQuery.empty) {
      await db.collection(USERS_BUILDERS).doc(userPhone).set({
        uid: userId,
        email: creatorEmail,
        name: growerName,
        phoneNumber: userPhone,
        createdAt: ts,
        updatedAt: ts,
      });
      logger.info(`[agents/drafts] Created usersBuilders document for phone: ${userPhone}`);
    }

    const draftPayload: Record<string, unknown> = {
      agent_name,
      agent_personality,
      creation_step: "personality",
      status: "pending_tools_selection",
      selected_tools: [],
      creator_user_id: userId,
      creator_email: creatorEmail,
      owner_user_id: userId,
      owner_phone: userPhone,
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
    batch.set(draftRef.collection("testing").doc("data"), {
      _createdAt: ts,
    });
    batch.set(draftRef.collection("testing").doc("data").collection("collaborators").doc(creatorEmail), {
      email: creatorEmail,
      name: growerName,
      role: "Administrador",
      usersBuildersId: userId,
      usersBuildersName: growerName,
      areaCode: areaCode,
      phoneNumber: userPhone,
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
    const snap = await db.collection(AGENT_CONFIGURATIONS).doc(draftId).get();
    if (!snap.exists) {
      return ApiErrors.notFound(c, "Borrador no encontrado");
    }
    const data = snap.data() ?? {};
    if (!canAccessDraft(authCtx, data)) {
      return ApiErrors.forbidden(c, "No autorizado");
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
    return ApiErrors.validation(c, "JSON inválido");
  }

  const parsed = patchDraftBodySchema.safeParse(raw);
  if (!parsed.success) {
    const msg = parsed.error.issues.map((i) => i.path.join(".") + ": " + i.message).join("; ");
    return ApiErrors.validation(c, msg);
  }

  try {
    const db = getFirestore();
    const draftRef = db.collection(AGENT_CONFIGURATIONS).doc(draftId);
    const snap = await draftRef.get();
    if (!snap.exists) {
      return ApiErrors.notFound(c, "Borrador no encontrado");
    }
    const existingDraft = snap.data() ?? {};
    if (!canAccessDraft(authCtx, existingDraft)) {
      return ApiErrors.forbidden(c, "No autorizado");
    }

    const body = parsed.data;
    const ts = serverTimestampField();

    if (body.step === "personality") {
      await draftRef.update({
        creation_step: "personality",
        updated_at: ts,
      });

      const personalityRef = draftRef.collection("properties").doc("personality");
      await personalityRef.set({
        agentName: body.agent_name,
        agentPersonality: body.agent_personality,
        responseLanguage: body.response_language,
        useEmojis: body.use_emojis,
        countryAccent: body.country_accent,
        agentSignature: body.agent_signature,
        tone: body.tone,
        greetingMessage: body.greeting_message ?? "",
        responseLength: body.response_length ?? "medium",
        requiredPhrases: body.required_phrases ?? [],
        topicsToAvoid: body.topics_to_avoid ?? [],
        conversationStyle: body.conversation_style ?? "informative",
      });

      return c.json({
        id: draftId,
        creation_step: "personality",
      });
    }

    if (body.step === "business") {
      await draftRef.update({
        creation_step: "business",
        updated_at: ts,
        business_name: body.business_name,
        owner_name: body.owner_name,
        industry: body.industry,
        custom_industry: body.custom_industry ?? "",
        description: body.description,
        agent_description: body.agent_description,
        target_audience: body.target_audience,
        escalation_rules: body.escalation_rules,
        country: body.country,
        business_timezone: body.business_timezone ?? "",
        business_hours: body.business_hours ?? "",
        require_auth: body.require_auth === true,
        flow_answers: body.flow_answers ?? {},
        flow_questions: body.flow_questions ?? [],
        pipelines: body.pipelines ?? [],
      });

      const businessData: Record<string, unknown> = {
        businessName: body.business_name,
        ownerName: body.owner_name,
        industry: body.industry,
        description: body.description,
        agentDescription: body.agent_description,
        targetAudience: body.target_audience,
        escalationRules: body.escalation_rules,
        country: body.country,
        brandValues: body.brand_values ?? [],
        featuredProducts: body.featured_products ?? [],
        policies: body.policies ?? "",
        faq: body.faq ?? "",
        operatingHours: body.operating_hours ?? "",
        activePromotions: body.active_promotions ?? "",
        businessTimezone: body.business_timezone ?? "",
        businessHours: body.business_hours ?? "",
        requireAuth: body.require_auth === true,
        flowAnswers: body.flow_answers ?? {},
        flowQuestions: body.flow_questions ?? [],
        pipelines: body.pipelines ?? [],
      };
      if (isOperationsAdmin(authCtx.userRole)) {
        if (body.phone_number_id !== undefined && body.phone_number_id !== "") {
          businessData.phoneNumberId = body.phone_number_id;
        }
        if (body.whatsapp_token !== undefined && body.whatsapp_token !== "") {
          businessData.whatsappToken = body.whatsapp_token;
        }
      }

      const businessRef = draftRef.collection("properties").doc("business");
      await businessRef.set(businessData);

      const agentProp = await draftRef.collection("properties").doc("agent").get();
      if (!agentProp.exists) {
        await writeDefaultAgentProperties(draftRef);
        await writeDefaultTestingProperties(draftRef);
      }

      await applyBuilderAdvancedProperties(draftRef, {
        business_timezone: body.business_timezone,
        require_auth: body.require_auth,
        ai_model: body.ai_model,
        ai_temperature: body.ai_temperature,
        response_wait_time: body.response_wait_time,
        is_memory_enable: body.is_memory_enable,
        is_multi_message_response_enable: body.is_multi_message_response_enable,
        is_validator_agent_enable: body.is_validator_agent_enable,
        mcp_max_retries: body.mcp_max_retries,
        answer_not_support: body.answer_not_support,
      });

      return c.json({ id: draftId, creation_step: "business" });
    }

    if (body.step === "tools") {
      const catalog = await loadActiveToolsCatalogByDocId(getFirestore());
      const selectedWithMandatory = mergeMandatoryToolDocIds(
        catalog,
        body.selected_tools,
      );
      const missing = selectedWithMandatory.filter((id) => !catalog.has(id));
      if (missing.length > 0) {
        return c.json(
          {
            error: "Hay herramientas no válidas o inactivas en el catálogo.",
            invalid_ids: missing,
          },
          400,
        );
      }

      await replaceDraftTools(draftRef, catalog, selectedWithMandatory);

      await draftRef.update({
        selected_tools: selectedWithMandatory,
        creation_step: "tools",
        updated_at: ts,
      });

      return c.json({
        id: draftId,
        creation_step: "tools",
        selected_tools: selectedWithMandatory,
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
    await provisionAgentAfterComplete(draftRef, existingDraft);

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
    const snap = await auth.draftRef.get();
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
          crmConfig: d.crmConfig,
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
  const draftRef = db.collection(AGENT_CONFIGURATIONS).doc(draftId);
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
    return ApiErrors.validation(c, "JSON inválido");
  }
  const parsed = createDraftPendingTaskSchema.safeParse(raw);
  if (!parsed.success) {
    const msg = parsed.error.issues.map((i) => i.message).join("; ");
    return ApiErrors.validation(c, msg);
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
    return ApiErrors.validation(c, "JSON inválido");
  }
  const parsed = patchDraftPendingTaskSchema.safeParse(raw);
  if (!parsed.success) {
    const msg = parsed.error.issues.map((i) => i.message).join("; ");
    return ApiErrors.validation(c, msg);
  }
  if (Object.keys(parsed.data).length === 0) {
    return ApiErrors.validation(c, "No hay cambios para aplicar");
  }
  try {
    const auth = await getAuthorizedDraftRef(authCtx, draftId);
    if (!auth.ok) {
      if (auth.code === 404) {
        return ApiErrors.notFound(c, "Borrador no encontrado");
      }
      return ApiErrors.forbidden(c, "No autorizado");
    }
    const taskSnap = await auth.draftRef.collection(PENDING_TASKS).doc(taskId).get();
    if (!taskSnap.exists) {
      return ApiErrors.notFound(c, "Tarea no encontrada");
    }
    await auth.draftRef.collection(PENDING_TASKS).doc(taskId).update({
      ...(parsed.data.status && { status: parsed.data.status }),
      ...(parsed.data.title && { title: parsed.data.title }),
      ...(parsed.data.context && { context: parsed.data.context }),
      updated_at: serverTimestampField(),
    });
    const updated = await auth.draftRef.collection(PENDING_TASKS).doc(taskId).get();
    return c.json({
      task: serializePendingTaskForClient(
        taskId,
        (updated.data() as Record<string, unknown>) ?? {},
      ),
    });
  } catch (error) {
    const r = handleFirestoreError(c, error, "[agents/drafts/:id/tasks/:taskId PATCH]");
    return r ?? ApiErrors.internal(c, "Error al actualizar tarea pendiente.");
  }
}

export async function getDraftPropertyItems(
  c: Context,
  authCtx: AgentsInfoAuthContext,
  draftId: string,
  documentId: string,
) {
  if (!isDraftPropertyDocumentId(documentId)) {
    return ApiErrors.validation(c, "documentId inválido");
  }
  try {
    const auth = await getAuthorizedDraftRef(authCtx, draftId);
    if (!auth.ok) {
      if (auth.code === 404) {
        return ApiErrors.notFound(c, "Borrador no encontrado");
      }
      return ApiErrors.forbidden(c, "No autorizado");
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
    return r ?? ApiErrors.internal(c, "Error al listar items de properties.");
  }
}

export async function postDraftPropertyItem(
  c: Context,
  authCtx: AgentsInfoAuthContext,
  draftId: string,
  documentId: string,
) {
  if (!isDraftPropertyDocumentId(documentId)) {
    return ApiErrors.validation(c, "documentId inválido");
  }
  let raw: unknown;
  try {
    raw = await c.req.json();
  } catch {
    return ApiErrors.validation(c, "JSON inválido");
  }
  const parsed = createDraftPropertyItemSchema.safeParse(raw);
  if (!parsed.success) {
    const msg = parsed.error.issues.map((i) => i.message).join("; ");
    return ApiErrors.validation(c, msg);
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
    return ApiErrors.validation(c, "documentId inválido");
  }
  let raw: unknown;
  try {
    raw = await c.req.json();
  } catch {
    return ApiErrors.validation(c, "JSON inválido");
  }
  const parsed = patchDraftPropertyItemSchema.safeParse(raw);
  if (!parsed.success) {
    const msg = parsed.error.issues.map((i) => i.message).join("; ");
    return ApiErrors.validation(c, msg);
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
    if (!snap.exists) return ApiErrors.notFound(c, "Item no encontrado");
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
    return ApiErrors.validation(c, "documentId inválido");
  }
  try {
    const auth = await getAuthorizedDraftRef(authCtx, draftId);
    if (!auth.ok) {
      if (auth.code === 404) {
        return ApiErrors.notFound(c, "Borrador no encontrado");
      }
      return ApiErrors.forbidden(c, "No autorizado");
    }
    const itemRef = auth.draftRef
      .collection("properties")
      .doc(documentId)
      .collection("items")
      .doc(itemId);
    const snap = await itemRef.get();
    if (!snap.exists) return ApiErrors.notFound(c, "Item no encontrado");
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
    return ApiErrors.validation(c, "documentId no permitido");
  }
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return ApiErrors.validation(c, "JSON inválido");
  }
  if (body == null || typeof body !== "object" || Array.isArray(body)) {
    return ApiErrors.validation(c, "El cuerpo debe ser un objeto");
  }
  const bodyObj = body as Record<string, unknown>;
  const patches: Array<{ documentId: string; fieldKey: string; value: unknown }> =
    [];
  for (const [fieldKey, value] of Object.entries(bodyObj)) {
    if (!getBuilderAllowlistEntry(documentId, fieldKey)) continue;
    patches.push({ documentId, fieldKey, value });
  }
  if (patches.length === 0) {
    return ApiErrors.validation(c, "Ningún campo permitido en el cuerpo");
  }

  const merged = await mergeBuilderTechnicalPropertyPatchesForChat(
    authCtx,
    draftId,
    patches,
  );
  if (!merged.ok) {
    const code = merged.status as 400 | 403 | 404;
    return errorResponse(c, merged.error, code === 404 ? "NOT_FOUND" : code === 403 ? "FORBIDDEN" : "VALIDATION_ERROR", code);
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
  const testingToolsCol = draftRef.collection("testing").doc("data").collection("tools");
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
    batch.delete(testingToolsCol.doc(doc.id));
    ops += 2;
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
    const toolData = {
      ...plain,
      id: toolId,
      type,
      updatedAt: FieldValue.serverTimestamp(),
    };
    batch.set(toolsCol.doc(toolId), toolData);
    batch.set(testingToolsCol.doc(toolId), toolData);
    ops += 2;
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
