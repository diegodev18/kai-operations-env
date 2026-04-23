import type { DocumentReference } from "firebase-admin/firestore";

import { serverTimestampField } from "@/constants/agent-property-defaults";
import logger from "@/lib/logger";

import { USERS_BUILDERS } from "./constants";
import { detectAreaCodeFromPhoneNumber } from "./phone-region";

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
      if (item == null || typeof item !== "object" || Array.isArray(item))
        return null;
      const p = item as Record<string, unknown>;
      const pipelineIdRaw =
        typeof p.id === "string" && p.id.trim()
          ? p.id.trim()
          : `pipeline_${idx + 1}`;
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
            description: typeof s.description === "string" ? s.description : "",
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

export async function provisionAgentAfterComplete(
  draftRef: DocumentReference,
  draftData: Record<string, unknown>,
): Promise<void> {
  const db = draftRef.firestore;
  const ownerUserId =
    typeof draftData.creator_user_id === "string"
      ? draftData.creator_user_id
      : "";
  const ownerEmail =
    typeof draftData.creator_email === "string" ? draftData.creator_email : "";
  const ownerName =
    typeof draftData.owner_name === "string" &&
    draftData.owner_name.trim().length > 0
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
    const pipelineDocRef = draftRef
      .collection("pipelines")
      .doc(pipeline.id || "default");
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

  if (ownerPhone.trim().length > 0) {
    const usersBuildersSnap = await db
      .collection(USERS_BUILDERS)
      .where("phoneNumber", "==", ownerPhone)
      .limit(1)
      .get();

    if (usersBuildersSnap.empty) {
      logger.warn(
        "[agents/drafts] provisionAgentAfterComplete: no usersBuilders doc for phoneNumber; skipping assignedModules and agentDrafts",
        { agentId: draftRef.id, ownerPhone },
      );
    } else {
      const userBuilderRef = usersBuildersSnap.docs[0]!.ref;
      const ts = serverTimestampField();
      await userBuilderRef.set(
        { assignedModules: moduleAccess, updatedAt: ts },
        { merge: true },
      );

      const businessName =
        typeof draftData.business_name === "string"
          ? draftData.business_name.trim()
          : "";
      const industry =
        typeof draftData.industry === "string" ? draftData.industry.trim() : "";

      await userBuilderRef
        .collection("agentDrafts")
        .doc(draftRef.id)
        .set(
          {
            config_id: draftRef.id,
            business_name: businessName,
            industry,
            status: "ready_for_deployment",
            created_at: ts,
          },
          { merge: true },
        );
    }
  }

  logger.info("[agents/drafts] agent_created", {
    agentId: draftRef.id,
    moduleAccess,
    toolsCount: selectedToolNames.length,
    userId: ownerUserId,
  });
}
