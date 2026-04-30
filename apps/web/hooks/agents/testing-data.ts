import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import {
  fetchTestingDataCollections,
  fetchTestingDataDocuments,
  fetchTestingDataDocument,
  fetchTestingDataSubcollections,
  createTestingDataDocument,
  updateTestingDataDocument,
  deleteTestingDataDocument,
  type TestingDataDocument,
} from "@/services/agents-api";
import type { CollectionNode, DocField, FieldDisplay, NestedDialogState } from "@/components/agents/testing-data/types";
import {
  docToFields,
  fieldsToDoc,
  generateRandomDocId,
  getValueType,
  parseJsonToFields,
  coerceNestedArrayFromSavePayload,
} from "@/components/agents/testing-data/helpers";

export function useTestingData(
  agentId: string,
  options: { onDataChanged?: () => void } = {},
) {
  const { onDataChanged } = options;
  const [collectionTree, setCollectionTree] = useState<CollectionNode[]>([]);
  const [breadcrumbs, setBreadcrumbs] = useState<string[]>([]);
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(new Set());
  /** Evita un frame con árbol vacío antes del primer `loadCollectionTree` (useEffect). */
  const [loading, setLoading] = useState(() => Boolean(agentId));

  const [documents, setDocuments] = useState<TestingDataDocument[]>([]);
  const [selectedDoc, setSelectedDoc] = useState<TestingDataDocument | null>(null);
  const [fields, setFields] = useState<FieldDisplay[]>([]);
  const [loadingDocs, setLoadingDocs] = useState(false);

  const [createCollectionDialogOpen, setCreateCollectionDialogOpen] = useState(false);
  const [newCollectionName, setNewCollectionName] = useState("");
  const [createDocDialogOpen, setCreateDocDialogOpen] = useState(false);
  const [editDocDialogOpen, setEditDocDialogOpen] = useState(false);
  const [deleteDocDialogOpen, setDeleteDocDialogOpen] = useState(false);
  const [docFields, setDocFields] = useState<DocField[]>([{ key: "", value: "", type: "string" }]);
  const [newDocId, setNewDocId] = useState("");
  const [jsonError, setJsonError] = useState<string | null>(null);
  const [docIdError, setDocIdError] = useState<string | null>(null);
  const [nestedDialog, setNestedDialog] = useState<NestedDialogState | null>(null);

  const currentCollection = breadcrumbs[breadcrumbs.length - 1];
  const currentPath = breadcrumbs.join("/");

  // --- Collection tree ---

  const loadCollectionTree = useCallback(async () => {
    if (!agentId) return;
    setLoading(true);
    try {
      const data = await fetchTestingDataCollections(agentId);
      if (data?.collections) {
        setCollectionTree(
          data.collections.map((name) => ({ name, subcollections: [], expanded: false })),
        );
      }
    } finally {
      setLoading(false);
    }
  }, [agentId]);

  const toggleExpand = useCallback(async (path: string) => {
    setExpandedPaths((prev) => {
      const next = new Set(prev);
      if (next.has(path)) { next.delete(path); return next; }
      next.add(path);
      return next;
    });

    // Lazy-load subcollections on first expand
    const parts = path.split("/");
    const data = parts.length === 1
      ? await fetchTestingDataSubcollections(agentId, parts[0])
      : await fetchTestingDataSubcollections(agentId, path);

    if (!data?.collections?.length) return;

    const children: CollectionNode[] = data.collections.map((name) => ({
      name,
      subcollections: [],
      expanded: false,
    }));

    const inject = (nodes: CollectionNode[], depth: number): CollectionNode[] =>
      nodes.map((node) => {
        if (node.name !== parts[depth]) return node;
        if (depth === parts.length - 1) return { ...node, subcollections: children };
        return { ...node, subcollections: inject(node.subcollections, depth + 1) };
      });

    setCollectionTree((prev) => inject(prev, 0));
  }, [agentId]);

  const navigateToCollection = useCallback((path: string) => {
    setBreadcrumbs(path.split("/"));
  }, []);

  const navigateBack = useCallback(() => {
    setBreadcrumbs((prev) => (prev.length > 1 ? prev.slice(0, -1) : []));
  }, []);

  // --- Documents ---

  const loadDocuments = useCallback(async () => {
    if (!agentId || !currentCollection) return;
    setLoadingDocs(true);
    try {
      const data = await fetchTestingDataDocuments(agentId, currentCollection);
      if (data?.documents) setDocuments(data.documents);
    } finally {
      setLoadingDocs(false);
    }
  }, [agentId, currentCollection]);

  const loadDocument = useCallback(
    async (docId: string): Promise<TestingDataDocument | null> => {
      if (!agentId || !currentCollection) return null;
      return fetchTestingDataDocument(agentId, currentCollection, docId);
    },
    [agentId, currentCollection],
  );

  const handleSelectDocument = useCallback(async (doc: TestingDataDocument) => {
    const fullDoc = await loadDocument(doc.id);
    if (!fullDoc) return;
    setSelectedDoc(fullDoc);
    const parsed = parseJsonToFields(JSON.stringify(fullDoc.data, null, 2));
    if (parsed) setFields(parsed);
  }, [loadDocument]);

  const refreshCurrentCollection = useCallback(async () => {
    await loadDocuments();
    if (!selectedDoc) return;

    const updated = await loadDocument(selectedDoc.id);
    if (!updated) {
      setSelectedDoc(null);
      setFields([]);
      return;
    }

    setSelectedDoc(updated);
    const parsed = parseJsonToFields(JSON.stringify(updated.data, null, 2));
    if (parsed) setFields(parsed);
  }, [loadDocument, loadDocuments, selectedDoc]);

  // --- Effects ---

  useEffect(() => {
    if (agentId) void loadCollectionTree();
  }, [agentId, loadCollectionTree]);

  useEffect(() => {
    if (breadcrumbs.length === 0) {
      setDocuments([]);
      setSelectedDoc(null);
      setFields([]);
      return;
    }
    setSelectedDoc(null);
    setFields([]);
    void loadDocuments();
  }, [currentCollection]);  // eslint-disable-line react-hooks/exhaustive-deps

  // --- CRUD ---

  const handleCreateCollection = useCallback(() => {
    if (!newCollectionName.trim()) return;
    const newName = newCollectionName.trim();

    const inject = (nodes: CollectionNode[], parentKey: string): CollectionNode[] => {
      if (parentKey === "") {
        if (nodes.find((n) => n.name === newName)) return nodes;
        return [...nodes, { name: newName, subcollections: [], expanded: false }];
      }
      return nodes.map((node) => {
        if (node.name !== parentKey) return node;
        if (node.subcollections.find((n) => n.name === newName)) return node;
        return {
          ...node,
          subcollections: [...node.subcollections, { name: newName, subcollections: [], expanded: false }],
          expanded: true,
        };
      });
    };

    setCollectionTree((prev) => inject(prev, currentPath));
    if (currentPath) setExpandedPaths((prev) => new Set([...prev, currentPath]));
    setCreateCollectionDialogOpen(false);
    setNewCollectionName("");
    setBreadcrumbs((prev) => [...prev, newName]);
    setDocFields([{ key: "", value: "", type: "string" }]);
    setCreateDocDialogOpen(true);
  }, [newCollectionName, currentPath]);

  const handleCreateSubcollection = useCallback((parentPath: string) => {
    setBreadcrumbs(parentPath.split("/"));
    setCreateCollectionDialogOpen(true);
  }, []);

  const openCreateDoc = useCallback(() => {
    setDocFields([{ key: "", value: "", type: "string" }]);
    setNewDocId(generateRandomDocId());
    setJsonError(null);
    setDocIdError(null);
    setCreateDocDialogOpen(true);
  }, []);

  const openEditDoc = useCallback(() => {
    if (!selectedDoc) return;
    setDocFields(docToFields(selectedDoc.data));
    setJsonError(null);
    setEditDocDialogOpen(true);
  }, [selectedDoc]);

  const handleCreateDocument = useCallback(async () => {
    const trimmedDocId = newDocId.trim();
    if (!trimmedDocId) { setDocIdError("Ingresa un ID para el documento"); return; }

    const existing = await loadDocument(trimmedDocId);
    if (existing) {
      const message = `Ya existe un documento con el ID "${trimmedDocId}"`;
      setDocIdError(message);
      toast.error(message);
      return;
    }

    const data = fieldsToDoc(docFields);
    if (Object.keys(data).length === 0) { setJsonError("Debe tener al menos un campo"); return; }
    setDocIdError(null);
    setJsonError(null);

    const result = await createTestingDataDocument(agentId, currentCollection, { data, docId: trimmedDocId });
    if (result) {
      toast.success("Documento creado");
      setCreateDocDialogOpen(false);
      setDocFields([{ key: "", value: "", type: "string" }]);
      setNewDocId("");
      void loadDocuments();
      onDataChanged?.();
    } else {
      toast.error("Error al crear documento");
    }
  }, [agentId, currentCollection, docFields, loadDocument, loadDocuments, newDocId, onDataChanged]);

  const handleUpdateDocument = useCallback(async () => {
    if (!selectedDoc) return;
    const data = fieldsToDoc(docFields);
    if (Object.keys(data).length === 0) { setJsonError("Debe tener al menos un campo"); return; }
    setJsonError(null);

    const result = await updateTestingDataDocument(agentId, currentCollection, selectedDoc.id, { data });
    if (result) {
      toast.success("Documento actualizado");
      setEditDocDialogOpen(false);
      const updated = await loadDocument(selectedDoc.id);
      if (updated) {
        setSelectedDoc(updated);
        const parsed = parseJsonToFields(JSON.stringify(updated.data, null, 2));
        if (parsed) setFields(parsed);
      }
      void loadDocuments();
      onDataChanged?.();
    } else {
      toast.error("Error al actualizar documento");
    }
  }, [agentId, currentCollection, docFields, loadDocument, loadDocuments, onDataChanged, selectedDoc]);

  const handleDeleteDocument = useCallback(async () => {
    if (!selectedDoc) return;
    const success = await deleteTestingDataDocument(agentId, currentCollection, selectedDoc.id);
    if (success) {
      toast.success("Documento eliminado");
      setDeleteDocDialogOpen(false);
      setSelectedDoc(null);
      setFields([]);
      void loadDocuments();
      onDataChanged?.();
    } else {
      toast.error("Error al eliminar documento");
    }
  }, [agentId, currentCollection, loadDocuments, onDataChanged, selectedDoc]);

  const handleEditNested = useCallback((key: string, value: unknown) => {
    if (typeof value !== "object" || value === null) return;
    if (Array.isArray(value)) {
      setNestedDialog({
        isOpen: true,
        parentKey: key,
        initialData: { _array: value.map((v, i) => ({ key: String(i), value: v, type: getValueType(v) })) },
        isArray: true,
      });
    } else {
      setNestedDialog({ isOpen: true, parentKey: key, initialData: value as Record<string, unknown>, isArray: false });
    }
  }, []);

  const handleSaveNested = useCallback((data: Record<string, unknown>) => {
    if (!nestedDialog) return;
    const isArrayEdit = "_array" in data;
    const newValue: unknown = isArrayEdit ? coerceNestedArrayFromSavePayload(data) : data;
    setDocFields((prev) =>
      prev.map((f) => f.key === nestedDialog.parentKey ? { ...f, value: newValue } : f),
    );
    setNestedDialog(null);
  }, [nestedDialog]);

  return {
    // Tree
    collectionTree, loading, expandedPaths,
    loadCollectionTree, toggleExpand, navigateToCollection, navigateBack,
    handleCreateCollection, handleCreateSubcollection,
    createCollectionDialogOpen, setCreateCollectionDialogOpen,
    newCollectionName, setNewCollectionName,
    // Documents
    breadcrumbs, documents, selectedDoc, fields, loadingDocs,
    currentCollection, currentPath,
    refreshCurrentCollection,
    handleSelectDocument,
    openCreateDoc, openEditDoc,
    handleCreateDocument, handleUpdateDocument, handleDeleteDocument,
    createDocDialogOpen, setCreateDocDialogOpen,
    editDocDialogOpen, setEditDocDialogOpen,
    deleteDocDialogOpen, setDeleteDocDialogOpen,
    docFields, setDocFields,
    newDocId, setNewDocId,
    jsonError, docIdError, setDocIdError,
    // Nested
    nestedDialog, setNestedDialog,
    handleEditNested, handleSaveNested,
  };
}
