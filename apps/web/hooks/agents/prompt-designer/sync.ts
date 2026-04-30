import { useCallback, useEffect, useRef, useState } from "react";
import {
  fetchProductionPromptSnapshot,
  promotePromptToProduction as promotePromptApi,
  updateAgentPropertyDocument,
  updateTestingPropertyDocument,
} from "@/hooks";
import { toast } from "sonner";

function normalizePrompt(value: string | undefined): string {
  return typeof value === "string" ? value.trim() : "";
}

type PromptAuthBlock = {
  auth?: string;
  unauth?: string;
};

type PromptBlock = {
  base?: string;
  auth?: PromptAuthBlock;
  isMultiFunctionCallingEnable?: boolean;
  model?: string;
  temperature?: number | string | null;
};

type PromptProperties = {
  prompt?: PromptBlock;
} | null;

type ProductionPromptSnapshot = {
  prompt?: string;
  auth?: PromptAuthBlock;
} | null;

export function usePromptDesignerSync({
  agentId,
  agent,
  testingPropertiesData,
  productionPrompt,
  propertiesLoading,
  testingPropertiesLoading,
  loadingProductionPrompt,
  effectiveProperties,
  isAuthEnabled,
  refetchTestingProperties,
  refetchProductionPrompt,
  savedPrompt,
  savedAuthPrompt,
  savedUnauthPrompt,
  editingPrompt,
  editingAuthPrompt,
  editingUnauthPrompt,
  setSavedPrompt,
  setSavedAuthPrompt,
  setSavedUnauthPrompt,
  setEditingPrompt,
  setDiffViewRequested,
  setBaseMarkdownRemount,
}: {
  agentId: string;
  agent: { prompt?: string } | null;
  testingPropertiesData: PromptProperties;
  productionPrompt: ProductionPromptSnapshot;
  propertiesLoading: boolean;
  testingPropertiesLoading: boolean;
  loadingProductionPrompt: boolean;
  effectiveProperties: PromptProperties;
  isAuthEnabled: boolean;
  refetchTestingProperties: (opts?: { silent?: boolean }) => Promise<unknown> | void;
  refetchProductionPrompt: () => Promise<unknown> | void;
  savedPrompt: string;
  savedAuthPrompt: string;
  savedUnauthPrompt: string;
  editingPrompt: string;
  editingAuthPrompt: string;
  editingUnauthPrompt: string;
  setSavedPrompt: (value: string) => void;
  setSavedAuthPrompt: (value: string) => void;
  setSavedUnauthPrompt: (value: string) => void;
  setEditingPrompt: (value: string) => void;
  setDiffViewRequested: (value: boolean) => void;
  setBaseMarkdownRemount: (updater: (n: number) => number) => void;
}) {
  const [isSaving, setIsSaving] = useState(false);
  const [promoting, setPromoting] = useState(false);
  const [pullingProductionBase, setPullingProductionBase] = useState(false);
  const bootstrapAttemptedRef = useRef(false);

  useEffect(() => {
    if (!agentId || !agent) return;
    if (propertiesLoading || testingPropertiesLoading || loadingProductionPrompt) return;
    if (bootstrapAttemptedRef.current) return;

    const mcpPrompt = normalizePrompt(agent.prompt);
    if (!mcpPrompt) return;

    const testingBase = normalizePrompt(testingPropertiesData?.prompt?.base);
    const productionBase = normalizePrompt(productionPrompt?.prompt);
    if (testingBase || productionBase) return;

    bootstrapAttemptedRef.current = true;
    void (async () => {
      const [savedProd, savedTesting] = await Promise.all([
        updateAgentPropertyDocument(agentId, "prompt", { base: mcpPrompt }),
        updateTestingPropertyDocument(agentId, "prompt", { base: mcpPrompt }),
      ]);
      if (!savedProd || !savedTesting) {
        bootstrapAttemptedRef.current = false;
        return;
      }
      setSavedPrompt(mcpPrompt);
      setEditingPrompt(mcpPrompt);
      setDiffViewRequested(false);
      void Promise.all([refetchTestingProperties({ silent: true }), refetchProductionPrompt()]);
      toast.success("Prompt base inicializado en producción y testing.");
    })();
  }, [
    agentId,
    agent,
    propertiesLoading,
    testingPropertiesLoading,
    loadingProductionPrompt,
    testingPropertiesData,
    productionPrompt,
    refetchTestingProperties,
    refetchProductionPrompt,
    setSavedPrompt,
    setEditingPrompt,
    setDiffViewRequested,
  ]);

  const handleSave = useCallback(async () => {
    const hasChanges =
      editingPrompt !== savedPrompt ||
      (isAuthEnabled &&
        (editingAuthPrompt !== savedAuthPrompt || editingUnauthPrompt !== savedUnauthPrompt));
    if (!hasChanges) return;
    setIsSaving(true);
    let ok = true;
    if (editingPrompt !== savedPrompt) {
      const saved = await updateTestingPropertyDocument(agentId, "prompt", { base: editingPrompt });
      if (saved) setSavedPrompt(editingPrompt);
      else ok = false;
    }
    if (
      ok &&
      isAuthEnabled &&
      (editingAuthPrompt !== savedAuthPrompt || editingUnauthPrompt !== savedUnauthPrompt) &&
      effectiveProperties?.prompt
    ) {
      const payload = {
        auth: {
          auth: editingAuthPrompt,
          unauth: editingUnauthPrompt,
        },
        isMultiFunctionCallingEnable: effectiveProperties.prompt.isMultiFunctionCallingEnable,
        model: effectiveProperties.prompt.model ?? "gemini-2.5-flash",
        temperature:
          effectiveProperties.prompt.temperature !== undefined &&
          effectiveProperties.prompt.temperature !== null
            ? Number(effectiveProperties.prompt.temperature)
            : 0.4,
      };
      const saved = await updateTestingPropertyDocument(agentId, "prompt", payload);
      if (saved) {
        setSavedAuthPrompt(editingAuthPrompt);
        setSavedUnauthPrompt(editingUnauthPrompt);
      }
    }
    setIsSaving(false);
    if (ok) {
      setDiffViewRequested(false);
      void refetchTestingProperties({ silent: true });
    }
  }, [
    editingPrompt,
    savedPrompt,
    isAuthEnabled,
    editingAuthPrompt,
    savedAuthPrompt,
    editingUnauthPrompt,
    savedUnauthPrompt,
    agentId,
    effectiveProperties,
    setSavedPrompt,
    setSavedAuthPrompt,
    setSavedUnauthPrompt,
    setDiffViewRequested,
    refetchTestingProperties,
  ]);

  const executePullProductionBaseToTesting = useCallback(
    async (canTransfer: boolean, promptAndChatLocked: boolean, onClose: () => void) => {
      if (pullingProductionBase || promptAndChatLocked || !canTransfer) return;
      setPullingProductionBase(true);
      try {
        const snap = await fetchProductionPromptSnapshot(agentId);
        if (!snap) {
          toast.error("No se pudo leer el prompt de producción.");
          return;
        }
        const base = typeof snap.prompt === "string" ? snap.prompt : "";
        if (base.trim().length === 0) {
          toast.error("En producción el prompt principal está vacío.");
          return;
        }
        if (normalizePrompt(savedPrompt) === normalizePrompt(base)) {
          toast.info("El prompt en pruebas ya es el mismo que en producción.");
          return;
        }
        const patchOk = await updateTestingPropertyDocument(agentId, "prompt", { base });
        if (!patchOk) return;
        setEditingPrompt(base);
        setSavedPrompt(base);
        setDiffViewRequested(false);
        setBaseMarkdownRemount((n) => n + 1);
        void refetchTestingProperties({ silent: true });
        void refetchProductionPrompt();
        toast.success("Listo: el texto de producción quedó guardado en pruebas.");
        onClose();
      } finally {
        setPullingProductionBase(false);
      }
    },
    [
      pullingProductionBase,
      agentId,
      savedPrompt,
      setEditingPrompt,
      setSavedPrompt,
      setDiffViewRequested,
      setBaseMarkdownRemount,
      refetchTestingProperties,
      refetchProductionPrompt,
    ],
  );

  const executePromote = useCallback(
    async ({
      includeAuth,
      includeUnauth,
      onClose,
    }: {
      includeAuth: boolean;
      includeUnauth: boolean;
      onClose: () => void;
    }) => {
      setPromoting(true);
      try {
        const payload: { prompt: string; auth?: { auth: string; unauth: string } } = {
          prompt: savedPrompt,
        };
        if (isAuthEnabled && (includeAuth || includeUnauth || !productionPrompt?.auth)) {
          payload.auth = {
            auth: includeAuth ? savedAuthPrompt : (productionPrompt?.auth?.auth ?? savedAuthPrompt),
            unauth: includeUnauth
              ? savedUnauthPrompt
              : (productionPrompt?.auth?.unauth ?? savedUnauthPrompt),
          };
        }

        const ok = await promotePromptApi(agentId, {
          ...payload,
          confirmation_agent_name: "CONFIRMAR",
          expected_testing_prompt: savedPrompt,
        });
        if (!ok) return;

        const syncBody: Record<string, unknown> = { base: payload.prompt };
        if (payload.auth != null) {
          syncBody.auth = payload.auth;
          const ep = effectiveProperties?.prompt;
          if (ep) {
            syncBody.isMultiFunctionCallingEnable = ep.isMultiFunctionCallingEnable;
            syncBody.model = ep.model ?? "gemini-2.5-flash";
            syncBody.temperature =
              ep.temperature !== undefined && ep.temperature !== null ? Number(ep.temperature) : 0.4;
          }
        }
        const synced = await updateTestingPropertyDocument(agentId, "prompt", syncBody);
        if (!synced) {
          toast.error(
            "Producción actualizada, pero no se pudo sincronizar el borrador en testing. Guarda de nuevo el prompt.",
          );
        } else {
          setSavedPrompt(payload.prompt);
          if (isAuthEnabled) {
            setSavedAuthPrompt(payload.auth?.auth ?? savedAuthPrompt);
            setSavedUnauthPrompt(payload.auth?.unauth ?? savedUnauthPrompt);
          }
          void refetchTestingProperties({ silent: true });
          toast.success("Prompt subido a producción 🚀");
        }
        await refetchProductionPrompt();
        onClose();
      } finally {
        setPromoting(false);
      }
    },
    [
      savedPrompt,
      isAuthEnabled,
      productionPrompt?.auth,
      savedAuthPrompt,
      savedUnauthPrompt,
      agentId,
      effectiveProperties,
      setSavedPrompt,
      setSavedAuthPrompt,
      setSavedUnauthPrompt,
      refetchTestingProperties,
      refetchProductionPrompt,
    ],
  );

  return {
    isSaving,
    promoting,
    pullingProductionBase,
    handleSave,
    executePullProductionBaseToTesting,
    executePromote,
  };
}
