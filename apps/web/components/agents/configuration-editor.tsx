"use client";

import type {
  AgentPropertiesResponse,
  PropertyDocumentId,
} from "@/types";
import {
  useTestingProperties,
  updateTestingPropertyDocument,
} from "@/hooks";
import { useTestingDiff } from "@/hooks";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  FunnelIcon,
  Loader2Icon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  type AgentGrowerRow,
  type AgentTechLeadRow,
  deleteAgentGrower,
  fetchAgentById,
  fetchAgentGrowers,
  fetchAgentTechLeads,
  patchAgent,
  patchAgentAllowedDynamicTableSchemas,
  postAgentGrower,
  postAgentTechLead,
  deleteAgentTechLead,
} from "@/services/agents-api";
import { fetchDynamicTableSchemas } from "@/services/dynamic-table-schemas-api";
import type { DynamicTableSchemaDocument } from "@/types/dynamic-table-schema";

/** Esquemas viven en Firestore de KAI (producción), no en el proyecto asistente comercial (`testing` en API). */
const DYNAMIC_SCHEMAS_API_ENV = "production" as const;
import {
  fetchOrganizationMe,
  fetchOrganizationUsers,
  type OrganizationUser,
} from "@/services/organization-api";
import { AGENT_VERSIONS } from "@/consts/agent-versions";
import { PromoteDiffDialog } from "@/components/prompt";
import { ToolsPullFromProductionDialog } from "@/components/agents/tools-pull-from-production-dialog";
import {
  ConfirmTextDialog,
  OrgUserPickerDialog,
} from "@/components/shared";
import {
  AGENT_LLM_MODELS,
  DEFAULT_LLM_MODEL,
  DOCUMENT_LABELS,
  getDefaultTemperatureForModel,
} from "./configuration-editor/constants";
import { FieldLabel } from "./configuration-editor/field-label";
import {
  buildPartialPayloadForDocument,
  getPendingDocumentIds,
} from "./configuration-editor/helpers";
import { ConfigurationActionsBar } from "./configuration-editor/actions-bar";
import { PendingLocalChangesList } from "./configuration-editor/pending-local-changes-list";
import { ConfigurationSectionNav } from "./configuration-editor/section-nav";
import { StatusSection } from "./configuration-editor/status-section";
import { TeamSection } from "./configuration-editor/team-section";

