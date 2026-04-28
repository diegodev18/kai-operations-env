import { useCallback, useEffect, useMemo, useState } from "react";
import { fetchDynamicTableSchemas } from "@/services/dynamic-table-schemas-api";
import { patchAgentAllowedDynamicTableSchemas } from "@/services/agents-api";
import type { DynamicTableSchemaDocument } from "@/types/dynamic-table-schema";

const DYNAMIC_SCHEMAS_API_ENV = "production" as const;

type SaveResult = { ok: true } | { ok: false; error: string };

export function useConfigurationEditorDynamicSchemas({
  agentId,
  onAgentUpdated,
}: {
  agentId: string;
  onAgentUpdated?: () => void | Promise<void>;
}) {
  const [availableSchemas, setAvailableSchemas] = useState<
    DynamicTableSchemaDocument[]
  >([]);
  const [schemasLoading, setSchemasLoading] = useState(false);
  const [schemasListError, setSchemasListError] = useState<string | null>(null);
  const [selectedAllowedSchemaIds, setSelectedAllowedSchemaIds] = useState<
    string[]
  >([]);
  const [savingAllowedSchemas, setSavingAllowedSchemas] = useState(false);
  const [schemaSearch, setSchemaSearch] = useState("");
  const [showOnlySelectedSchemas, setShowOnlySelectedSchemas] = useState(false);
  const [showAllSchemas, setShowAllSchemas] = useState(false);

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
  }, [
    availableSchemas,
    normalizedSchemaSearch,
    selectedAllowedSchemaIds,
    showOnlySelectedSchemas,
  ]);

  const schemasToRender = showAllSchemas
    ? filteredSchemas
    : filteredSchemas.slice(0, 8);
  const hiddenSchemasCount = Math.max(
    0,
    filteredSchemas.length - schemasToRender.length,
  );

  const toggleShowOnlySelectedSchemas = useCallback(() => {
    setShowOnlySelectedSchemas((prev) => !prev);
    setShowAllSchemas(false);
  }, []);

  const toggleShowAllSchemas = useCallback(() => {
    setShowAllSchemas((prev) => !prev);
  }, []);

  const onSchemaSearchChange = useCallback((value: string) => {
    setSchemaSearch(value);
    setShowAllSchemas(false);
  }, []);

  const toggleSchemaSelection = useCallback(
    (schemaId: string, checked: boolean) => {
      setSelectedAllowedSchemaIds((prev) =>
        checked
          ? prev.includes(schemaId)
            ? prev
            : [...prev, schemaId]
          : prev.filter((id) => id !== schemaId),
      );
    },
    [],
  );

  const saveAllowedSchemas = useCallback(async (): Promise<SaveResult> => {
    if (!agentId) return { ok: true };
    setSavingAllowedSchemas(true);
    try {
      const res = await patchAgentAllowedDynamicTableSchemas(
        agentId,
        { schemaIds: selectedAllowedSchemaIds },
        DYNAMIC_SCHEMAS_API_ENV,
      );
      if (res.ok) {
        setSelectedAllowedSchemaIds(res.allowedSchemaIds);
        await onAgentUpdated?.();
        return { ok: true };
      }
      return { ok: false, error: res.error };
    } finally {
      setSavingAllowedSchemas(false);
    }
  }, [agentId, selectedAllowedSchemaIds, onAgentUpdated]);

  return {
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
  };
}
