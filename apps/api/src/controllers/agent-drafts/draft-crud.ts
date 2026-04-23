import type { Context } from "hono";

import { ApiErrors } from "@/lib/api-error";
import {
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
import { runSystemPromptGenerationJob } from "@/services/system-prompt-generation-job";
import type { AgentsInfoAuthContext } from "@/types/agents";
import { mergeMandatoryToolDocIds } from "@/controllers/agent-recommend-tools.controller";
import { isOperationsAdmin } from "@/utils/operations-access";
import { serializeAgentConfigurationRootForClient } from "@/utils/agents/serializeAgentRootForClient";
import { persistInitialBuilderSnapshotIfMissing } from "@/utils/agent-detail/builder-form";

import { AGENT_CONFIGURATIONS, USERS_BUILDERS } from "@/utils/agent-drafts/constants";
import {
  canAccessDraft,
  handleFirestoreError,
  requireEmailForGrower,
} from "@/utils/agent-drafts/access";
import { detectAreaCodeFromPhoneNumber } from "@/utils/agent-drafts/phone-region";
import {
  patchDraftBodySchema,
  postDraftBodySchema,
} from "@/utils/agent-drafts/schemas";
import { extractMcpGenerationMeta } from "@/utils/agent-drafts/serialization";
import { provisionAgentAfterComplete } from "@/utils/agent-drafts/pipelines-provision";
import {
  loadActiveToolsCatalogByDocId,
  replaceDraftTools,
} from "@/utils/agent-drafts/draft-tools-firestore";

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
      logger.info(
        `[agents/drafts] Created usersBuilders document for phone: ${userPhone}`,
      );
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
      createdAt: ts,
    });
    batch.set(
      draftRef
        .collection("testing")
        .doc("data")
        .collection("collaborators")
        .doc(creatorEmail),
      {
        email: creatorEmail,
        name: growerName,
        role: "Administrador",
        usersBuildersId: userId,
        usersBuildersName: growerName,
        areaCode: areaCode,
        phoneNumber: userPhone,
      },
    );
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
      draft: serializeAgentConfigurationRootForClient(data),
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
    const msg = parsed.error.issues
      .map((i) => i.path.join(".") + ": " + i.message)
      .join("; ");
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

      const personalityRef = draftRef
        .collection("properties")
        .doc("personality");
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

      const agentProp = await draftRef
        .collection("properties")
        .doc("agent")
        .get();
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

      const toolsRootPatch: Record<string, unknown> = {
        selected_tools: selectedWithMandatory,
        creation_step: "tools",
        updated_at: ts,
      };
      if (body.toolFlowsMarkdownEs !== undefined) {
        toolsRootPatch.toolFlowsMarkdownEs = body.toolFlowsMarkdownEs;
      }
      await draftRef.update(toolsRootPatch);

      return c.json({
        id: draftId,
        creation_step: "tools",
        selected_tools: selectedWithMandatory,
      });
    }

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

    try {
      await persistInitialBuilderSnapshotIfMissing(draftRef);
    } catch (e) {
      logger.error(
        "[agents/drafts] persistInitialBuilderSnapshotIfMissing",
        formatError(e),
      );
    }

    void runSystemPromptGenerationJob(draftId).catch((e) => {
      logger.error(
        "[agents/drafts] system prompt generation job",
        formatError(e),
      );
    });

    return c.json({ id: draftId, creation_step: "complete" });
  } catch (error) {
    const r = handleFirestoreError(c, error, "[agents/drafts PATCH]");
    return r ?? c.json({ error: "Error al actualizar borrador." }, 500);
  }
}
