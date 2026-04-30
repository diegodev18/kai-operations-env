"use client";

import type { AgentPropertiesResponse, PropertyDocumentId } from "@/types";
import {
  useTestingProperties,
  updateTestingPropertyDocument,
  useConfigurationEditorDynamicSchemas,
  useConfigurationEditorTeamManagement,
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
import { Loader2Icon } from "lucide-react";
import { fetchAgentById, patchAgent } from "@/services/agents-api";
import { PromoteDiffDialog } from "@/components/prompt";
import { ToolsPullFromProductionDialog } from "@/components/agents/tools-pull-from-production-dialog";
import { ConfirmTextDialog, OrgUserPickerDialog } from "@/components/shared";
import {
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
import { ConversationSection } from "./configuration-editor/conversation-section";
import { AccessSection } from "./configuration-editor/access-section";
import { AiSection } from "./configuration-editor/ai-section";
import { MemorySection } from "./configuration-editor/memory-section";
import { ValidationSection } from "./configuration-editor/validation-section";
import { DynamicTableSchemasSection } from "./configuration-editor/dynamic-table-schemas-section";

export function AgentConfigurationEditor({
  agentId,
  onAgentUpdated,
}: {
  agentId: string;
  onAgentUpdated?: () => void;
}) {
  const {
    data,
    isLoading,
    error: testingPropertiesError,
    didAutoSync,
    refetch,
  } = useTestingProperties(agentId);
  const [formState, setFormState] = useState<AgentPropertiesResponse | null>(
    null,
  );
  const [saving, setSaving] = useState(false);
  const [agentNameForConfirm, setAgentNameForConfirm] = useState("");
  const [isDisableDialogOpen, setIsDisableDialogOpen] = useState(false);
  const [isGrowersDialogOpen, setIsGrowersDialogOpen] = useState(false);
  const [isTechLeadsDialogOpen, setIsTechLeadsDialogOpen] = useState(false);
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
  const {
    data: diffData,
    isLoading: isDiffLoading,
    refetch: refetchDiff,
  } = useTestingDiff(agentId);
  const {
    availableSchemas,
    schemasLoading,
    schemasListError,
    selectedAllowedSchemaIds,
    savingAllowedSchemas,
    schemaSearch,
    showOnlySelectedSchemas,
    showAllSchemas,
    filteredSchemas,
    schemasToRender,
    hiddenSchemasCount,
    setSelectedAllowedSchemaIds,
    onSchemaSearchChange,
    toggleShowOnlySelectedSchemas,
    toggleShowAllSchemas,
    toggleSchemaSelection,
    saveAllowedSchemas,
  } = useConfigurationEditorDynamicSchemas({
    agentId,
    onAgentUpdated,
  });
  const {
    userRole,
    userEmail,
    loadError: teamLoadError,
    setLoadError: setTeamLoadError,
    dialogGrowers,
    dialogTechLeads,
    sortedOrgUsers,
    growerPickerLoading,
    isTechLeadsLoading,
    addingGrowerUserId,
    addingTechLeadUserId,
    checkIsGrower,
    checkIsTechLead,
    addGrower,
    removeGrower,
    addTechLead,
    removeTechLead,
    setAddingGrowerUserId,
    setAddingTechLeadUserId,
  } = useConfigurationEditorTeamManagement({
    agentId,
    isGrowersDialogOpen,
    isTechLeadsDialogOpen,
  });

  useEffect(() => {
    if (testingPropertiesError) toast.error(testingPropertiesError);
  }, [testingPropertiesError]);

  useEffect(() => {
    if (didAutoSync) {
      toast.success("Datos sincronizados desde producción");
    }
  }, [didAutoSync]);

  useEffect(() => {
    if (!teamLoadError) return;
    toast.error(teamLoadError);
    setTeamLoadError(null);
  }, [teamLoadError, setTeamLoadError]);

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
            : data.prompt?.temperature !== undefined &&
                data.prompt?.temperature !== null
              ? Number(data.prompt.temperature)
              : getDefaultTemperatureForModel(
                  next.ai.model ?? DEFAULT_LLM_MODEL,
                );
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
      const ids = agent?.allowedSchemaIds ?? [];
      setSelectedAllowedSchemaIds(ids);
    })();
    return () => {
      cancelled = true;
    };
  }, [agentId, setSelectedAllowedSchemaIds]);

  const update = useCallback(
    <K extends keyof AgentPropertiesResponse>(
      docId: K,
      updater: (prev: AgentPropertiesResponse[K]) => AgentPropertiesResponse[K],
    ) => {
      setFormState((prev) => {
        if (!prev) return prev;
        return { ...prev, [docId]: updater(prev[docId]) };
      });
    },
    [],
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
      const success = await updateTestingPropertyDocument(agentId, "agent", {
        enabled: newEnabled,
      });
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
    [formState, data],
  );

  const hasLocalChanges = pendingDocIds.length > 0;

  const propertiesDiff = useMemo(
    () => (diffData || []).filter((d) => d.collection === "properties"),
    [diffData],
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
          : data.prompt?.temperature !== undefined &&
              data.prompt?.temperature !== null
            ? Number(data.prompt.temperature)
            : getDefaultTemperatureForModel(next.ai.model ?? DEFAULT_LLM_MODEL);
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
          ? (JSON.parse(
              JSON.stringify(originalDoc),
            ) as AgentPropertiesResponse[PropertyDocumentId])
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

  const onCheckAddGrower = useCallback(
    async (orgUser: Parameters<typeof addGrower>[0]) => {
      const result = await addGrower(orgUser);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(
        `${(orgUser.name ?? "").trim() || orgUser.email.trim()} agregado como grower`,
      );
    },
    [addGrower],
  );

  const onUncheckRemoveGrower = useCallback(
    async (orgUser: Parameters<typeof removeGrower>[0]) => {
      const result = await removeGrower(orgUser);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success("Grower quitado");
    },
    [removeGrower],
  );

  const onCheckAddTechLead = useCallback(
    async (orgUser: Parameters<typeof addTechLead>[0]) => {
      const result = await addTechLead(orgUser);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(
        `${(orgUser.name ?? "").trim() || orgUser.email.trim()} agregado como tech lead`,
      );
    },
    [addTechLead],
  );

  const onUncheckRemoveTechLead = useCallback(
    async (orgUser: Parameters<typeof removeTechLead>[0]) => {
      const result = await removeTechLead(orgUser);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success("Tech lead quitado");
    },
    [removeTechLead],
  );

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
    const result = await saveAllowedSchemas();
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success("Esquemas guardados");
  }, [saveAllowedSchemas]);

  const isAdmin = userRole === "admin";
  const isTechLead =
    isAdmin ||
    dialogTechLeads.some(
      (tl) => tl.email.trim().toLowerCase() === userEmail?.trim().toLowerCase(),
    );
  const isGrower =
    !isTechLead &&
    dialogGrowers.some(
      (g) => g.email.trim().toLowerCase() === userEmail?.trim().toLowerCase(),
    );

  const showAllSections = isTechLead;
  const showGrowerSections = !isTechLead && (isGrower || isAdmin);
  const canSeeOperationalSettings = showAllSections || showGrowerSections;
  if (!agentId) return null;

  const visibleSectionNav = [
    { id: "status", label: "Estado", visible: true },
    {
      id: "conversation",
      label: "Conversación",
      visible: canSeeOperationalSettings,
    },
    { id: "ai", label: "IA", visible: showAllSections },
    { id: "memory", label: "Memoria", visible: canSeeOperationalSettings },
    { id: "access", label: "Acceso", visible: canSeeOperationalSettings },
    {
      id: "validation",
      label: "Validación",
      visible: canSeeOperationalSettings,
    },
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
                    <ConversationSection
                      formState={formState}
                      showAllSections={showAllSections}
                      showGrowerSections={showGrowerSections}
                      isAdmin={isAdmin}
                      agentVersion={agentVersion}
                      savingVersion={savingVersion}
                      firestoreDataMode={firestoreDataMode}
                      savingFirestoreDataMode={savingFirestoreDataMode}
                      onVersionChange={handleVersionChange}
                      onFirestoreDataModeChange={handleFirestoreDataModeChange}
                      update={update}
                    />

                    {(showAllSections || showGrowerSections) && (
                      <AccessSection formState={formState} update={update} />
                    )}

                    {/* Answer */}
                    {(showAllSections || showGrowerSections) && (
                      <section className="space-y-4 rounded-2xl border bg-card/70 p-4 shadow-sm">
                        <h3 className="text-sm font-semibold tracking-tight text-foreground">
                          {DOCUMENT_LABELS.answer}
                        </h3>
                        <div className="space-y-2">
                          <FieldLabel
                            docId="answer"
                            fieldKey="notSupport"
                            id="answer-notSupport"
                          />
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

                    {showAllSections && (
                      <AiSection formState={formState} update={update} />
                    )}

                    {/* Response */}
                    {(showAllSections || showGrowerSections) && (
                      <section className="space-y-4 rounded-2xl border bg-card/70 p-4 shadow-sm">
                        <h3 className="text-sm font-semibold tracking-tight text-foreground">
                          {DOCUMENT_LABELS.response}
                        </h3>
                        <div className="space-y-3">
                          <div className="space-y-2">
                            <FieldLabel
                              docId="response"
                              fieldKey="waitTime"
                              id="response-waitTime"
                            />
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
                              checked={
                                !!formState.response.maxResponseLinesEnabled
                              }
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
                                value={
                                  formState.response.maxResponseLines ?? 50
                                }
                                onChange={(e) =>
                                  update("response", (prev) => ({
                                    ...prev,
                                    maxResponseLines: Math.max(
                                      1,
                                      parseInt(e.target.value, 10) || 50,
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
                      <section
                        id="runtime"
                        className="scroll-mt-24 space-y-4 rounded-2xl border bg-card/70 p-4 shadow-sm"
                      >
                        <h3 className="text-sm font-semibold tracking-tight text-foreground">
                          {DOCUMENT_LABELS.time}
                        </h3>
                        <div className="space-y-2">
                          <FieldLabel
                            docId="time"
                            fieldKey="zone"
                            id="time-zone"
                          />
                          <Input
                            id="time-zone"
                            value={formState.time.zone ?? ""}
                            onChange={(e) =>
                              update("time", (prev) => ({
                                ...prev,
                                zone: e.target.value,
                              }))
                            }
                            placeholder="America/Mexico_City"
                          />
                        </div>
                        <div className="space-y-2">
                          <FieldLabel
                            docId="time"
                            fieldKey="echoesWaitMinutes"
                            id="time-echoesWaitMinutes"
                          />
                          <Input
                            id="time-echoesWaitMinutes"
                            type="number"
                            min={0}
                            value={formState.time.echoesWaitMinutes ?? 480}
                            onChange={(e) =>
                              update("time", (prev) => ({
                                ...prev,
                                echoesWaitMinutes:
                                  parseInt(e.target.value, 10) || 0,
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
                              checked={
                                !!formState.prompt.isMultiFunctionCallingEnable
                              }
                              onChange={(e) =>
                                update("prompt", (prev) => ({
                                  ...prev,
                                  isMultiFunctionCallingEnable:
                                    e.target.checked,
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

                    {(showAllSections || showGrowerSections) && (
                      <MemorySection formState={formState} update={update} />
                    )}

                    {(showAllSections || showGrowerSections) && (
                      <ValidationSection
                        formState={formState}
                        showAllSections={showAllSections}
                        update={update}
                      />
                    )}

                    {canSeeOperationalSettings && (
                      <DynamicTableSchemasSection
                        schemaSearch={schemaSearch}
                        onSchemaSearchChange={onSchemaSearchChange}
                        showOnlySelectedSchemas={showOnlySelectedSchemas}
                        onToggleShowOnlySelectedSchemas={
                          toggleShowOnlySelectedSchemas
                        }
                        schemasListError={schemasListError}
                        schemasLoading={schemasLoading}
                        availableSchemas={availableSchemas}
                        filteredSchemas={filteredSchemas}
                        schemasToRender={schemasToRender}
                        hiddenSchemasCount={hiddenSchemasCount}
                        showAllSchemas={showAllSchemas}
                        selectedAllowedSchemaIds={selectedAllowedSchemaIds}
                        onToggleSchemaSelection={toggleSchemaSelection}
                        onToggleShowAllSchemas={toggleShowAllSchemas}
                        onSave={() => void handleSaveAllowedSchemas()}
                        savingAllowedSchemas={savingAllowedSchemas}
                      />
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
                Solo se publican los cambios de configuración que selecciones
                desde lo que ya está guardado en pruebas. No incluye cambios que
                todavía no guardaste en este formulario. Escribe{" "}
                <span className="font-medium text-foreground">CONFIRMAR</span>{" "}
                para continuar.
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
          <Dialog
            open={localPendingDialogOpen}
            onOpenChange={setLocalPendingDialogOpen}
          >
            <DialogContent
              className="max-h-[min(90vh,36rem)] sm:max-w-xl"
              showClose
            >
              <DialogHeader>
                <DialogTitle>Cambios pendientes de guardar</DialogTitle>
                <DialogDescription>
                  Estos cambios todavía no están guardados. Pulsa Guardar para
                  aplicarlos en pruebas.
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
            isLoading={isTechLeadsLoading}
            checkIsAssigned={checkIsTechLead}
            onAdd={onCheckAddTechLead}
            onRemove={onUncheckRemoveTechLead}
            addingUserId={addingTechLeadUserId}
            renderUserMeta={(u) => {
              const alreadyGrower = dialogGrowers.some(
                (g) =>
                  g.email.trim().toLowerCase() === u.email.trim().toLowerCase(),
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