export function AgentConfigurationEditor({
  agentId,
  onAgentUpdated,
}: {
  agentId: string;
  onAgentUpdated?: () => void;
}) {
  const { data, isLoading, error: testingPropertiesError, didAutoSync, refetch } =
    useTestingProperties(agentId);
  const [formState, setFormState] = useState<AgentPropertiesResponse | null>(
    null
  );
  const [saving, setSaving] = useState(false);
  const [agentNameForConfirm, setAgentNameForConfirm] = useState("");
  const [isDisableDialogOpen, setIsDisableDialogOpen] = useState(false);
  const [isGrowersDialogOpen, setIsGrowersDialogOpen] = useState(false);
  const [orgUsers, setOrgUsers] = useState<OrganizationUser[]>([]);
  const [dialogGrowers, setDialogGrowers] = useState<AgentGrowerRow[]>([]);
  const [orgUsersLoading, setOrgUsersLoading] = useState(false);
  const [dialogGrowersLoading, setDialogGrowersLoading] = useState(false);
  const [addingGrowerUserId, setAddingGrowerUserId] = useState<string | null>(
    null,
  );
  const [isTechLeadsDialogOpen, setIsTechLeadsDialogOpen] = useState(false);
  const [dialogTechLeads, setDialogTechLeads] = useState<AgentTechLeadRow[]>([]);
  const [dialogTechLeadsLoading, setDialogTechLeadsLoading] = useState(false);
  const [addingTechLeadUserId, setAddingTechLeadUserId] = useState<string | null>(
    null,
  );
  const [userRole, setUserRole] = useState<string | null>(null);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [promoteDialogOpen, setPromoteDialogOpen] = useState(false);
  const [pullDialogOpen, setPullDialogOpen] = useState(false);
  const [localPendingDialogOpen, setLocalPendingDialogOpen] = useState(false);
  const [syncingFromProd, setSyncingFromProd] = useState(false);
  const [agentVersion, setAgentVersion] = useState<string>("production");
  const [savingVersion, setSavingVersion] = useState(false);
  const [firestoreDataMode, setFirestoreDataMode] = useState<
    "auto" | "testing" | "production"
  >("auto");
  const [savingFirestoreDataMode, setSavingFirestoreDataMode] = useState(false);
  const { data: diffData, isLoading: isDiffLoading, refetch: refetchDiff } = useTestingDiff(agentId);
  const [availableSchemas, setAvailableSchemas] = useState<DynamicTableSchemaDocument[]>([]);
  const [schemasLoading, setSchemasLoading] = useState(false);
  const [schemasListError, setSchemasListError] = useState<string | null>(null);
  const [selectedAllowedSchemaIds, setSelectedAllowedSchemaIds] = useState<string[]>([]);
  const [savingAllowedSchemas, setSavingAllowedSchemas] = useState(false);
  const [schemaSearch, setSchemaSearch] = useState("");
  const [showOnlySelectedSchemas, setShowOnlySelectedSchemas] = useState(false);
  const [showAllSchemas, setShowAllSchemas] = useState(false);

  useEffect(() => {
    if (testingPropertiesError) toast.error(testingPropertiesError);
  }, [testingPropertiesError]);

  useEffect(() => {
    if (didAutoSync) {
      toast.success("Datos sincronizados desde producción");
    }
  }, [didAutoSync]);

  useEffect(() => {
    if (data) {
      const raw = JSON.parse(JSON.stringify(data)) as Record<string, unknown>;
      delete raw.in_commercial;
      delete raw.in_production;
      delete raw.primary_source;
      const next = raw as unknown as AgentPropertiesResponse;
      // Hydrate ai.model and ai.temperature from data.ai (source of truth), fallback to data.prompt
      if (next.ai) {
        next.ai.model =
          next.ai.model ??
          (data.prompt?.model as string | undefined) ??
          DEFAULT_LLM_MODEL;
        next.ai.temperature =
          next.ai.temperature !== undefined && next.ai.temperature !== null
            ? Number(next.ai.temperature)
            : (data.prompt?.temperature !== undefined &&
              data.prompt?.temperature !== null
                ? Number(data.prompt.temperature)
                : getDefaultTemperatureForModel(next.ai.model ?? DEFAULT_LLM_MODEL));
      }
      next.limitation = {
        userLimitation: !!next.limitation?.userLimitation,
        allowedUsers: Array.isArray(next.limitation?.allowedUsers)
          ? next.limitation.allowedUsers
          : [],
      };
      setFormState(next);
    } else setFormState(null);
  }, [data]);

  useEffect(() => {
    if (!agentId) return;
    let cancelled = false;
    (async () => {
      const agent = await fetchAgentById(agentId);
      if (cancelled) return;
      const resolvedName =
        (typeof agent?.agentName === "string" && agent.agentName.trim() !== ""
          ? agent.agentName
          : agent?.name) ?? agentId;
      setAgentNameForConfirm(resolvedName);
      if (agent?.version) {
        setAgentVersion(agent.version);
      }
      setFirestoreDataMode(agent?.firestoreDataMode ?? "auto");
      const ids = agent?.allowedSchemasIds ?? [];
      setSelectedAllowedSchemaIds(ids);
    })();
    return () => {
      cancelled = true;
    };
  }, [agentId]);

  useEffect(() => {
    if (!agentId) return;
    let cancelled = false;
    setSchemasLoading(true);
    setSchemasListError(null);
    void (async () => {
      const res = await fetchDynamicTableSchemas(DYNAMIC_SCHEMAS_API_ENV);
      if (cancelled) return;
      setSchemasLoading(false);
      if (res.ok) {
        setAvailableSchemas(res.schemas);
      } else {
        setAvailableSchemas([]);
        setSchemasListError(res.error);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [agentId]);

  useEffect(() => {
    if (!isGrowersDialogOpen || !agentId) {
      if (!isGrowersDialogOpen) {
        setOrgUsers([]);
        setDialogGrowers([]);
      }
      return;
    }
    let cancelled = false;
    setOrgUsersLoading(true);
    setDialogGrowersLoading(true);
    void (async () => {
      const [usersRes, growersRes] = await Promise.all([
        fetchOrganizationUsers(),
        fetchAgentGrowers(agentId),
      ]);
      if (cancelled) return;
      setOrgUsersLoading(false);
      setDialogGrowersLoading(false);
      if (usersRes?.users) {
        setOrgUsers(usersRes.users);
      } else {
        setOrgUsers([]);
        toast.error("No se pudieron cargar los usuarios de la organización");
      }
      if (growersRes === null) {
        setDialogGrowers([]);
        toast.error("No se pudieron cargar los growers del agente");
      } else {
        setDialogGrowers(
          Array.isArray(growersRes.growers) ? growersRes.growers : [],
        );
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isGrowersDialogOpen, agentId]);

  useEffect(() => {
    if (!agentId) return;
    let cancelled = false;
    void (async () => {
      const [me, growersRes, techLeadsRes] = await Promise.all([
        fetchOrganizationMe(),
        fetchAgentGrowers(agentId),
        fetchAgentTechLeads(agentId),
      ]);
      if (cancelled) return;
      if (me) {
        setUserRole(me.role);
        if (me.email) {
          setUserEmail(me.email);
        }
      }
      if (growersRes?.growers) {
        setDialogGrowers(growersRes.growers);
      }
      if (techLeadsRes?.techLeads) {
        setDialogTechLeads(techLeadsRes.techLeads);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [agentId]);

  useEffect(() => {
    if (!isTechLeadsDialogOpen || !agentId) {
      if (!isTechLeadsDialogOpen) {
        setDialogTechLeads([]);
        setOrgUsers([]);
      }
      return;
    }
    let cancelled = false;
    setDialogTechLeadsLoading(true);
    setOrgUsersLoading(true);
    void (async () => {
      const [usersRes, techLeadsRes] = await Promise.all([
        fetchOrganizationUsers(),
        fetchAgentTechLeads(agentId),
      ]);
      if (cancelled) return;
      setDialogTechLeadsLoading(false);
      setOrgUsersLoading(false);
      if (usersRes?.users) {
        setOrgUsers(usersRes.users);
      } else {
        setOrgUsers([]);
        toast.error("No se pudieron cargar los usuarios de la organización");
      }
      if (techLeadsRes === null) {
        setDialogTechLeads([]);
        toast.error("No se pudieron cargar los tech leads del agente");
      } else {
        setDialogTechLeads(
          Array.isArray(techLeadsRes.techLeads) ? techLeadsRes.techLeads : [],
        );
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isTechLeadsDialogOpen, agentId]);

  const update = useCallback(
    <K extends keyof AgentPropertiesResponse>(
      docId: K,
      updater: (prev: AgentPropertiesResponse[K]) => AgentPropertiesResponse[K]
    ) => {
      setFormState((prev) => {
        if (!prev) return prev;
        return { ...prev, [docId]: updater(prev[docId]) };
      });
    },
    []
  );

  const handleVersionChange = useCallback(
    async (newVersion: string) => {
      if (!agentId) return;
      setSavingVersion(true);
      try {
        const r = await patchAgent(agentId, { version: newVersion });
        if (r.ok) {
          setAgentVersion(newVersion);
          toast.success(`Versión actualizada a ${newVersion}`);
          onAgentUpdated?.();
        } else {
          toast.error(r.error);
        }
      } finally {
        setSavingVersion(false);
      }
    },
    [agentId, onAgentUpdated],
  );

  const handleFirestoreDataModeChange = useCallback(
    async (value: "auto" | "testing" | "production") => {
      if (!agentId || value === firestoreDataMode) return;
      setSavingFirestoreDataMode(true);
      try {
        const r = await patchAgent(agentId, { firestoreDataMode: value });
        if (r.ok) {
          setFirestoreDataMode(value);
          toast.success("Uso de datos actualizado");
          await onAgentUpdated?.();
        } else {
          toast.error(r.error);
        }
      } finally {
        setSavingFirestoreDataMode(false);
      }
    },
    [agentId, firestoreDataMode, onAgentUpdated],
  );

  const handleSave = useCallback(async (): Promise<boolean> => {
    if (!agentId || !formState || !data) return false;
    const idsToSave = getPendingDocumentIds(formState, data);
    if (idsToSave.length === 0) return false;
    setSaving(true);
    try {
      let ok = true;
      for (const docId of idsToSave) {
        const payload = buildPartialPayloadForDocument(docId, formState, data);
        if (Object.keys(payload).length === 0) continue;
        const success = await updateTestingPropertyDocument(
          agentId,
          docId,
          payload,
        );
        if (!success) ok = false;
      }
      if (ok) {
        toast.success("Cambios guardados");
        await refetch({ silent: true });
        refetchDiff();
        await onAgentUpdated?.();
        return true;
      }
      return false;
    } finally {
      setSaving(false);
    }
  }, [agentId, formState, data, refetch, refetchDiff, onAgentUpdated]);

  const isEnabled = formState?.agent.enabled !== false;

  const handleToggleEnabled = useCallback(async (): Promise<boolean> => {
    if (!agentId || !formState) return false;
    const newEnabled = !isEnabled;
    setSaving(true);
    try {
      const success = await updateTestingPropertyDocument(
        agentId,
        "agent",
        { enabled: newEnabled },
      );
      if (success) {
        update("agent", (prev) => ({ ...prev, enabled: newEnabled }));
        void refetch({ silent: true });
        await onAgentUpdated?.();
        toast.success(newEnabled ? "Agente encendido" : "Agente apagado");
        return true;
      }
      return false;
    } finally {
      setSaving(false);
    }
  }, [agentId, formState, isEnabled, update, refetch, onAgentUpdated]);

  const pendingDocIds = useMemo(
    () => (data && formState ? getPendingDocumentIds(formState, data) : []),
    [formState, data]
  );

  const hasLocalChanges = pendingDocIds.length > 0;

  const propertiesDiff = useMemo(
    () => (diffData || []).filter((d) => d.collection === "properties"),
    [diffData]
  );

  const hasTestingProductionDiff = propertiesDiff.length > 0;
  const canTransfer = hasTestingProductionDiff && !isDiffLoading;

  const handleDiscardChanges = useCallback(() => {
    if (!data) return;
    const raw = JSON.parse(JSON.stringify(data)) as Record<string, unknown>;
    delete raw.in_commercial;
    delete raw.in_production;
    delete raw.primary_source;
    const next = raw as unknown as AgentPropertiesResponse;
    if (next.ai) {
      next.ai.model =
        next.ai.model ??
        (data.prompt?.model as string | undefined) ??
        DEFAULT_LLM_MODEL;
      next.ai.temperature =
        next.ai.temperature !== undefined && next.ai.temperature !== null
          ? Number(next.ai.temperature)
          : (data.prompt?.temperature !== undefined &&
            data.prompt?.temperature !== null
              ? Number(data.prompt.temperature)
              : getDefaultTemperatureForModel(next.ai.model ?? DEFAULT_LLM_MODEL));
    }
    next.limitation = {
      userLimitation: !!next.limitation?.userLimitation,
      allowedUsers: Array.isArray(next.limitation?.allowedUsers)
        ? next.limitation.allowedUsers
        : [],
    };
    setFormState(next);
    toast.success("Cambios descartados");
  }, [data]);

  const handleRevertDoc = useCallback(
    (docId: PropertyDocumentId) => {
      if (!data) return;
      setFormState((prev) => {
        if (!prev) return prev;
        const originalDoc = (data as unknown as Record<string, unknown>)[docId];
        const originalCopy = originalDoc
          ? (JSON.parse(JSON.stringify(originalDoc)) as AgentPropertiesResponse[PropertyDocumentId])
          : prev[docId];
        return { ...prev, [docId]: originalCopy };
      });
      toast.success(`"${DOCUMENT_LABELS[docId]}" restablecido`);
    },
    [data],
  );

  const handleDisableDialogOpenChange = useCallback((open: boolean) => {
    setIsDisableDialogOpen(open);
  }, []);

  const handleToggleClick = useCallback(() => {
    if (isEnabled) {
      setIsDisableDialogOpen(true);
      return;
    }
    void handleToggleEnabled();
  }, [isEnabled, handleToggleEnabled]);

  const growersByEmail = useMemo(() => {
    const byEmail = new Map<string, AgentGrowerRow>();
    for (const g of dialogGrowers) {
      const email = g.email.trim().toLowerCase();
      if (email) byEmail.set(email, { email, name: g.name });
    }
    return byEmail;
  }, [dialogGrowers]);

  const checkIsGrower = useCallback(
    (u: OrganizationUser) => {
      const email = u.email.trim().toLowerCase();
      if (growersByEmail.has(email)) return true;
      const name = u.name.trim().toLowerCase();
      if (!name) return false;
      for (const g of growersByEmail.values()) {
        if (g.name.trim().toLowerCase() === name) return true;
      }
      return false;
    },
    [growersByEmail],
  );

  const onCheckAddGrower = useCallback(
    async (orgUser: OrganizationUser) => {
      if (!agentId) return;
      if (checkIsGrower(orgUser)) return;
      const emailNorm = orgUser.email.trim().toLowerCase();
      setAddingGrowerUserId(orgUser.id);
      try {
        const displayName = orgUser.name.trim() || orgUser.email.trim();
        const result = await postAgentGrower(agentId, {
          email: orgUser.email.trim(),
          name: displayName,
        });
        if (!result.ok) {
          toast.error(result.error);
          return;
        }
        toast.success(`${displayName} agregado como grower`);
        const row: AgentGrowerRow = { email: emailNorm, name: displayName };
        setDialogGrowers((prev) =>
          prev.some((g) => g.email.trim().toLowerCase() === emailNorm)
            ? prev
            : [...prev, row],
        );
      } finally {
        setAddingGrowerUserId(null);
      }
    },
    [agentId, checkIsGrower],
  );

  const onUncheckRemoveGrower = useCallback(
    async (orgUser: OrganizationUser) => {
      if (!agentId) return;
      if (!checkIsGrower(orgUser)) return;
      const emailNorm = orgUser.email.trim().toLowerCase();
      setAddingGrowerUserId(orgUser.id);
      try {
        const result = await deleteAgentGrower(agentId, orgUser.email);
        if (!result.ok) {
          toast.error(result.error);
          return;
        }
        toast.success("Grower quitado");
        setDialogGrowers((prev) =>
          prev.filter((g) => g.email.trim().toLowerCase() !== emailNorm),
        );
      } finally {
        setAddingGrowerUserId(null);
      }
    },
    [agentId, checkIsGrower],
  );

  const techLeadsByEmail = useMemo(() => {
    const byEmail = new Map<string, AgentTechLeadRow>();
    for (const tl of dialogTechLeads) {
      const email = tl.email.trim().toLowerCase();
      if (email) byEmail.set(email, { email, name: tl.name });
    }
    return byEmail;
  }, [dialogTechLeads]);

  const checkIsTechLead = useCallback(
    (u: OrganizationUser) => {
      const email = u.email.trim().toLowerCase();
      if (techLeadsByEmail.has(email)) return true;
      const name = u.name.trim().toLowerCase();
      if (!name) return false;
      for (const tl of techLeadsByEmail.values()) {
        if (tl.name.trim().toLowerCase() === name) return true;
      }
      return false;
    },
    [techLeadsByEmail],
  );

  const onCheckAddTechLead = useCallback(
    async (orgUser: OrganizationUser) => {
      if (!agentId) return;
      if (checkIsTechLead(orgUser)) return;
      const emailNorm = orgUser.email.trim().toLowerCase();
      setAddingTechLeadUserId(orgUser.id);
      try {
        const displayName = orgUser.name.trim() || orgUser.email.trim();
        const result = await postAgentTechLead(agentId, {
          email: orgUser.email.trim(),
          name: displayName,
        });
        if (!result.ok) {
          toast.error(result.error);
          return;
        }
        toast.success(`${displayName} agregado como tech lead`);
        const row: AgentTechLeadRow = { email: emailNorm, name: displayName };
        setDialogTechLeads((prev) =>
          prev.some((tl) => tl.email.trim().toLowerCase() === emailNorm)
            ? prev
            : [...prev, row],
        );
      } finally {
        setAddingTechLeadUserId(null);
      }
    },
    [agentId, checkIsTechLead],
  );

  const onUncheckRemoveTechLead = useCallback(
    async (orgUser: OrganizationUser) => {
      if (!agentId) return;
      if (!checkIsTechLead(orgUser)) return;
      const emailNorm = orgUser.email.trim().toLowerCase();
      setAddingTechLeadUserId(orgUser.id);
      try {
        const result = await deleteAgentTechLead(agentId, orgUser.email);
        if (!result.ok) {
          toast.error(result.error);
          return;
        }
        toast.success("Tech lead quitado");
        setDialogTechLeads((prev) =>
          prev.filter((tl) => tl.email.trim().toLowerCase() !== emailNorm),
        );
      } finally {
        setAddingTechLeadUserId(null);
      }
    },
    [agentId, checkIsTechLead],
  );

  const sortedOrgUsers = useMemo(() => {
    return [...orgUsers].sort((a, b) =>
      a.name.localeCompare(b.name, "es", { sensitivity: "base" }),
    );
  }, [orgUsers]);

  const growerPickerLoading = orgUsersLoading || dialogGrowersLoading;

  const openPullDialog = useCallback(() => {
    refetchDiff();
    setPullDialogOpen(true);
  }, [refetchDiff]);

  const openPromoteDialog = useCallback(() => {
    refetchDiff();
    setPromoteDialogOpen(true);
  }, [refetchDiff]);

  const handlePromoteSuccess = useCallback(async () => {
    await refetch({ silent: true });
    refetchDiff();
    onAgentUpdated?.();
    window.dispatchEvent(new Event("kai-agent-deployment-changed"));
  }, [refetch, refetchDiff, onAgentUpdated]);

  const handleSaveAllowedSchemas = useCallback(async () => {
    if (!agentId) return;
    setSavingAllowedSchemas(true);
    try {
      const res = await patchAgentAllowedDynamicTableSchemas(
        agentId,
        { schemaIds: selectedAllowedSchemaIds },
        DYNAMIC_SCHEMAS_API_ENV,
      );
      if (res.ok) {
        setSelectedAllowedSchemaIds(res.allowedSchemasIds);
        toast.success("Esquemas guardados");
        await onAgentUpdated?.();
      } else {
        toast.error(res.error);
      }
    } finally {
      setSavingAllowedSchemas(false);
    }
  }, [agentId, selectedAllowedSchemaIds, onAgentUpdated]);

  const isAdmin = userRole === "admin";
  const isTechLead = isAdmin || dialogTechLeads.some(
    (tl) => tl.email.trim().toLowerCase() === userEmail?.trim().toLowerCase()
  );
  const isGrower = !isTechLead && dialogGrowers.some(
    (g) => g.email.trim().toLowerCase() === userEmail?.trim().toLowerCase()
  );

  const showAllSections = isTechLead;
  const showGrowerSections = !isTechLead && (isGrower || isAdmin);
  const canSeeOperationalSettings = showAllSections || showGrowerSections;
  const normalizedSchemaSearch = schemaSearch.trim().toLowerCase();
  const filteredSchemas = useMemo(() => {
    return availableSchemas.filter((schema) => {
      const matchesSearch =
        normalizedSchemaSearch.length === 0 ||
        schema.label.toLowerCase().includes(normalizedSchemaSearch) ||
        schema.schemaId.toLowerCase().includes(normalizedSchemaSearch);
      if (!matchesSearch) return false;
      if (!showOnlySelectedSchemas) return true;
      return selectedAllowedSchemaIds.includes(schema.schemaId);
    });
  }, [availableSchemas, normalizedSchemaSearch, selectedAllowedSchemaIds, showOnlySelectedSchemas]);
  const schemasToRender = showAllSchemas ? filteredSchemas : filteredSchemas.slice(0, 8);
  const hiddenSchemasCount = Math.max(0, filteredSchemas.length - schemasToRender.length);

  if (!agentId) return null;

  const visibleSectionNav = [
    { id: "status", label: "Estado", visible: true },
    { id: "conversation", label: "Conversación", visible: canSeeOperationalSettings },
    { id: "ai", label: "IA", visible: showAllSections },
    { id: "memory", label: "Memoria", visible: canSeeOperationalSettings },
    { id: "access", label: "Acceso", visible: canSeeOperationalSettings },
    { id: "validation", label: "Validación", visible: canSeeOperationalSettings },
    {
      id: "dynamic-table-schemas",
      label: "Tablas dinámicas",
      visible: canSeeOperationalSettings,
    },
    { id: "runtime", label: "Horarios", visible: showAllSections },
    { id: "team", label: "Equipo", visible: true },
  ].filter((section) => section.visible);

  return (
    <div
      className="flex w-full min-h-0 flex-1 flex-col"
      role="region"
      aria-label="Configuración del agente"
    >
      {isLoading ? (
        <div className="flex flex-1 items-center justify-center py-16">
          <Loader2Icon className="size-8 animate-spin text-muted-foreground" />
        </div>
      ) : formState ? (
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="min-h-0 flex-1 overflow-y-auto">
            <div className="grid gap-6 px-1 pb-6 lg:grid-cols-[13rem_minmax(0,1fr)] lg:items-start">
              <ConfigurationSectionNav sections={visibleSectionNav} />
              <div className="min-w-0 space-y-6">
                <StatusSection
                  isEnabled={isEnabled}
                  agentVersion={agentVersion}
                  pendingDocumentsCount={pendingDocIds.length}
                  hasTestingProductionDiff={hasTestingProductionDiff}
                  saving={saving}
                  canDiscard={!!data && hasLocalChanges}
                  onToggleEnabled={handleToggleClick}
                  onDiscardChanges={handleDiscardChanges}
                />
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-2 xl:items-stretch">
          <div className="min-w-0 space-y-6">
              {/* Agent */}
              <section id="conversation" className="scroll-mt-24 space-y-4 rounded-2xl border bg-card/70 p-4 shadow-sm">
                <h3 className="text-sm font-semibold tracking-tight text-foreground">
                  {DOCUMENT_LABELS.agent}
                </h3>
                <div className="grid gap-3">
                  {(
                    [
                      "isAuthEnable",
                      "injectCommandsInPrompt",
                      "isMemoryEnable",
                      "isMultiMessageEnable",
                      "isMultiMessageResponseEnable",
                      "omitFirstEchoes",
                      "isValidatorAgentEnable",
                    ] as const
                  ).filter((key) => {
                    if (showAllSections) return true;
                    if (showGrowerSections) {
                      return ["injectCommandsInPrompt", "isMemoryEnable", "isValidatorAgentEnable"].includes(key);
                    }
                    return false;
                  }).map((key) => (
                    <div key={key} className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        id={`agent-${key}`}
                        checked={!!formState.agent[key]}
                        onChange={(e) =>
                          update("agent", (prev) => ({
                            ...prev,
                            [key]: e.target.checked,
                          }))
                        }
                        className="h-4 w-4 rounded border-input"
                      />
                      <FieldLabel docId="agent" fieldKey={key} id={`agent-${key}`} />
                    </div>
                  ))}
                  {showAllSections && (
                    <>
                  <div className="space-y-2">
                    <FieldLabel
                      docId="agent"
                      fieldKey="maxFunctionCalls"
                      id="agent-maxFunctionCalls"
                    />
                    <Input
                      id="agent-maxFunctionCalls"
                      type="number"
                      min={1}
                      max={8}
                      value={formState.agent.maxFunctionCalls ?? 4}
                      onChange={(e) => {
                        const v = parseInt(e.target.value, 10);
                        const clamped = Number.isFinite(v)
                          ? Math.min(8, Math.max(1, v))
                          : 4;
                        update("agent", (prev) => ({
                          ...prev,
                          maxFunctionCalls: clamped,
                        }));
                      }}
                    />
                  </div>
                  <div className="space-y-2">
                    <FieldLabel
                      docId="agent"
                      fieldKey="excludedNumbers"
                      id="agent-excludedNumbers"
                    />
                    <Textarea
                      id="agent-excludedNumbers"
                      value={(formState.agent.excludedNumbers ?? []).join("\n")}
                      onChange={(e) =>
                        update("agent", (prev) => ({
                          ...prev,
                          excludedNumbers: e.target.value
                            .split("\n")
                            .map((s) => s.trim())
                            .filter(Boolean),
                        }))
                      }
                      placeholder="Un número por línea"
                      rows={3}
                      className="font-mono text-sm"
                    />
                  </div>
                  <div className="space-y-2">
                    <div className="space-y-1">
                      <Label htmlFor="agent-version">Versión del agente</Label>
                      <p className="text-xs text-muted-foreground font-normal">
                        Selecciona la versión del agente. Cada versión puede tener comportamientos y features distintas.
                      </p>
                    </div>
                    <Select
                      value={agentVersion}
                      onValueChange={(value) => {
                        handleVersionChange(value);
                      }}
                      disabled={savingVersion}
                    >
                      <SelectTrigger id="agent-version" className="w-full">
                        <SelectValue placeholder="Selecciona la versión" />
                      </SelectTrigger>
                      <SelectContent>
                        {AGENT_VERSIONS.map((v) => (
                          <SelectItem key={v.value} value={v.value}>
                            <div className="flex flex-col gap-0.5">
                              <span>{v.label}</span>
                              <span className="text-xs text-muted-foreground font-normal">
                                {v.description}
                              </span>
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  {isAdmin && (
                    <div className="space-y-2">
                      <div className="space-y-1">
                        <Label htmlFor="agent-firestore-data-mode">
                          Datos que usará el agente
                        </Label>
                        <p className="text-xs text-muted-foreground font-normal">
                          Elige si el agente debe trabajar con datos de prueba, datos reales o decidirlo automáticamente.
                        </p>
                      </div>
                      <Select
                        value={firestoreDataMode}
                        onValueChange={(v) => {
                          void handleFirestoreDataModeChange(
                            v as "auto" | "testing" | "production",
                          );
                        }}
                        disabled={savingFirestoreDataMode}
                      >
                        <SelectTrigger
                          id="agent-firestore-data-mode"
                          className="w-full"
                        >
                          <SelectValue placeholder="Modo" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="auto">
                            <div className="flex flex-col gap-0.5">
                              <span>Automático (número de negocio de prueba)</span>
                              <span className="text-xs text-muted-foreground font-normal">
                                Los números de prueba usan datos de prueba; los demás usan datos reales.
                              </span>
                            </div>
                          </SelectItem>
                          <SelectItem value="testing">
                            <div className="flex flex-col gap-0.5">
                              <span>Siempre datos de prueba</span>
                              <span className="text-xs text-muted-foreground font-normal">
                                Útil para revisar cambios sin afectar conversaciones reales.
                              </span>
                            </div>
                          </SelectItem>
                          <SelectItem value="production">
                            <div className="flex flex-col gap-0.5">
                              <span>Siempre producción</span>
                              <span className="text-xs text-muted-foreground font-normal">
                                Úsalo cuando quieras que todos vean el comportamiento publicado.
                              </span>
                            </div>
                          </SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                    </>
                  )}
                </div>
              </section>

              {/* Limitación: lista blanca (MCP-KAI-AGENTS properties/limitation) */}
              {(showAllSections || showGrowerSections) && (
              <section id="access" className="scroll-mt-24 space-y-4 rounded-2xl border bg-card/70 p-4 shadow-sm">
                <h3 className="text-sm font-semibold tracking-tight text-foreground">
                  {DOCUMENT_LABELS.limitation}
                </h3>
                <div className="grid gap-3">
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      id="limitation-userLimitation"
                      checked={!!formState.limitation.userLimitation}
                      onChange={(e) =>
                        update("limitation", (prev) => ({
                          ...prev,
                          userLimitation: e.target.checked,
                        }))
                      }
                      className="h-4 w-4 rounded border-input"
                    />
                    <FieldLabel
                      docId="limitation"
                      fieldKey="userLimitation"
                      id="limitation-userLimitation"
                    />
                  </div>
                  <div className="space-y-2">
                    <FieldLabel
                      docId="limitation"
                      fieldKey="allowedUsers"
                      id="limitation-allowedUsers"
                    />
                    <Textarea
                      id="limitation-allowedUsers"
                      value={(formState.limitation.allowedUsers ?? []).join("\n")}
                      onChange={(e) =>
                        update("limitation", (prev) => ({
                          ...prev,
                          allowedUsers: e.target.value
                            .split("\n")
                            .map((s) => s.trim())
                            .filter(Boolean),
                        }))
                      }
                      placeholder="Un número por línea"
                      rows={4}
                      className="font-mono text-sm"
                    />
                  </div>
                </div>
              </section>
              )}

              {/* Answer */}
              {(showAllSections || showGrowerSections) && (
              <section className="space-y-4 rounded-2xl border bg-card/70 p-4 shadow-sm">
                <h3 className="text-sm font-semibold tracking-tight text-foreground">
                  {DOCUMENT_LABELS.answer}
                </h3>
                <div className="space-y-2">
                  <FieldLabel docId="answer" fieldKey="notSupport" id="answer-notSupport" />
                  <Input
                    id="answer-notSupport"
                    value={formState.answer.notSupport ?? ""}
                    onChange={(e) =>
                      update("answer", (prev) => ({
                        ...prev,
                        notSupport: e.target.value,
                      }))
                    }
                    placeholder="Hola súper! Cómo te llamas?"
                  />
                </div>
              </section>
              )}

              {/* AI (thinking) - model and temperature are source of truth here */}
              {showAllSections && (
              <section id="ai" className="scroll-mt-24 space-y-4 rounded-2xl border bg-card/70 p-4 shadow-sm">
                <h3 className="text-sm font-semibold tracking-tight text-foreground">
                  {DOCUMENT_LABELS.ai}
                </h3>
                <div className="space-y-3">
                  <div className="space-y-2">
                    <FieldLabel
                      docId="ai"
                      fieldKey="model"
                      id="ai-model"
                    />
                    <Select
                      value={
                        formState.ai?.model &&
                        AGENT_LLM_MODELS.includes(
                          formState.ai.model as (typeof AGENT_LLM_MODELS)[number]
                        )
                          ? formState.ai.model
                          : DEFAULT_LLM_MODEL
                      }
                      onValueChange={(value) =>
                        update("ai", (prev) => ({ ...prev, model: value }))
                      }
                    >
                      <SelectTrigger id="ai-model" className="w-full">
                        <SelectValue placeholder="Selecciona el modelo" />
                      </SelectTrigger>
                      <SelectContent>
                        {AGENT_LLM_MODELS.map((modelId) => (
                          <SelectItem key={modelId} value={modelId}>
                            {modelId}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <FieldLabel
                      docId="ai"
                      fieldKey="temperature"
                      id="ai-temperature"
                    />
                    <Input
                      id="ai-temperature"
                      type="number"
                      min={0}
                      max={1}
                      step={0.05}
                      value={
                        formState.ai?.temperature !== undefined &&
                        formState.ai?.temperature !== null
                          ? Number(formState.ai.temperature)
                          : getDefaultTemperatureForModel(
                              formState.ai?.model ?? DEFAULT_LLM_MODEL
                            )
                      }
                      onChange={(e) => {
                        const v = parseFloat(e.target.value);
                        const defaultTemp = getDefaultTemperatureForModel(
                          formState.ai?.model ?? DEFAULT_LLM_MODEL
                        );
                        const clamped = Number.isFinite(v)
                          ? Math.min(1, Math.max(0, v))
                          : defaultTemp;
                        update("ai", (prev) => ({
                          ...prev,
                          temperature: clamped,
                        }));
                      }}
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      id="ai-thinking-includeThoughts"
                      checked={!!formState.ai?.thinking?.includeThoughts}
                      onChange={(e) =>
                        update("ai", (prev) => ({
                          ...prev,
                          thinking: {
                            budget: prev.thinking?.budget,
                            includeThoughts: e.target.checked,
                            level: prev.thinking?.level ?? "",
                          },
                        }))
                      }
                      className="h-4 w-4 rounded border-input"
                    />
                    <FieldLabel
                      docId="ai"
                      fieldKey="thinking.includeThoughts"
                      id="ai-thinking-includeThoughts"
                    />
                  </div>
                  <div className="space-y-2">
                    <FieldLabel
                      docId="ai"
                      fieldKey="thinking.level"
                      id="ai-thinking-level"
                    />
                    <Select
                      value={
                        formState.ai?.thinking?.level &&
                        ["minimal", "low", "medium", "high"].includes(
                          formState.ai.thinking.level
                        )
                          ? formState.ai.thinking.level
                          : "__none__"
                      }
                      onValueChange={(value) =>
                        update("ai", (prev) => ({
                          ...prev,
                          thinking: {
                            budget: prev.thinking?.budget,
                            includeThoughts: prev.thinking?.includeThoughts ?? false,
                            level: value === "__none__" ? "" : value,
                          },
                        }))
                      }
                    >
                      <SelectTrigger id="ai-thinking-level" className="w-full">
                        <SelectValue placeholder="Sin especificar" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">Sin especificar</SelectItem>
                        <SelectItem value="minimal">Minimal</SelectItem>
                        <SelectItem value="low">Low</SelectItem>
                        <SelectItem value="medium">Medium</SelectItem>
                        <SelectItem value="high">High</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <FieldLabel
                      docId="ai"
                      fieldKey="thinking.budget"
                      id="ai-thinking-budget"
                    />
                    <Input
                      id="ai-thinking-budget"
                      type="number"
                      min={-1}
                      value={
                        formState.ai?.thinking?.budget !== undefined &&
                        formState.ai?.thinking?.budget !== null
                          ? formState.ai.thinking.budget
                          : ""
                      }
                      onChange={(e) => {
                        const raw = e.target.value;
                        if (raw === "" || raw === null || raw === undefined) {
                          update("ai", (prev) => ({
                            ...prev,
                            thinking: {
                              budget: undefined,
                              includeThoughts: prev.thinking?.includeThoughts ?? false,
                              level: prev.thinking?.level ?? "",
                            },
                          }));
                          return;
                        }
                        const v = parseInt(raw, 10);
                        const budget = Number.isFinite(v) ? v : undefined;
                        update("ai", (prev) => ({
                          ...prev,
                          thinking: {
                            budget,
                            includeThoughts: prev.thinking?.includeThoughts ?? false,
                            level: prev.thinking?.level ?? "",
                          },
                        }));
                      }}
                      placeholder="-1 = automático, 0 = apagado, número positivo = más razonamiento"
                    />
                    <p className="text-xs text-muted-foreground">
                      0 = apagado, -1 = automático, número positivo = más espacio para razonar
                    </p>
                  </div>
                </div>
              </section>
              )}

              {/* Response */}
              {(showAllSections || showGrowerSections) && (
              <section className="space-y-4 rounded-2xl border bg-card/70 p-4 shadow-sm">
                <h3 className="text-sm font-semibold tracking-tight text-foreground">
                  {DOCUMENT_LABELS.response}
                </h3>
                <div className="space-y-3">
                  <div className="space-y-2">
                    <FieldLabel docId="response" fieldKey="waitTime" id="response-waitTime" />
                    <Input
                      id="response-waitTime"
                      type="number"
                      min={0}
                      value={formState.response.waitTime ?? 3}
                      onChange={(e) =>
                        update("response", (prev) => ({
                          ...prev,
                          waitTime: parseInt(e.target.value, 10) || 0,
                        }))
                      }
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      id="response-maxResponseLinesEnabled"
                      checked={!!formState.response.maxResponseLinesEnabled}
                      onChange={(e) =>
                        update("response", (prev) => ({
                          ...prev,
                          maxResponseLinesEnabled: e.target.checked,
                        }))
                      }
                      className="h-4 w-4 rounded border-input"
                    />
                    <FieldLabel
                      docId="response"
                      fieldKey="maxResponseLinesEnabled"
                      id="response-maxResponseLinesEnabled"
                    />
                  </div>
                  {formState.response.maxResponseLinesEnabled && (
                    <div className="space-y-2">
                      <FieldLabel
                        docId="response"
                        fieldKey="maxResponseLines"
                        id="response-maxResponseLines"
                      />
                      <Input
                        id="response-maxResponseLines"
                        type="number"
                        min={1}
                        value={formState.response.maxResponseLines ?? 50}
                        onChange={(e) =>
                          update("response", (prev) => ({
                            ...prev,
                            maxResponseLines: Math.max(
                              1,
                              parseInt(e.target.value, 10) || 50
                            ),
                          }))
                        }
                      />
                    </div>
                  )}
                </div>
              </section>
              )}
          </div>
          <div className="min-w-0 space-y-6 border-t border-border pt-12 lg:border-t-0 lg:border-l lg:border-border lg:pt-0 lg:pl-8">
              {/* Time */}
              {showAllSections && (
              <section id="runtime" className="scroll-mt-24 space-y-4 rounded-2xl border bg-card/70 p-4 shadow-sm">
                <h3 className="text-sm font-semibold tracking-tight text-foreground">
                  {DOCUMENT_LABELS.time}
                </h3>
                <div className="space-y-2">
                  <FieldLabel docId="time" fieldKey="zone" id="time-zone" />
                  <Input
                    id="time-zone"
                    value={formState.time.zone ?? ""}
                    onChange={(e) =>
                      update("time", (prev) => ({ ...prev, zone: e.target.value }))
                    }
                    placeholder="America/Mexico_City"
                  />
                </div>
                <div className="space-y-2">
                  <FieldLabel docId="time" fieldKey="echoesWaitMinutes" id="time-echoesWaitMinutes" />
                  <Input
                    id="time-echoesWaitMinutes"
                    type="number"
                    min={0}
                    value={formState.time.echoesWaitMinutes ?? 480}
                    onChange={(e) =>
                      update("time", (prev) => ({
                        ...prev,
                        echoesWaitMinutes: parseInt(e.target.value, 10) || 0,
                      }))
                    }
                  />
                </div>
              </section>
              )}

              {/* Prompt */}
              {showAllSections && (
              <section className="space-y-4 rounded-2xl border bg-card/70 p-4 shadow-sm">
                <h3 className="text-sm font-semibold tracking-tight text-foreground">
                  {DOCUMENT_LABELS.prompt}
                </h3>
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      id="prompt-isMultiFunctionCallingEnable"
                      checked={!!formState.prompt.isMultiFunctionCallingEnable}
                      onChange={(e) =>
                        update("prompt", (prev) => ({
                          ...prev,
                          isMultiFunctionCallingEnable: e.target.checked,
                        }))
                      }
                      className="h-4 w-4 rounded border-input"
                    />
                    <FieldLabel
                      docId="prompt"
                      fieldKey="isMultiFunctionCallingEnable"
                      id="prompt-isMultiFunctionCallingEnable"
                    />
                  </div>
                </div>
              </section>
              )}

              {/* Memory */}
              {(showAllSections || showGrowerSections) && (
              <section id="memory" className="scroll-mt-24 space-y-4 rounded-2xl border bg-card/70 p-4 shadow-sm">
                <h3 className="text-sm font-semibold tracking-tight text-foreground">
                  {DOCUMENT_LABELS.memory}
                </h3>
                <div className="space-y-2">
                  <FieldLabel docId="memory" fieldKey="limit" id="memory-limit" />
                  <Input
                    id="memory-limit"
                    type="number"
                    min={0}
                    value={formState.memory.limit ?? 15}
                    onChange={(e) =>
                      update("memory", (prev) => ({
                        ...prev,
                        limit: parseInt(e.target.value, 10) || 0,
                      }))
                    }
                  />
                </div>
              </section>
              )}

              {/* MCP (Validador) - solo editable si isValidatorAgentEnable está activo */}
              {(showAllSections || showGrowerSections) && (
              <section
                id="validation"
                className={cn(
                  "scroll-mt-24 space-y-4 rounded-2xl border bg-card/70 p-4 shadow-sm",
                  !formState.agent.isValidatorAgentEnable && "opacity-60",
                )}
              >
                <h3 className="text-sm font-semibold tracking-tight text-foreground">
                  {DOCUMENT_LABELS.mcp}
                </h3>
                <div className="space-y-2">
                  <FieldLabel docId="mcp" fieldKey="maxRetries" id="mcp-maxRetries" />
                  <Input
                    id="mcp-maxRetries"
                    type="number"
                    min={0}
                    value={formState.mcp.maxRetries ?? 1}
                    onChange={(e) =>
                      update("mcp", (prev) => ({
                        ...prev,
                        maxRetries: Math.max(0, parseInt(e.target.value, 10) || 0),
                      }))
                    }
                    disabled={!formState.agent.isValidatorAgentEnable}
                    aria-describedby={
                      !formState.agent.isValidatorAgentEnable
                        ? "mcp-maxRetries-hint"
                        : undefined
                    }
                  />
                  {!formState.agent.isValidatorAgentEnable && (
                    <p id="mcp-maxRetries-hint" className="text-xs text-muted-foreground">
                      Activa el agente validador en &quot;Comportamiento general&quot; para editar este valor.
                    </p>
                  )}
                </div>
                {showAllSections && (
                  <div className="space-y-2">
                    <FieldLabel docId="mcp" fieldKey="toolsMcpEndpoint" id="mcp-toolsMcpEndpoint" />
                    <Select
                      value={formState.mcp.toolsMcpEndpoint ?? "default"}
                      onValueChange={(value) =>
                        update("mcp", (prev) => ({
                          ...prev,
                          toolsMcpEndpoint: value,
                        }))
                      }
                    >
                      <SelectTrigger id="mcp-toolsMcpEndpoint" className="w-full">
                        <SelectValue placeholder="Selecciona el ambiente" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="default">Automático</SelectItem>
                        <SelectItem value="production">Datos reales</SelectItem>
                        <SelectItem value="testing">Datos de prueba</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </section>
              )}

              {/* Esquemas de tablas dinámicas (después de Revisión de respuestas) */}
              {canSeeOperationalSettings && (
                <section
                  id="dynamic-table-schemas"
                  className="scroll-mt-24 space-y-4 rounded-2xl border bg-card/70 p-4 shadow-sm"
                >
                  <h3 className="text-sm font-semibold tracking-tight text-foreground">
                    Esquemas de tablas dinámicas
                  </h3>
                  <p className="text-xs text-muted-foreground">
                    Los esquemas se cargan desde el proyecto KAI (productividad), no desde el asistente
                    comercial. Solo puedes asignar esquemas que existan en esa base.
                  </p>
                  <div className="flex w-full flex-col gap-2 sm:flex-row sm:items-center">
                    <Input
                      placeholder="Buscar por nombre o ID…"
                      value={schemaSearch}
                      onChange={(e) => {
                        setSchemaSearch(e.target.value);
                        setShowAllSchemas(false);
                      }}
                      className="w-full flex-1"
                    />
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            type="button"
                            size="sm"
                            variant={showOnlySelectedSchemas ? "default" : "outline"}
                            className="h-8 w-8 shrink-0 px-0"
                            onClick={() => {
                              setShowOnlySelectedSchemas((prev) => !prev);
                              setShowAllSchemas(false);
                            }}
                            aria-label="Alternar filtro de esquemas seleccionados"
                          >
                            <FunnelIcon className="size-4" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent side="top" sideOffset={8}>
                          {showOnlySelectedSchemas
                            ? "Mostrar todos los esquemas"
                            : "Mostrar solo los esquemas seleccionados"}
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </div>
                  {schemasListError ? (
                    <p className="text-sm text-destructive">{schemasListError}</p>
                  ) : schemasLoading ? (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Loader2Icon className="size-4 animate-spin" />
                      Cargando esquemas…
                    </div>
                  ) : availableSchemas.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      No hay esquemas en este ambiente. Créalos en Base de datos → Esquemas.
                    </p>
                  ) : filteredSchemas.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      No hay esquemas que coincidan con el filtro actual.
                    </p>
                  ) : (
                    <>
                      <ul className="max-h-64 space-y-2 overflow-y-auto pr-1">
                        {schemasToRender.map((schema) => {
                          const checked = selectedAllowedSchemaIds.includes(schema.schemaId);
                          return (
                            <li key={schema.schemaId} className="flex items-start gap-2">
                              <input
                                type="checkbox"
                                id={`allowed-schema-${schema.schemaId}`}
                                checked={checked}
                                onChange={(e) => {
                                  const on = e.target.checked;
                                  setSelectedAllowedSchemaIds((prev) =>
                                    on
                                      ? prev.includes(schema.schemaId)
                                        ? prev
                                        : [...prev, schema.schemaId]
                                      : prev.filter((id) => id !== schema.schemaId),
                                  );
                                }}
                                className="mt-0.5 h-4 w-4 rounded border-input"
                              />
                              <label
                                htmlFor={`allowed-schema-${schema.schemaId}`}
                                className="cursor-pointer text-sm leading-snug"
                              >
                                <span className="font-medium">{schema.label}</span>
                                <span className="ml-2 font-mono text-xs text-muted-foreground">
                                  {schema.schemaId}
                                </span>
                              </label>
                            </li>
                          );
                        })}
                      </ul>
                      {hiddenSchemasCount > 0 && (
                        <div className="pt-1">
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={() => setShowAllSchemas((prev) => !prev)}
                          >
                            {showAllSchemas ? "Ver menos" : `Ver ${hiddenSchemasCount} más`}
                          </Button>
                        </div>
                      )}
                    </>
                  )}
                  <div className="border-t border-border pt-4">
                    <div className="flex justify-end">
                      <Button
                        type="button"
                        size="sm"
                        onClick={() => void handleSaveAllowedSchemas()}
                        disabled={savingAllowedSchemas || schemasLoading}
                      >
                        {savingAllowedSchemas ? (
                          <>
                            <Loader2Icon className="mr-2 size-4 animate-spin" />
                            Guardando…
                          </>
                        ) : (
                          "Guardar esquemas"
                        )}
                      </Button>
                    </div>
                  </div>
                </section>
              )}
          </div>
        </div>
                <TeamSection
                  growersCount={dialogGrowers.length}
                  techLeadsCount={dialogTechLeads.length}
                  showTechLeads={showAllSections}
                  saving={saving}
                  onManageGrowers={() => setIsGrowersDialogOpen(true)}
                  onManageTechLeads={() => setIsTechLeadsDialogOpen(true)}
                />
              </div>
            </div>
          </div>
          <ConfigurationActionsBar
            hasLocalChanges={hasLocalChanges}
            pendingDocumentsCount={pendingDocIds.length}
            canTransfer={canTransfer}
            saving={saving}
            syncingFromProd={syncingFromProd}
            hasData={!!data}
            onOpenPull={openPullDialog}
            onOpenPromote={openPromoteDialog}
            onOpenLocalChanges={() => setLocalPendingDialogOpen(true)}
          />
          <PromoteDiffDialog
            open={promoteDialogOpen}
            onOpenChange={setPromoteDialogOpen}
            diff={propertiesDiff}
            isLoading={isDiffLoading}
            agentId={agentId}
            agentNameForConfirm={agentNameForConfirm}
            onSuccess={handlePromoteSuccess}
            dialogTitle="Subir cambios de configuración"
            dialogDescription={
              <>
                Solo se publican los cambios de configuración que selecciones desde lo que ya está
                guardado en pruebas. No incluye cambios que todavía no guardaste en este formulario. Escribe{" "}
                <span className="font-medium text-foreground">CONFIRMAR</span> para continuar.
              </>
            }
            contentClassName="max-h-[min(90vh,48rem)] overflow-y-auto sm:max-w-3xl"
          />
          <ToolsPullFromProductionDialog
            open={pullDialogOpen}
            onOpenChange={setPullDialogOpen}
            diff={propertiesDiff}
            isLoading={isDiffLoading}
            agentId={agentId}
            syncing={syncingFromProd}
            onSyncingChange={setSyncingFromProd}
            onSuccess={handlePromoteSuccess}
            diffPreviewLabel="configuración"
          />
          <Dialog open={localPendingDialogOpen} onOpenChange={setLocalPendingDialogOpen}>
            <DialogContent className="max-h-[min(90vh,36rem)] sm:max-w-xl" showClose>
              <DialogHeader>
                <DialogTitle>Cambios pendientes de guardar</DialogTitle>
                <DialogDescription>
                  Estos cambios todavía no están guardados. Pulsa Guardar para aplicarlos en pruebas.
                </DialogDescription>
              </DialogHeader>
              {data ? (
                <>
                  <PendingLocalChangesList
                    formState={formState}
                    originalData={data}
                    onRevertDoc={handleRevertDoc}
                  />
                </>
              ) : null}
              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setLocalPendingDialogOpen(false)}
                  disabled={saving}
                >
                  Cerrar
                </Button>
                <Button
                  type="button"
                  disabled={!hasLocalChanges || saving || !data}
                  onClick={() =>
                    void (async () => {
                      const ok = await handleSave();
                      if (ok) setLocalPendingDialogOpen(false);
                    })()
                  }
                >
                  {saving ? (
                    <>
                      <Loader2Icon className="mr-2 h-4 w-4 animate-spin" />
                      Guardando…
                    </>
                  ) : (
                    "Guardar cambios"
                  )}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
          <ConfirmTextDialog
            open={isDisableDialogOpen}
            onOpenChange={handleDisableDialogOpenChange}
            title="Confirmar apagado del agente"
            description="Para apagar el agente, escribe la palabra de confirmación."
            confirmWord="CONFIRMAR"
            confirmText="Apagar agente"
            saving={saving}
            isDangerous
            onConfirm={async () => {
              await handleToggleEnabled();
            }}
          />
          <OrgUserPickerDialog
            open={isGrowersDialogOpen}
            onOpenChange={(open) => {
              setIsGrowersDialogOpen(open);
              if (!open) setAddingGrowerUserId(null);
            }}
            title="Gestionar growers"
            description="Marca a las personas que podrán apoyar con la operación del agente. Desmarca a quien quieras quitar."
            users={sortedOrgUsers}
            isLoading={growerPickerLoading}
            checkIsAssigned={checkIsGrower}
            onAdd={onCheckAddGrower}
            onRemove={onUncheckRemoveGrower}
            addingUserId={addingGrowerUserId}
          />
          <OrgUserPickerDialog
            open={isTechLeadsDialogOpen}
            onOpenChange={(open) => {
              setIsTechLeadsDialogOpen(open);
              if (!open) setAddingTechLeadUserId(null);
            }}
            title="Gestionar tech leads"
            description="Marca a las personas que podrán revisar y ajustar toda la configuración. Una persona no puede estar en ambos grupos al mismo tiempo."
            users={sortedOrgUsers}
            isLoading={dialogTechLeadsLoading}
            checkIsAssigned={checkIsTechLead}
            onAdd={onCheckAddTechLead}
            onRemove={onUncheckRemoveTechLead}
            addingUserId={addingTechLeadUserId}
            renderUserMeta={(u) => {
              const alreadyGrower = dialogGrowers.some(
                (g) => g.email.trim().toLowerCase() === u.email.trim().toLowerCase()
              );
              if (alreadyGrower) {
                return <span className="text-amber-600">grower</span>;
              }
              return null;
            }}
          />
        </div>
      ) : null}
    </div>
  );
}
