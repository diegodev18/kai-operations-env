"use client";

import "@xyflow/react/dist/style.css";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  applyNodeChanges,
  Background,
  ReactFlow,
  type Node,
  type NodeChange,
} from "@xyflow/react";
import { ArrowLeftIcon, CheckIcon, Loader2Icon } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  createDraftPendingTask,
  deleteDraftPropertyItem,
  fetchAgentDraft,
  fetchDraftPropertyItems,
  fetchDraftPendingTasks,
  fetchDraftTechnicalProperties,
  postAgentBuilderChat,
  patchAgentDraft,
  postAgentDraft,
  type DraftPendingTask,
} from "@/services/agents-api";
import {
  BUILDER_TECHNICAL_FIELDS,
  getTechFieldDefault,
} from "@/lib/form-builder/builder-technical-properties";
import type { BuilderChatUI, ToolsCatalogItem } from "@/types";
import { cn } from "@/lib/utils";
import { useToolsCatalog } from "@/hooks";

import { BuilderChatSidebar } from "./builder-chat-sidebar";
import { BuilderChatDiagramDialogs } from "./diagram-dialogs";
import {
  buildConfirmIncompletePromptForModel,
  deriveDeferredTaskTitle,
  detectDeferredIntent,
  isBusinessComplete,
  isPersonalityComplete,
  manualSectionDocId,
  mapDraftPropertyItemToManualNode,
  nowId,
  pickFirstString,
  str,
} from "./draft-helpers";
import {
  CHAT_COMPOSER_MAX_HEIGHT_PX,
  CHAT_COMPOSER_MIN_HEIGHT_PX,
  BUSINESS_FIELD_GRAPH,
  BUSINESS_FLOW,
  FORM_STEPS,
  THINKING_LABELS,
} from "./constants";
import { buildProgressiveGraph, mergeGraphNodesPreservingPositions } from "./progressive-graph";
import type {
  BuilderMode,
  BusinessFieldKey,
  ChatMessage,
  DraftState,
  DraftTextKey,
  FormStep,
  ManualNode,
  ManualSection,
  RequiredNodeFieldKey,
} from "./types";
import { formatUserBubbleText } from "./user-bubble-text";

export function AgentBuilderChatDiagram(props?: { initialMode?: "form" | "conversational" }) {
  const { tools: catalog } = useToolsCatalog();
  const router = useRouter();
  const searchParams = useSearchParams();
  const draftFromUrl = searchParams.get("draft")?.trim() ?? "";
  const layoutRef = useRef<HTMLDivElement | null>(null);
  const resizingRef = useRef(false);
  const chatComposerRef = useRef<HTMLTextAreaElement | null>(null);

  const [draftId, setDraftId] = useState(draftFromUrl);
  const [loadingDraft, setLoadingDraft] = useState(Boolean(draftFromUrl));
  const [saving, setSaving] = useState(false);
  const [chatPanelWidth, setChatPanelWidth] = useState(430);
  const [chatInput, setChatInput] = useState("");
  const [pendingTasks, setPendingTasks] = useState<DraftPendingTask[]>([]);
  const [queuedDeferredTexts, setQueuedDeferredTexts] = useState<string[]>([]);
  const [confirmedSummary, setConfirmedSummary] = useState(false);
  const [isThinking, setIsThinking] = useState(false);
  const [thinkingLabel, setThinkingLabel] = useState("Construyendo agente...");
  const [typingMessageId, setTypingMessageId] = useState<string | null>(null);
  const [isHydratingDraft, setIsHydratingDraft] = useState(false);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const initialMode = props?.initialMode ?? "form";
  const [builderMode, setBuilderMode] = useState<BuilderMode>(initialMode === "conversational" ? "conversational" : "form");
  const [formStep, setFormStep] = useState<FormStep>("business");

  const [draftState, setDraftState] = useState<DraftState>({
    agent_name: "",
    agent_personality: "",
    response_language: "Spanish",
    business_name: "",
    owner_name: "",
    industry: "",
    description: "",
    agent_description: "",
    target_audience: "",
    escalation_rules: "",
    country: "",
    use_emojis: "",
    country_accent: "",
    agent_signature: "",
    business_timezone: "",
    selected_tools: [],
    creation_step: "personality",
  });

  const lastSyncedRef = useRef({
    personality: "",
    business: "",
    tools: "",
    complete: false,
  });
  const hasHydratedDraftRef = useRef(false);
  /** Evita PATCH al hidratar un borrador ya marcado como completo en servidor. */
  const skipDraftPersistenceRef = useRef(false);
  /**
   * Evita múltiples POST / agent_drafts cuando varias llamadas a persistState
   * coinciden antes de que React aplique setDraftId (efecto + actualizaciones de estado).
   */
  const draftCreationPromiseRef = useRef<Promise<string> | null>(null);

  const [agentCreatedDialogOpen, setAgentCreatedDialogOpen] = useState(false);
  /** Estado de generación async del system prompt (campos MCP del borrador). */
  const [draftSystemPromptGenStatus, setDraftSystemPromptGenStatus] = useState<
    string | null
  >(null);
  const [toolsDialogOpen, setToolsDialogOpen] = useState(false);
  const [toolSearch, setToolSearch] = useState("");
  const [editingToolId, setEditingToolId] = useState<string | null>(null);
  const [manualDialogOpen, setManualDialogOpen] = useState(false);
  const [manualSection, setManualSection] = useState<ManualSection>("business");
  const [manualNodesBusiness, setManualNodesBusiness] = useState<ManualNode[]>([]);
  const [manualNodesPersonality, setManualNodesPersonality] = useState<ManualNode[]>([]);
  const [manualEditingId, setManualEditingId] = useState<string | null>(null);
  const [manualTitle, setManualTitle] = useState("");
  const [manualValue, setManualValue] = useState("");
  const [requiredNodeDialogOpen, setRequiredNodeDialogOpen] = useState(false);
  const [requiredNodeKey, setRequiredNodeKey] = useState<RequiredNodeFieldKey | null>(null);
  const [requiredNodeLabel, setRequiredNodeLabel] = useState("");
  const [requiredNodeValue, setRequiredNodeValue] = useState("");
  const [technicalPropsBundle, setTechnicalPropsBundle] = useState<
    Record<string, Record<string, unknown>> | null
  >(null);
  const [techDialogOpen, setTechDialogOpen] = useState(false);
  const [techEditDoc, setTechEditDoc] = useState<string | null>(null);
  const [techEditKey, setTechEditKey] = useState<string | null>(null);
  const [techBoolValue, setTechBoolValue] = useState(false);
  const [techNumberValue, setTechNumberValue] = useState("");
  const [techStringValue, setTechStringValue] = useState("");

  const addMessage = useCallback(
    (role: ChatMessage["role"], text: string, displayText?: string) => {
      setChatMessages((prev) => [
        ...prev,
        {
          id: nowId(),
          role,
          text,
          ...(displayText != null && displayText !== "" ? { displayText } : {}),
        },
      ]);
    },
    [],
  );

  const pickThinkingLabel = useCallback(() => {
    const index = Math.floor(Math.random() * THINKING_LABELS.length);
    return THINKING_LABELS[index] ?? THINKING_LABELS[0];
  }, []);

  const addAssistantMessageProgressive = useCallback(
    async (fullText: string, ui?: BuilderChatUI) => {
      const id = nowId();
      const normalized = fullText.trim();
      setTypingMessageId(id);
      setChatMessages((prev) => [...prev, { id, role: "assistant", text: "" }]);
      if (!normalized) {
        setTypingMessageId((current) => (current === id ? null : current));
        return;
      }
      const step = normalized.length > 420 ? 5 : normalized.length > 220 ? 4 : 3;
      for (let index = step; index <= normalized.length + step; index += step) {
        const partial = normalized.slice(0, Math.min(index, normalized.length));
        setChatMessages((prev) =>
          prev.map((message) => (message.id === id ? { ...message, text: partial } : message)),
        );
        await new Promise((resolve) => setTimeout(resolve, 16));
      }
      setChatMessages((prev) =>
        prev.map((message) =>
          message.id === id
            ? {
                ...message,
                text: normalized,
                ...(ui ? { ui } : {}),
              }
            : message,
        ),
      );
      setTypingMessageId((current) => (current === id ? null : current));
    },
    [],
  );

  const updateStepFromState = useCallback(
    (state: DraftState): DraftState => {
      const next = { ...state };
      if (!isBusinessComplete(next)) {
        next.creation_step = "business";
        return next;
      }
      if (next.selected_tools.length === 0) {
        next.creation_step = "tools";
        return next;
      }
      if (!isPersonalityComplete(next)) {
        next.creation_step = "personality";
        return next;
      }
      next.creation_step = "complete";
      return next;
    },
    [],
  );

  const readyToConfirm = useMemo(
    () =>
      isBusinessComplete(draftState) &&
      draftState.selected_tools.length > 0 &&
      isPersonalityComplete(draftState),
    [draftState],
  );

  const completion = useMemo(() => {
    const sections = [
      isBusinessComplete(draftState),
      draftState.selected_tools.length > 0,
      isPersonalityComplete(draftState),
      confirmedSummary,
    ];
    const done = sections.filter(Boolean).length;
    return Math.round((done / sections.length) * 100);
  }, [confirmedSummary, draftState]);

  const catalogById = useMemo(() => {
    return new Map(catalog.map((tool) => [tool.id, tool]));
  }, [catalog]);

  const removeToolFromDraft = useCallback((toolId: string) => {
    setDraftState((prev) =>
      updateStepFromState({
        ...prev,
        selected_tools: prev.selected_tools.filter((id) => id !== toolId),
      }),
    );
  }, [updateStepFromState]);

  const launchConversationalMode = useCallback(() => {
    setBuilderMode("conversational");
    setChatMessages((prev) => {
      if (prev.length > 0) return prev;
      return [
        {
          id: nowId(),
          role: "assistant",
          text: "Empezamos en modo conversacional con IA. Cuéntame sobre tu negocio y el agente que quieres construir.",
        },
      ];
    });
  }, []);

  const openManualNodeDialog = useCallback(
    (section: ManualSection, node?: ManualNode) => {
      setManualSection(section);
      setManualEditingId(node?.id ?? null);
      setManualTitle(node?.title ?? "");
      setManualValue(node?.value ?? "");
      setManualDialogOpen(true);
    },
    [],
  );

  const openRequiredNodeDialog = useCallback((key: RequiredNodeFieldKey, label: string) => {
      setRequiredNodeKey(key);
      setRequiredNodeLabel(label);
      setRequiredNodeValue(draftState[key]);
      setRequiredNodeDialogOpen(true);
  }, [draftState]);

  const syncTechnicalProps = useCallback(async (id: string) => {
    const res = await fetchDraftTechnicalProperties(id);
    if (res) setTechnicalPropsBundle(res);
  }, []);

  const openTechnicalPropertyDialog = useCallback(
    (documentId: string, fieldKey: string) => {
      const field = BUILDER_TECHNICAL_FIELDS.find(
        (f) => f.documentId === documentId && f.fieldKey === fieldKey,
      );
      if (!field) return;
      const raw = technicalPropsBundle?.[documentId]?.[fieldKey];
      const def = getTechFieldDefault(documentId, fieldKey);
      const effective = raw !== undefined && raw !== null ? raw : def;
      setTechEditDoc(documentId);
      setTechEditKey(fieldKey);
      if (field.kind === "boolean") {
        setTechBoolValue(effective === true);
        setTechNumberValue("");
        setTechStringValue("");
      } else if (field.kind === "number") {
        setTechBoolValue(false);
        setTechNumberValue(
          typeof effective === "number" && Number.isFinite(effective)
            ? String(effective)
            : typeof def === "number"
              ? String(def)
              : "",
        );
        setTechStringValue("");
      } else {
        setTechBoolValue(false);
        setTechNumberValue("");
        setTechStringValue(
          typeof effective === "string" ? effective : typeof def === "string" ? def : "",
        );
      }
      setTechDialogOpen(true);
    },
    [technicalPropsBundle],
  );

  const removeManualNode = useCallback(
    async (section: ManualSection, itemId: string) => {
      if (draftId) {
        const deleted = await deleteDraftPropertyItem(
          draftId,
          manualSectionDocId(section),
          itemId,
        );
        if (!deleted.ok) {
          toast.error(deleted.error);
          return;
        }
      }
      if (section === "business") {
        setManualNodesBusiness((prev) => prev.filter((node) => node.id !== itemId));
      } else {
        setManualNodesPersonality((prev) => prev.filter((node) => node.id !== itemId));
      }
    },
    [draftId],
  );

  const graph = useMemo(
    () =>
      buildProgressiveGraph(
        draftState,
        pendingTasks,
        catalogById,
        confirmedSummary,
        manualNodesBusiness,
        manualNodesPersonality,
        technicalPropsBundle,
        removeToolFromDraft,
        (nodeId) => void removeManualNode("business", nodeId),
        (nodeId) => void removeManualNode("personality", nodeId),
      ),
    [
      catalogById,
      confirmedSummary,
      draftState,
      manualNodesBusiness,
      manualNodesPersonality,
      pendingTasks,
      removeManualNode,
      removeToolFromDraft,
      technicalPropsBundle,
    ],
  );

  const [nodes, setNodes] = useState<Node[]>([]);
  useLayoutEffect(() => {
    setNodes((prev) => mergeGraphNodesPreservingPositions(prev, graph.nodes));
  }, [graph]);

  const onNodesChange = useCallback((changes: NodeChange[]) => {
    setNodes((nds) => applyNodeChanges(changes, nds));
  }, []);

  const syncPendingTasks = useCallback(async (id: string) => {
    const res = await fetchDraftPendingTasks(id);
    if (res) setPendingTasks(res.tasks);
  }, []);

  const syncManualNodesFromDraft = useCallback(async (id: string) => {
    const [personalityRes, businessRes] = await Promise.all([
      fetchDraftPropertyItems(id, "personality"),
      fetchDraftPropertyItems(id, "business"),
    ]);
    if (personalityRes) {
      setManualNodesPersonality(personalityRes.items.map(mapDraftPropertyItemToManualNode));
    }
    if (businessRes) {
      setManualNodesBusiness(businessRes.items.map(mapDraftPropertyItemToManualNode));
    }
  }, []);

  const flushQueuedDeferredTasks = useCallback(
    async (id: string) => {
      if (queuedDeferredTexts.length === 0) return;
      const queued = [...queuedDeferredTexts];
      setQueuedDeferredTexts([]);
      for (const text of queued) {
        const created = await createDraftPendingTask(id, {
          title: deriveDeferredTaskTitle(text),
          context: text,
          postponed_from: "chat_message",
        });
        if (created.ok) {
          setPendingTasks((prev) => [created.task, ...prev]);
        }
      }
    },
    [queuedDeferredTexts],
  );

  const persistState = useCallback(
    async (state: DraftState, markComplete: boolean): Promise<string | null> => {
      const stepped = updateStepFromState(state);
      const personalitySig = `${stepped.agent_name}|${stepped.agent_personality}|${stepped.response_language}`;
      const businessSig = BUSINESS_FLOW.map((field) => stepped[field]).join("|");
      const toolsSig = [...stepped.selected_tools].sort().join("|");

      let currentDraftId = draftId;
      if (!currentDraftId && isPersonalityComplete(stepped)) {
        if (!draftCreationPromiseRef.current) {
          draftCreationPromiseRef.current = (async (): Promise<string> => {
            setSaving(true);
            try {
              const created = await postAgentDraft({
                agent_name: stepped.agent_name.trim(),
                agent_personality: stepped.agent_personality.trim(),
              });
              if (!created.ok) {
                toast.error(created.error);
                throw new Error(created.error);
              }
              setDraftId(created.id);
              await syncPendingTasks(created.id);
              await flushQueuedDeferredTasks(created.id);
              await syncTechnicalProps(created.id);
              return created.id;
            } finally {
              setSaving(false);
            }
          })().finally(() => {
            draftCreationPromiseRef.current = null;
          });
        }
        try {
          currentDraftId = await draftCreationPromiseRef.current;
        } catch {
          return null;
        }
      }
      if (!currentDraftId) return null;

      if (
        isBusinessComplete(stepped) &&
        lastSyncedRef.current.business !== businessSig
      ) {
        setSaving(true);
        try {
          const res = await patchAgentDraft(currentDraftId, {
            step: "business",
            business_name: stepped.business_name.trim(),
            owner_name: stepped.owner_name.trim(),
            industry: stepped.industry.trim(),
            description: stepped.description.trim(),
            agent_description: stepped.agent_description.trim(),
            target_audience: stepped.target_audience.trim(),
            escalation_rules: stepped.escalation_rules.trim(),
            business_timezone: stepped.business_timezone.trim(),
            country: stepped.country.trim(),
          });
          if (res.ok) lastSyncedRef.current.business = businessSig;
          else toast.error(res.error);
        } finally {
          setSaving(false);
        }
      }

      if (
        stepped.selected_tools.length > 0 &&
        lastSyncedRef.current.tools !== toolsSig
      ) {
        setSaving(true);
        try {
          const res = await patchAgentDraft(currentDraftId, {
            step: "tools",
            selected_tools: stepped.selected_tools,
          });
          if (res.ok) lastSyncedRef.current.tools = toolsSig;
          else toast.error(res.error);
        } finally {
          setSaving(false);
        }
      }

      if (
        isPersonalityComplete(stepped) &&
        lastSyncedRef.current.personality !== personalitySig
      ) {
        setSaving(true);
        try {
          const res = await patchAgentDraft(currentDraftId, {
            step: "personality",
            agent_name: stepped.agent_name.trim(),
            agent_personality: stepped.agent_personality.trim(),
            response_language:
              stepped.response_language.trim() || "Spanish",
            use_emojis: stepped.use_emojis.trim(),
            country_accent: stepped.country_accent.trim(),
            agent_signature: stepped.agent_signature.trim(),
          });
          if (res.ok) lastSyncedRef.current.personality = personalitySig;
          else toast.error(res.error);
        } finally {
          setSaving(false);
        }
      }

      if (markComplete && !lastSyncedRef.current.complete) {
        setSaving(true);
        try {
          const res = await patchAgentDraft(currentDraftId, { step: "complete" });
          if (res.ok) {
            lastSyncedRef.current.complete = true;
            setDraftSystemPromptGenStatus("generating");
            toast.success(
              "Builder finalizado. El system prompt se está generando en segundo plano; en el diseñador de prompts verás el estado.",
            );
          } else {
            toast.error(res.error);
          }
        } finally {
          setSaving(false);
        }
      }
      return currentDraftId;
    },
    [
      draftId,
      flushQueuedDeferredTasks,
      syncPendingTasks,
      syncTechnicalProps,
      updateStepFromState,
    ],
  );

  useEffect(() => {
    if (!draftFromUrl) {
      const mode = initialMode === "conversational" ? "conversational" : "form";
      setBuilderMode(mode);
      setFormStep("business");
      if (mode === "conversational") {
        setChatMessages([
          {
            id: nowId(),
            role: "assistant",
            text: "Empezamos en modo conversacional con IA. Cuéntame sobre tu negocio y el agente que quieres construir.",
          },
        ]);
      }
      hasHydratedDraftRef.current = true;
      skipDraftPersistenceRef.current = false;
      setLoadingDraft(false);
      setManualNodesBusiness([]);
      setManualNodesPersonality([]);
      setTechnicalPropsBundle(null);
      setDraftSystemPromptGenStatus(null);
      return;
    }
    let cancelled = false;
    setLoadingDraft(true);
    setIsHydratingDraft(true);
    void (async () => {
      const res = await fetchAgentDraft(draftFromUrl);
      if (cancelled) return;
      setLoadingDraft(false);
      if (!res.ok) {
        setIsHydratingDraft(false);
        toast.error(res.error);
        return;
      }
      const d = res.draft as Record<string, unknown>;
      const creationStepRaw = str(d.creation_step);
      const creationStep: DraftState["creation_step"] =
        creationStepRaw === "business" ||
        creationStepRaw === "tools" ||
        creationStepRaw === "personality" ||
        creationStepRaw === "complete"
          ? creationStepRaw
          : "personality";
      const nextState = updateStepFromState({
        agent_name: pickFirstString(d, [
          "agent_name",
          "mcp_configuration.agent_personalization.agent_name",
        ]),
        agent_personality: pickFirstString(d, [
          "agent_personality",
          "mcp_configuration.agent_personalization.agent_personality",
        ]),
        response_language:
          pickFirstString(d, [
            "response_language",
            "mcp_configuration.agent_personalization.response_language",
          ]) || "Spanish",
        business_name: pickFirstString(d, [
          "business_name",
          "mcp_configuration.agent_business_info.business_name",
        ]),
        owner_name: pickFirstString(d, [
          "owner_name",
          "mcp_configuration.agent_business_info.owner_name",
        ]),
        industry: pickFirstString(d, [
          "industry",
          "mcp_configuration.agent_business_info.industry",
        ]),
        description: pickFirstString(d, [
          "description",
          "mcp_configuration.agent_business_info.description",
        ]),
        agent_description: pickFirstString(d, [
          "agent_description",
          "mcp_configuration.agent_business_info.agent_description",
        ]),
        target_audience: pickFirstString(d, [
          "target_audience",
          "mcp_configuration.agent_business_info.target_audience",
        ]),
        escalation_rules: pickFirstString(d, [
          "escalation_rules",
          "mcp_configuration.agent_business_info.escalation_rules",
        ]),
        country: pickFirstString(d, [
          "country",
          "mcp_configuration.agent_business_info.country",
        ]),
        use_emojis: pickFirstString(d, [
          "use_emojis",
          "mcp_configuration.agent_personalization.use_emojis",
        ]),
        country_accent: pickFirstString(d, [
          "country_accent",
          "mcp_configuration.agent_personalization.country_accent",
        ]),
        agent_signature: pickFirstString(d, [
          "agent_signature",
          "mcp_configuration.agent_personalization.agent_signature",
        ]),
        business_timezone: pickFirstString(d, [
          "business_timezone",
          "mcp_configuration.agent_business_info.business_timezone",
        ]),
        selected_tools: Array.isArray(d.selected_tools)
          ? d.selected_tools.filter((x): x is string => typeof x === "string")
          : [],
        creation_step: creationStep,
      });
      const serverMarkedComplete = creationStepRaw === "complete";
      /** Solo el servidor puede marcar el builder como cerrado; si usáramos `creation_step` local,
       * un borrador con todos los campos llenos pondría `lastSyncedRef.complete` sin PATCH y el
       * confirm no ejecutaría el paso `complete` ni el estado de generación del prompt. */
      const serverFlowComplete = serverMarkedComplete;

      const mcpHydrated = d.mcp_configuration as
        | Record<string, unknown>
        | undefined;
      const genFromNested =
        typeof mcpHydrated?.system_prompt_generation_status === "string"
          ? mcpHydrated.system_prompt_generation_status
          : null;
      const genSt = res.systemPromptGenerationStatus ?? genFromNested;

      setDraftId(res.id);
      setDraftState(nextState);
      setConfirmedSummary(serverFlowComplete);
      setDraftSystemPromptGenStatus(
        typeof genSt === "string" && genSt.length > 0 ? genSt : null,
      );

      if (serverFlowComplete) {
        setBuilderMode("conversational");
        skipDraftPersistenceRef.current = true;
        lastSyncedRef.current.complete = true;
        setAgentCreatedDialogOpen(true);
        setChatMessages([]);
      } else {
        setBuilderMode("conversational");
        skipDraftPersistenceRef.current = false;
        const contextLines = [
          "Borrador cargado. Este es tu contexto actual:",
          nextState.business_name.trim() ? `- Negocio: ${nextState.business_name}` : null,
          nextState.industry.trim() ? `- Industria: ${nextState.industry}` : null,
          nextState.target_audience.trim() ? `- Audiencia: ${nextState.target_audience}` : null,
          nextState.agent_description.trim()
            ? `- Rol del agente: ${nextState.agent_description}`
            : null,
          nextState.agent_name.trim() ? `- Nombre del agente: ${nextState.agent_name}` : null,
          nextState.response_language.trim()
            ? `- Idioma de respuestas al usuario: ${nextState.response_language}`
            : null,
          `- Tools seleccionadas: ${nextState.selected_tools.length}`,
        ].filter((line): line is string => Boolean(line));
        setChatMessages([
          {
            id: nowId(),
            role: "assistant",
            text: contextLines.join("\n"),
          },
        ]);
      }
      await syncPendingTasks(res.id);
      await syncManualNodesFromDraft(res.id);
      const tech = await fetchDraftTechnicalProperties(res.id);
      if (!cancelled && tech) setTechnicalPropsBundle(tech);
      hasHydratedDraftRef.current = true;
      setIsHydratingDraft(false);
    })();
    return () => {
      cancelled = true;
      setIsHydratingDraft(false);
    };
  }, [draftFromUrl, syncManualNodesFromDraft, syncPendingTasks, updateStepFromState]);

  useEffect(() => {
    if (!draftId || draftState.creation_step !== "complete") {
      return;
    }
    let cancelled = false;
    const poll = async () => {
      const r = await fetchAgentDraft(draftId);
      if (cancelled || !r.ok) return;
      const doc = r.draft as Record<string, unknown>;
      const mcp = doc.mcp_configuration as Record<string, unknown> | undefined;
      const nested =
        typeof mcp?.system_prompt_generation_status === "string"
          ? mcp.system_prompt_generation_status
          : null;
      const st = r.systemPromptGenerationStatus ?? nested;
      setDraftSystemPromptGenStatus(
        typeof st === "string" && st.length > 0 ? st : null,
      );
    };
    void poll();
    const interval = window.setInterval(() => void poll(), 5000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [draftId, draftState.creation_step]);

  useEffect(() => {
    if (!draftId) return;
    void syncTechnicalProps(draftId);
  }, [draftId, syncTechnicalProps]);

  const handleDeferredTask = useCallback(
    async (text: string) => {
      if (!detectDeferredIntent(text)) return;
      if (!draftId) {
        setQueuedDeferredTexts((prev) => [...prev, text]);
        addMessage(
          "assistant",
          "Detecté una acción para después y la registraré como tarea cuando se cree el borrador.",
        );
        return;
      }
      const created = await createDraftPendingTask(draftId, {
        title: deriveDeferredTaskTitle(text),
        context: text,
        postponed_from: "chat_message",
      });
      if (!created.ok) {
        toast.error(created.error);
        return;
      }
      setPendingTasks((prev) => [created.task, ...prev]);
      addMessage("assistant", `Tarea pendiente creada: "${created.task.title}".`);
    },
    [addMessage, draftId],
  );

  const applyDraftPatch = useCallback(
    (patch: Record<string, unknown>) => {
      setDraftState((prev) => {
        const next = { ...prev };
        const textKeys: DraftTextKey[] = [
          "agent_name",
          "agent_personality",
          "response_language",
          "business_name",
          "owner_name",
          "industry",
          "description",
          "agent_description",
          "target_audience",
          "escalation_rules",
          "country",
          "use_emojis",
          "country_accent",
          "agent_signature",
          "business_timezone",
        ];
        for (const key of textKeys) {
          const value = patch[key];
          if (typeof value === "string") next[key] = value.trim();
        }
        if (Array.isArray(patch.selected_tools)) {
          const incoming = patch.selected_tools.filter(
            (x): x is string => typeof x === "string" && x.trim().length > 0,
          );
          if (incoming.length > 0) {
            next.selected_tools = [...new Set([...next.selected_tools, ...incoming])];
          }
        }
        return updateStepFromState(next);
      });
    },
    [updateStepFromState],
  );

  const sendUserText = useCallback(
    async (text: string, displayText?: string) => {
      const trimmed = text.trim();
      if (!trimmed || isThinking) return;

      const isConfirm = trimmed.toLowerCase() === "confirmar";

      if (isConfirm && !readyToConfirm) {
        const fullUserText = buildConfirmIncompletePromptForModel(draftState);
        addMessage("user", fullUserText, displayText ?? "confirmar");
        await handleDeferredTask(trimmed);
        setThinkingLabel(pickThinkingLabel());
        setIsThinking(true);
        try {
          const llmRes = await postAgentBuilderChat({
            messages: [...chatMessages, { role: "user", text: fullUserText }],
            draftState,
            pendingTasksCount: pendingTasks.length,
            ...(draftId ? { draftId } : {}),
          });
          if (!llmRes.ok) {
            addMessage("assistant", `No pude responder en este momento: ${llmRes.error}`);
            return;
          }
          applyDraftPatch(llmRes.draftPatch as Record<string, unknown>);
          await addAssistantMessageProgressive(llmRes.assistantMessage, llmRes.ui);
          if (draftId) await syncTechnicalProps(draftId);
        } finally {
          setIsThinking(false);
        }
        return;
      }

      addMessage("user", trimmed, displayText);
      await handleDeferredTask(trimmed);

      if (isConfirm && readyToConfirm) {
        setConfirmedSummary(true);
        const nextState = updateStepFromState({ ...draftState, creation_step: "complete" });
        setDraftState(nextState);
        const persistedId = await persistState(nextState, true);
        setDraftSystemPromptGenStatus("generating");
        const draftIdForSync = persistedId ?? draftId;
        if (draftIdForSync) {
          const syncRes = await fetchAgentDraft(draftIdForSync);
          if (syncRes.ok) {
            const doc = syncRes.draft as Record<string, unknown>;
            const mcp = doc.mcp_configuration as Record<string, unknown> | undefined;
            const nested =
              typeof mcp?.system_prompt_generation_status === "string"
                ? mcp.system_prompt_generation_status
                : null;
            const st = syncRes.systemPromptGenerationStatus ?? nested;
            const creationStep =
              typeof doc.creation_step === "string" ? doc.creation_step : "";
            let resolved: string | null =
              typeof st === "string" && st.length > 0 ? st : null;
            if (
              creationStep === "complete" &&
              (resolved === null || resolved === "idle")
            ) {
              resolved = "generating";
            }
            setDraftSystemPromptGenStatus(resolved);
          }
        }
        addMessage("assistant", "Builder finalizado correctamente.");
        setAgentCreatedDialogOpen(true);
        toast.success("Builder completado");
        return;
      }

      setThinkingLabel(pickThinkingLabel());
      setIsThinking(true);
      try {
        const llmRes = await postAgentBuilderChat({
          messages: [...chatMessages, { role: "user", text: trimmed }],
          draftState,
          pendingTasksCount: pendingTasks.length,
          ...(draftId ? { draftId } : {}),
        });
        if (!llmRes.ok) {
          addMessage("assistant", `No pude responder en este momento: ${llmRes.error}`);
          return;
        }
        applyDraftPatch(llmRes.draftPatch as Record<string, unknown>);
        await addAssistantMessageProgressive(llmRes.assistantMessage, llmRes.ui);
        if (draftId) await syncTechnicalProps(draftId);
      } finally {
        setIsThinking(false);
      }
    },
    [
      addAssistantMessageProgressive,
      applyDraftPatch,
      addMessage,
      chatMessages,
      draftState,
      handleDeferredTask,
      isThinking,
      pendingTasks.length,
      persistState,
      readyToConfirm,
      syncTechnicalProps,
      draftId,
      updateStepFromState,
      pickThinkingLabel,
    ],
  );

  const handleSend = useCallback(
    async (textOverride?: string) => {
      if (builderMode === "unselected") return;
      if (
        builderMode === "form" &&
        formStep !== "tools" &&
        textOverride === undefined
      ) {
        return;
      }
      const text = (textOverride ?? chatInput).trim();
      if (!text) return;
      setChatInput("");
      await sendUserText(text);
    },
    [builderMode, chatInput, formStep, sendUserText],
  );

  const canUseChatComposer = builderMode === "conversational" || formStep === "tools";
  const formStepIndex = FORM_STEPS.indexOf(formStep);
  const selectedToolsForForm = draftState.selected_tools
    .map((toolId) => catalogById.get(toolId))
    .filter((tool): tool is ToolsCatalogItem => Boolean(tool));

  useLayoutEffect(() => {
    const el = chatComposerRef.current;
    if (!el) return;
    el.style.height = "auto";
    const h = Math.max(
      CHAT_COMPOSER_MIN_HEIGHT_PX,
      Math.min(el.scrollHeight, CHAT_COMPOSER_MAX_HEIGHT_PX),
    );
    el.style.height = `${h}px`;
  }, [chatInput]);

  useEffect(() => {
    if (!hasHydratedDraftRef.current) return;
    if (loadingDraft || isHydratingDraft) return;
    if (skipDraftPersistenceRef.current) return;
    void persistState(draftState, false);
  }, [draftState, isHydratingDraft, loadingDraft, persistState]);

  useEffect(() => {
    const onMouseMove = (event: MouseEvent) => {
      if (!resizingRef.current || !layoutRef.current) return;
      const rect = layoutRef.current.getBoundingClientRect();
      const nextWidth = event.clientX - rect.left;
      const min = 320;
      const max = Math.min(760, rect.width - 280);
      const clamped = Math.max(min, Math.min(max, nextWidth));
      setChatPanelWidth(clamped);
    };
    const onMouseUp = () => {
      resizingRef.current = false;
    };
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };
  }, []);

  if (loadingDraft) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center gap-2 text-muted-foreground">
        <Loader2Icon className="size-5 animate-spin" />
        Cargando borrador...
      </div>
    );
  }

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-[1450px] flex-col gap-3 px-4 pt-3 pb-3">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Button variant="outline" size="icon" asChild>
            <Link href="/" aria-label="Volver al panel">
              <ArrowLeftIcon className="size-4" />
            </Link>
          </Button>
          <div>
            <h1 className="text-xl font-semibold tracking-tight">
              Builder conversacional progresivo
            </h1>
            <p className="text-sm text-muted-foreground">
              Chat + diagrama. El mapa se construye por etapas. Progreso: {completion}%.
            </p>
          </div>
        </div>
        <Button
          onClick={() => {
            void handleSend("confirmar");
          }}
          disabled={saving || agentCreatedDialogOpen || isThinking}
        >
          {saving ? <Loader2Icon className="size-4 animate-spin" /> : <CheckIcon />}
          Confirmar y finalizar
        </Button>
      </div>

      <div ref={layoutRef} className="flex flex-1 flex-col gap-3 lg:flex-row lg:gap-1">
        <BuilderChatSidebar
          chatPanelWidth={chatPanelWidth}
          builderMode={builderMode}
          formStep={formStep}
          formStepIndex={formStepIndex}
          draftState={draftState}
          setDraftState={setDraftState}
          updateStepFromState={updateStepFromState}
          selectedToolsForForm={selectedToolsForForm}
          removeToolFromDraft={removeToolFromDraft}
          setEditingToolId={setEditingToolId}
          setToolsDialogOpen={setToolsDialogOpen}
          chatMessages={chatMessages}
          typingMessageId={typingMessageId}
          isThinking={isThinking}
          thinkingLabel={thinkingLabel}
          sendUserText={sendUserText}
          chatInput={chatInput}
          setChatInput={setChatInput}
          chatComposerRef={chatComposerRef}
          handleSend={handleSend}
          canUseChatComposer={canUseChatComposer}
          agentCreatedDialogOpen={agentCreatedDialogOpen}
          readyToConfirm={readyToConfirm}
          saving={saving}
          setFormStep={setFormStep}
        />

        <div
          className="hidden w-px cursor-col-resize bg-border/50 transition-colors hover:bg-primary/40 lg:block"
          onMouseDown={() => {
            resizingRef.current = true;
          }}
          role="separator"
          aria-orientation="vertical"
          aria-label="Redimensionar panel del chat"
        />

        {builderMode !== "form" ? (
          <section className="h-[calc(100vh-110px)] min-h-[700px] flex-1 rounded-xl border border-border bg-card p-3">
            <div className="h-full overflow-hidden rounded-lg border border-border">
              <ReactFlow
                nodes={nodes}
                edges={graph.edges}
                onNodesChange={onNodesChange}
                nodesDraggable
                onNodeClick={(_event, node) => {
                  if (node.id === "tool-add") {
                    setEditingToolId(null);
                    setToolsDialogOpen(true);
                    return;
                  }
                  if (node.id.startsWith("tool-")) {
                    const toolId = node.id.slice("tool-".length);
                    setEditingToolId(toolId);
                    setToolsDialogOpen(true);
                    return;
                  }
                  if (node.id === "business-add-manual") {
                    openManualNodeDialog("business");
                    return;
                  }
                  if (node.id === "personality-add-manual") {
                    openManualNodeDialog("personality");
                    return;
                  }
                  if (node.id.startsWith("business-manual-")) {
                    const nodeId = node.id.slice("business-manual-".length);
                    const target = manualNodesBusiness.find((item) => item.id === nodeId);
                    if (target) openManualNodeDialog("business", target);
                    return;
                  }
                  if (node.id.startsWith("personality-manual-")) {
                    const nodeId = node.id.slice("personality-manual-".length);
                    const target = manualNodesPersonality.find((item) => item.id === nodeId);
                    if (target) openManualNodeDialog("personality", target);
                    return;
                  }
                  if (node.id.startsWith("business-")) {
                    const key = node.id.slice("business-".length) as BusinessFieldKey;
                    const field = BUSINESS_FIELD_GRAPH.find((item) => item.key === key);
                    if (field) openRequiredNodeDialog(key, field.label);
                    return;
                  }
                  if (node.id === "personality-name") {
                    openRequiredNodeDialog("agent_name", "Nombre del agente");
                    return;
                  }
                  if (node.id === "personality-style") {
                    openRequiredNodeDialog("agent_personality", "Estilo");
                    return;
                  }
                  if (node.id === "personality-language") {
                    openRequiredNodeDialog(
                      "response_language",
                      "Idioma de las respuestas al usuario",
                    );
                    return;
                  }
                  if (node.id.startsWith("tech-")) {
                    const rest = node.id.slice("tech-".length);
                    const firstDash = rest.indexOf("-");
                    if (firstDash > 0) {
                      const docId = rest.slice(0, firstDash);
                      const fieldKey = rest.slice(firstDash + 1);
                      openTechnicalPropertyDialog(docId, fieldKey);
                    }
                  }
                }}
                fitView
                minZoom={0.3}
                maxZoom={1.8}
              >
                <Background />
              </ReactFlow>
            </div>
          </section>
        ) : (
          <section className="h-[calc(100vh-110px)] min-h-[700px] flex-1 rounded-xl border border-border bg-card p-3 flex items-center justify-center">
            <p className="text-muted-foreground text-sm">
              Completa el formulario para ver el diagrama de tu agente
            </p>
          </section>
        )}
      </div>
      <BuilderChatDiagramDialogs
        catalog={catalog}
        draftId={draftId}
        router={router}
        updateStepFromState={updateStepFromState}
        setDraftState={setDraftState}
        removeToolFromDraft={removeToolFromDraft}
        syncTechnicalProps={syncTechnicalProps}
        toolsDialogOpen={toolsDialogOpen}
        setToolsDialogOpen={setToolsDialogOpen}
        editingToolId={editingToolId}
        setEditingToolId={setEditingToolId}
        toolSearch={toolSearch}
        setToolSearch={setToolSearch}
        techDialogOpen={techDialogOpen}
        setTechDialogOpen={setTechDialogOpen}
        techEditDoc={techEditDoc}
        techEditKey={techEditKey}
        techBoolValue={techBoolValue}
        setTechBoolValue={setTechBoolValue}
        techNumberValue={techNumberValue}
        setTechNumberValue={setTechNumberValue}
        techStringValue={techStringValue}
        setTechStringValue={setTechStringValue}
        manualDialogOpen={manualDialogOpen}
        setManualDialogOpen={setManualDialogOpen}
        manualSection={manualSection}
        manualEditingId={manualEditingId}
        manualTitle={manualTitle}
        setManualTitle={setManualTitle}
        manualValue={manualValue}
        setManualValue={setManualValue}
        setManualEditingId={setManualEditingId}
        setManualNodesBusiness={setManualNodesBusiness}
        setManualNodesPersonality={setManualNodesPersonality}
        requiredNodeDialogOpen={requiredNodeDialogOpen}
        setRequiredNodeDialogOpen={setRequiredNodeDialogOpen}
        requiredNodeKey={requiredNodeKey}
        requiredNodeLabel={requiredNodeLabel}
        requiredNodeValue={requiredNodeValue}
        setRequiredNodeValue={setRequiredNodeValue}
        agentCreatedDialogOpen={agentCreatedDialogOpen}
        setAgentCreatedDialogOpen={setAgentCreatedDialogOpen}
        draftSystemPromptGenStatus={draftSystemPromptGenStatus}
      />

      <style jsx>{`
        .shine-text {
          color: rgba(255, 255, 255, 0.36);
          background-image:
            linear-gradient(rgba(255, 255, 255, 0.36), rgba(255, 255, 255, 0.36)),
            linear-gradient(
              110deg,
              rgba(255, 255, 255, 0) 0%,
              rgba(255, 255, 255, 0) 42%,
              rgba(255, 255, 255, 0.7) 50%,
              rgba(255, 255, 255, 0) 58%,
              rgba(255, 255, 255, 0) 100%
            );
          background-size:
            100% 100%,
            220px 100%;
          background-repeat:
            no-repeat,
            no-repeat;
          background-position:
            0 0,
            -220px 0;
          background-clip: text;
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          animation: subtle-shine 2.8s linear infinite;
        }

        @keyframes subtle-shine {
          0% {
            background-position:
              0 0,
              -220px 0;
          }
          100% {
            background-position:
              0 0,
              calc(100% + 220px) 0;
          }
        }
      `}</style>
    </div>
  );
}
