"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { AgentMissingFallback } from "@/components/agents";
import { useAgentIdParam } from "@/hooks";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import {
  Loader2Icon,
  PlusIcon,
  Trash2Icon,
  PencilIcon,
  FolderIcon,
  FolderOpenIcon,
  FileIcon,
  ChevronRightIcon,
  ChevronDownIcon,
  ChevronLeftIcon,
  DatabaseIcon,
  TableIcon,
  HashIcon,
  TypeIcon,
  ToggleLeftIcon,
  ListIcon,
  MapIcon,
  CalendarIcon,
  MapPinIcon,
  LinkIcon,
  XIcon,
} from "lucide-react";

function generateRandomDocId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

interface SerializedTimestamp {
  _seconds: number;
  _nanoseconds: number;
}

interface SerializedGeoPoint {
  _latitude: number;
  _longitude: number;
}

interface SerializedDocRef {
  _path: string;
}

type FieldValue = unknown;

interface FieldDisplay {
  key: string;
  value: FieldValue;
  type: "string" | "number" | "boolean" | "null" | "timestamp" | "geopoint" | "docref" | "array" | "object";
}

interface DocField {
  key: string;
  value: unknown;
  type: "string" | "number" | "boolean" | "null" | "object" | "array";
}

function getValueType(value: unknown): DocField["type"] {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  if (typeof value === "object") return "object";
  if (typeof value === "number") return "number";
  if (typeof value === "boolean") return "boolean";
  return "string";
}

function docToFields(doc: Record<string, unknown>): DocField[] {
  return Object.entries(doc).map(([key, value]) => ({
    key,
    value,
    type: getValueType(value),
  }));
}

function arrayToFields(arr: unknown[]): DocField[] {
  return arr.map((value, index) => ({
    key: String(index),
    value,
    type: getValueType(value),
  }));
}

function fieldsToDoc(fields: DocField[]): Record<string, unknown> {
  const doc: Record<string, unknown> = {};
  for (const field of fields) {
    if (!field.key.trim()) continue;
    doc[field.key.trim()] = field.value;
  }
  return doc;
}

/**
 * NestedDialog saves `{ _array: nestedFields.map((f) => f.value) }` (plain values).
 * Older code wrongly assumed each element was `{ value, type, key }` and used `.value` only,
 * which turned objects into `undefined` and threw on `null`.
 */
function isDocFieldRow(item: unknown): item is DocField {
  if (item === null || typeof item !== "object" || Array.isArray(item)) return false;
  const o = item as Record<string, unknown>;
  if (!("value" in o) || typeof o.type !== "string") return false;
  return ["string", "number", "boolean", "null", "object", "array"].includes(o.type);
}

function coerceNestedArrayFromSavePayload(data: Record<string, unknown>): unknown[] {
  const raw = data._array;
  if (!Array.isArray(raw)) return [];
  return raw.map((item) => (isDocFieldRow(item) ? item.value : item));
}

function normalizeArrayRowKeys(rows: DocField[]): DocField[] {
  return rows.map((f, i) => ({ ...f, key: String(i) }));
}

function FieldEditor({
  fields,
  onChange,
  onEditNested,
  mode = "object",
}: {
  fields: DocField[];
  onChange: (fields: DocField[]) => void;
  onEditNested: (key: string, value: unknown) => void;
  /** En `array`, la primera columna es el índice (solo lectura); solo los objetos usan claves con nombre. */
  mode?: "object" | "array";
}) {
  const isArrayMode = mode === "array";

  const addField = () => {
    if (isArrayMode) {
      const next = [...fields, { key: "", value: "", type: "string" as const }];
      onChange(normalizeArrayRowKeys(next));
      return;
    }
    onChange([...fields, { key: "", value: "", type: "string" }]);
  };

  const removeField = (index: number) => {
    const next = fields.filter((_, i) => i !== index);
    onChange(isArrayMode ? normalizeArrayRowKeys(next) : next);
  };

  const updateField = (index: number, updated: DocField) => {
    const newFields = [...fields];
    newFields[index] = isArrayMode ? { ...updated, key: String(index) } : updated;
    onChange(newFields);
  };

  const formatValue = (value: unknown, type: DocField["type"]): string => {
    if (type === "object") return `{${Object.keys(value as object).length} campos}`;
    if (type === "array") return `[${(value as unknown[]).length} items]`;
    if (value === null) return "null";
    return String(value);
  };

  return (
    <div className="space-y-2">
      {fields.map((field, index) => (
        <div key={index} className="flex gap-2 items-start">
          {isArrayMode ? (
            <div
              className="flex w-10 shrink-0 items-center justify-center rounded-md border bg-muted/50 px-1 py-2 text-sm font-mono text-muted-foreground"
              title="Índice del array"
            >
              {index}
            </div>
          ) : (
            <Input
              value={field.key}
              onChange={(e) => updateField(index, { ...field, key: e.target.value })}
              placeholder="Campo"
              className="w-40"
            />
          )}
          <Select
            value={field.type}
            onValueChange={(type: DocField["type"]) => {
              let value: unknown = field.value;
              if (type === "null") value = null;
              else if (type === "boolean") value = true;
              else if (type === "number") value = 0;
              else if (type === "object") value = {};
              else if (type === "array") value = [];
              else value = "";
              updateField(index, { ...field, type, value });
            }}
          >
            <SelectTrigger className="w-28">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="string">Texto</SelectItem>
              <SelectItem value="number">Número</SelectItem>
              <SelectItem value="boolean">Booleano</SelectItem>
              <SelectItem value="null">Nulo</SelectItem>
              <SelectItem value="object">Object</SelectItem>
              <SelectItem value="array">Array</SelectItem>
            </SelectContent>
          </Select>
          {field.type === "string" ? (
            <Input
              value={String(field.value ?? "")}
              onChange={(e) => updateField(index, { ...field, value: e.target.value })}
              placeholder="Valor"
              className="flex-1"
            />
          ) : field.type === "number" ? (
            <Input
              type="number"
              value={String(field.value ?? 0)}
              onChange={(e) => updateField(index, { ...field, value: parseFloat(e.target.value) || 0 })}
              placeholder="0"
              className="flex-1"
            />
          ) : field.type === "boolean" ? (
            <Select
              value={String(field.value ?? true)}
              onValueChange={(value) => updateField(index, { ...field, value: value === "true" })}
            >
              <SelectTrigger className="flex-1">
                <SelectValue placeholder="Seleccionar" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="true">true</SelectItem>
                <SelectItem value="false">false</SelectItem>
              </SelectContent>
            </Select>
          ) : field.type === "null" ? (
            <Input value="null" disabled className="flex-1 bg-muted" />
          ) : (
            <div className="flex-1 flex items-center gap-2">
              <Input
                value={formatValue(field.value, field.type)}
                disabled
                className="flex-1 bg-muted"
              />
              <Button
                variant="outline"
                size="icon"
                onClick={() => onEditNested(isArrayMode ? String(index) : field.key, field.value)}
              >
                <PencilIcon className="size-4" />
              </Button>
            </div>
          )}
          <Button variant="ghost" size="icon" className="size-9" onClick={() => removeField(index)}>
            <Trash2Icon className="size-4 text-destructive" />
          </Button>
        </div>
      ))}
      <Button variant="outline" size="sm" onClick={addField}>
        <PlusIcon className="size-4 mr-1" />
        {isArrayMode ? "Agregar elemento" : "Agregar campo"}
      </Button>
    </div>
  );
}

function NestedDialog({
  isOpen,
  onClose,
  onSave,
  initialData,
  isArray = false,
}: {
  isOpen: boolean;
  onClose: () => void;
  onSave: (data: Record<string, unknown>) => void;
  initialData: Record<string, unknown>;
  isArray?: boolean;
}) {
  const [nestedFields, setNestedFields] = useState<DocField[]>(() => {
    if (isArray && "_array" in initialData) {
      return initialData._array as DocField[];
    }
    return initialData ? docToFields(initialData) : [{ key: "", value: "", type: "string" }];
  });
  
  const [innerNestedDialog, setInnerNestedDialog] = useState<{
    isOpen: boolean;
    parentKey: string;
    initialData: Record<string, unknown>;
    isArray: boolean;
  } | null>(null);

  const handleEditNested = (key: string, value: unknown) => {
    if (typeof value === "object" && value !== null) {
      if (Array.isArray(value)) {
        setInnerNestedDialog({
          isOpen: true,
          parentKey: key,
          initialData: { _array: value.map((v, i) => ({ key: String(i), value: v, type: getValueType(v) })) },
          isArray: true,
        });
      } else {
        setInnerNestedDialog({
          isOpen: true,
          parentKey: key,
          initialData: value as Record<string, unknown>,
          isArray: false,
        });
      }
    }
  };

  const handleSave = () => {
    if (isArray) {
      const arrayData = nestedFields.map(f => f.value);
      onSave({ _array: arrayData });
    } else {
      onSave(fieldsToDoc(nestedFields));
    }
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{isArray ? "Editar array" : "Editar objeto"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-2 max-h-[60vh] overflow-y-auto">
          <FieldEditor
            fields={nestedFields}
            onChange={setNestedFields}
            onEditNested={handleEditNested}
            mode={isArray ? "array" : "object"}
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={handleSave}>Guardar</Button>
        </DialogFooter>
        {innerNestedDialog && (
          <NestedDialog
            isOpen={innerNestedDialog.isOpen}
            onClose={() => setInnerNestedDialog(null)}
            onSave={(data) => {
              if (!innerNestedDialog) return;
              const isArrayEdit = "_array" in data;
              let newValue: unknown;
              if (isArrayEdit) {
                newValue = coerceNestedArrayFromSavePayload(data);
              } else {
                newValue = data;
              }
              const updatedFields = nestedFields.map((field) => {
                if (field.key === innerNestedDialog.parentKey) {
                  return { ...field, value: newValue };
                }
                return field;
              });
              setNestedFields(updatedFields);
              setInnerNestedDialog(null);
            }}
            initialData={innerNestedDialog.initialData}
            isArray={innerNestedDialog.isArray}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function getFieldType(value: unknown): FieldDisplay["type"] {
  if (value === null) return "null";
  if (value === undefined) return "null";
  if (Array.isArray(value)) return "array";
  if (typeof value === "object") {
    const obj = value as { _seconds?: number; _nanoseconds?: number; _latitude?: number; _longitude?: number; _path?: string };
    if ("_seconds" in obj && "_nanoseconds" in obj) return "timestamp";
    if ("_latitude" in obj && "_longitude" in obj) return "geopoint";
    if ("_path" in obj) return "docref";
    return "object";
  }
  return typeof value as "string" | "number" | "boolean";
}

function formatFieldValue(value: unknown): string {
  if (value === null) return "null";
  if (value === undefined) return "undefined";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) return `Array(${value.length})`;
  if (typeof value === "object") {
    const obj = value as { _seconds?: number; _nanoseconds?: number; _latitude?: number; _longitude?: number; _path?: string };
    if (obj._seconds !== undefined && obj._nanoseconds !== undefined) {
      return new Date(obj._seconds * 1000).toLocaleString();
    }
    if (obj._latitude !== undefined && obj._longitude !== undefined) {
      return `${obj._latitude}, ${obj._longitude}`;
    }
    if (obj._path) return obj._path;
    return "Object";
  }
  return String(value);
}

function getTypeIcon(type: FieldDisplay["type"]) {
  switch (type) {
    case "string": return <TypeIcon className="size-3.5 text-blue-500" />;
    case "number": return <HashIcon className="size-3.5 text-green-500" />;
    case "boolean": return <ToggleLeftIcon className="size-3.5 text-orange-500" />;
    case "null": return <XIcon className="size-3.5 text-gray-400" />;
    case "timestamp": return <CalendarIcon className="size-3.5 text-purple-500" />;
    case "geopoint": return <MapPinIcon className="size-3.5 text-red-500" />;
    case "docref": return <LinkIcon className="size-3.5 text-indigo-500" />;
    case "array": return <ListIcon className="size-3.5 text-yellow-500" />;
    case "object": return <MapIcon className="size-3.5 text-pink-500" />;
  }
}

function parseJsonToFields(jsonStr: string): FieldDisplay[] | null {
  try {
    const parsed = JSON.parse(jsonStr);
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return null;
    
    return Object.entries(parsed).map(([key, value]) => ({
      key,
      value,
      type: getFieldType(value),
    }));
  } catch {
    return null;
  }
}

function tryParseJson(str: string): Record<string, unknown> | null {
  try {
    return JSON.parse(str);
  } catch {
    return null;
  }
}

interface CollectionNode {
  name: string;
  subcollections: CollectionNode[];
  expanded: boolean;
}

function CollectionTreeItem({
  node,
  path,
  currentPath,
  expandedPaths,
  onToggleExpand,
  onSelect,
  onCreateSubcollection,
  depth = 0,
}: {
  node: CollectionNode;
  path: string;
  currentPath: string;
  expandedPaths: Set<string>;
  onToggleExpand: (path: string) => void;
  onSelect: (path: string) => void;
  onCreateSubcollection: (parentPath: string) => void;
  depth?: number;
}) {
  const hasChildren = node.subcollections.length > 0 || expandedPaths.has(path);
  const isSelected = currentPath === path;
  const isExpanded = expandedPaths.has(path);

  return (
    <div>
      <div
        className={`flex w-full items-center gap-1 rounded-md px-2 py-1.5 text-left text-sm ${
          isSelected ? "bg-muted" : "hover:bg-muted/50"
        }`}
        style={{ paddingLeft: `${depth * 12 + 8}px` }}
      >
        {node.subcollections.length > 0 ? (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onToggleExpand(path);
            }}
            className="p-0.5 hover:bg-muted rounded"
          >
            {isExpanded ? (
              <ChevronDownIcon className="size-3 text-muted-foreground" />
            ) : (
              <ChevronRightIcon className="size-3 text-muted-foreground" />
            )}
          </button>
        ) : (
          <span className="w-4" />
        )}
        <button
          onClick={() => onSelect(path)}
          className="flex flex-1 items-center gap-1.5 min-w-0"
        >
          {isExpanded && node.subcollections.length > 0 ? (
            <FolderOpenIcon className="size-4 shrink-0 text-muted-foreground" />
          ) : (
            <FolderIcon className="size-4 shrink-0 text-muted-foreground" />
          )}
          <span className="truncate">{node.name}</span>
        </button>
        <button
          onClick={(e) => {
            e.stopPropagation();
            onCreateSubcollection(path);
          }}
          className="opacity-0 group-hover:opacity-100 p-0.5 hover:bg-muted rounded"
          title="Crear subcolección"
        >
          <PlusIcon className="size-3 text-muted-foreground" />
        </button>
      </div>
      {isExpanded && node.subcollections.length > 0 && (
        <div>
          {node.subcollections.map((child) => (
            <CollectionTreeItem
              key={child.name}
              node={child}
              path={`${path}/${child.name}`}
              currentPath={currentPath}
              expandedPaths={expandedPaths}
              onToggleExpand={onToggleExpand}
              onSelect={onSelect}
              onCreateSubcollection={onCreateSubcollection}
              depth={depth + 1}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export default function TestingDataPage() {
  const agentId = useAgentIdParam();
  const router = useRouter();

  const [collectionTree, setCollectionTree] = useState<CollectionNode[]>([]);
  const [breadcrumbs, setBreadcrumbs] = useState<string[]>([]);
  const [documents, setDocuments] = useState<TestingDataDocument[]>([]);
  const [selectedDoc, setSelectedDoc] = useState<TestingDataDocument | null>(null);
  const [fields, setFields] = useState<FieldDisplay[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingDocs, setLoadingDocs] = useState(false);
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(new Set());

  const [createCollectionDialogOpen, setCreateCollectionDialogOpen] = useState(false);
  const [newCollectionName, setNewCollectionName] = useState("");
  const [createDocDialogOpen, setCreateDocDialogOpen] = useState(false);
  const [editDocDialogOpen, setEditDocDialogOpen] = useState(false);
  const [deleteDocDialogOpen, setDeleteDocDialogOpen] = useState(false);
  const [docFields, setDocFields] = useState<DocField[]>([{ key: "", value: "", type: "string" }]);
  const [newDocId, setNewDocId] = useState("");
  const [jsonError, setJsonError] = useState<string | null>(null);
  const [docIdError, setDocIdError] = useState<string | null>(null);
  const [nestedDialog, setNestedDialog] = useState<{
    isOpen: boolean;
    parentKey: string;
    initialData: Record<string, unknown>;
    isArray: boolean;
  } | null>(null);

  const currentCollection = breadcrumbs[breadcrumbs.length - 1];
  const currentPath = breadcrumbs.join("/");

  const loadSubcollections = useCallback(async (parentPath: string): Promise<CollectionNode[]> => {
    const parts = parentPath.split("/");
    const agentId = parts[0];
    const collection = parts.slice(1).join("/");
    
    let data;
    if (parts.length === 1) {
      data = await fetchTestingDataCollections(agentId);
    } else {
      data = await fetchTestingDataSubcollections(agentId, collection);
    }
    
    if (!data?.collections) return [];
    
    return data.collections.map((name) => ({
      name,
      subcollections: [],
      expanded: false,
    }));
  }, []);

  const loadCollectionTree = useCallback(async () => {
    if (!agentId) return;
    setLoading(true);
    try {
      const data = await fetchTestingDataCollections(agentId);
      if (data?.collections) {
        const tree: CollectionNode[] = data.collections.map((name) => ({
          name,
          subcollections: [],
          expanded: false,
        }));
        setCollectionTree(tree);
      }
    } finally {
      setLoading(false);
    }
  }, [agentId]);

  const toggleExpand = useCallback(async (path: string) => {
    const newExpanded = new Set(expandedPaths);
    
    if (newExpanded.has(path)) {
      newExpanded.delete(path);
      setExpandedPaths(newExpanded);
      return;
    }

    newExpanded.add(path);
    setExpandedPaths(newExpanded);

    const subcollections = await loadSubcollections(path);
    const parts = path.split("/");
    
    const addSubToTree = (nodes: CollectionNode[], depth: number): CollectionNode[] => {
      if (depth === parts.length - 1) {
        return nodes.map((node) => {
          if (node.name === parts[depth]) {
            return { ...node, subcollections, expanded: true };
          }
          return node;
        });
      }
      
      return nodes.map((node) => {
        if (node.name === parts[depth]) {
          return { ...node, subcollections: addSubToTree(node.subcollections, depth + 1) };
        }
        if (node.subcollections.length > 0) {
          return { ...node, subcollections: addSubToTree(node.subcollections, depth) };
        }
        return node;
      });
    };

    const newTree = addSubToTree(collectionTree, 0);
    setCollectionTree(newTree);
  }, [agentId, expandedPaths, loadSubcollections, collectionTree]);

  const loadDocuments = useCallback(async () => {
    if (!agentId || !currentCollection) return;
    setLoadingDocs(true);
    try {
      const data = await fetchTestingDataDocuments(agentId, currentCollection);
      if (data?.documents) {
        setDocuments(data.documents);
      }
    } finally {
      setLoadingDocs(false);
    }
  }, [agentId, currentCollection]);

  const loadDocument = useCallback(async (docId: string) => {
    if (!agentId || !currentCollection) return null;
    return fetchTestingDataDocument(agentId, currentCollection, docId);
  }, [agentId, currentCollection]);

  useEffect(() => {
    if (!agentId) return;
    void loadCollectionTree();
  }, [agentId]);

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
  }, [agentId, currentCollection]);

  const navigateToCollection = (path: string) => {
    const parts = path.split("/");
    setBreadcrumbs(parts);
  };

  const navigateBack = () => {
    if (breadcrumbs.length > 1) {
      setBreadcrumbs(breadcrumbs.slice(0, -1));
    } else {
      setBreadcrumbs([]);
    }
  };

  const handleSelectDocument = async (doc: TestingDataDocument) => {
    const fullDoc = await loadDocument(doc.id);
    if (fullDoc) {
      setSelectedDoc(fullDoc);
      const parsed = parseJsonToFields(JSON.stringify(fullDoc.data, null, 2));
      if (parsed) setFields(parsed);
    }
  };

  const handleCreateCollection = () => {
    if (!newCollectionName.trim()) return;
    const newName = newCollectionName.trim();
    
    const addNewCollection = (nodes: CollectionNode[], currentPathKey: string): CollectionNode[] => {
      if (currentPathKey === "") {
        if (!nodes.find((n) => n.name === newName)) {
          return [...nodes, { name: newName, subcollections: [], expanded: false }];
        }
      }
      return nodes.map((node) => {
        if (node.name === currentPathKey) {
          const existingSub = node.subcollections.find((n) => n.name === newName);
          if (!existingSub) {
            return {
              ...node,
              subcollections: [...node.subcollections, { name: newName, subcollections: [], expanded: false }],
              expanded: true,
            };
          }
        }
        if (node.subcollections.length > 0) {
          return { ...node, subcollections: addNewCollection(node.subcollections, node.name) };
        }
        return node;
      });
    };

    const parentKey = currentPath || "";
    const updatedTree = addNewCollection(collectionTree, parentKey);
    setCollectionTree(updatedTree);
    
    if (parentKey) {
      setExpandedPaths((prev) => new Set([...prev, parentKey]));
    }
    
    setCreateCollectionDialogOpen(false);
    setNewCollectionName("");
    setBreadcrumbs([...breadcrumbs, newName]);
    setDocFields([{ key: "", value: "", type: "string" }]);
    setCreateDocDialogOpen(true);
  };

  const handleCreateSubcollection = (parentPath: string) => {
    setBreadcrumbs(parentPath.split("/"));
    setCreateCollectionDialogOpen(true);
  };

  const handleCreateDocument = async () => {
    const trimmedDocId = newDocId.trim();
    if (!trimmedDocId) {
      setDocIdError("Ingresa un ID para el documento");
      return;
    }

    const existingDoc = await loadDocument(trimmedDocId);
    if (existingDoc) {
      const message = `Ya existe un documento con el ID "${trimmedDocId}"`;
      setDocIdError(message);
      toast.error(message);
      return;
    }

    const data = fieldsToDoc(docFields);
    if (Object.keys(data).length === 0) {
      setJsonError("Debe tener al menos un campo");
      return;
    }
    setDocIdError(null);
    setJsonError(null);

    const result = await createTestingDataDocument(agentId, currentCollection, {
      data,
      docId: trimmedDocId,
    });
    if (result) {
      toast.success("Documento creado");
      setCreateDocDialogOpen(false);
      setDocFields([{ key: "", value: "", type: "string" }]);
      setNewDocId("");
      void loadDocuments();
    } else {
      toast.error("Error al crear documento");
    }
  };

  const handleUpdateDocument = async () => {
    if (!selectedDoc) return;
    const data = fieldsToDoc(docFields);
    if (Object.keys(data).length === 0) {
      setJsonError("Debe tener al menos un campo");
      return;
    }
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
    } else {
      toast.error("Error al actualizar documento");
    }
  };

  const handleDeleteDocument = async () => {
    if (!selectedDoc) return;
    const success = await deleteTestingDataDocument(agentId, currentCollection, selectedDoc.id);
    if (success) {
      toast.success("Documento eliminado");
      setDeleteDocDialogOpen(false);
      setSelectedDoc(null);
      setFields([]);
      void loadDocuments();
    } else {
      toast.error("Error al eliminar documento");
    }
  };

  const openCreateDoc = () => {
    setDocFields([{ key: "", value: "", type: "string" }]);
    setNewDocId(generateRandomDocId());
    setJsonError(null);
    setDocIdError(null);
    setCreateDocDialogOpen(true);
  };

  const openEditDoc = () => {
    if (!selectedDoc) return;
    setDocFields(docToFields(selectedDoc.data));
    setJsonError(null);
    setEditDocDialogOpen(true);
  };

  const handleEditNested = (key: string, value: unknown) => {
    if (typeof value === "object" && value !== null) {
      if (Array.isArray(value)) {
        setNestedDialog({
          isOpen: true,
          parentKey: key,
          initialData: { _array: value.map((v, i) => ({ key: String(i), value: v, type: getValueType(v) })) },
          isArray: true,
        });
      } else {
        setNestedDialog({
          isOpen: true,
          parentKey: key,
          initialData: value as Record<string, unknown>,
          isArray: false,
        });
      }
    }
  };

  const handleSaveNested = (data: Record<string, unknown>) => {
    if (!nestedDialog) return;
    
    const isArrayEdit = "_array" in data;
    let newValue: unknown;
    
    if (isArrayEdit) {
      newValue = coerceNestedArrayFromSavePayload(data);
    } else {
      newValue = data;
    }
    
    const updatedFields = docFields.map((field) => {
      if (field.key === nestedDialog.parentKey) {
        return { ...field, value: newValue };
      }
      return field;
    });
    setDocFields(updatedFields);
    setNestedDialog(null);
  };

  if (!agentId) return <AgentMissingFallback />;

  return (
    <div className="flex h-full min-h-0 flex-col gap-4">
      <div className="flex items-center gap-2">
        <DatabaseIcon className="size-5 text-muted-foreground" />
        <h2 className="text-lg font-semibold">Testing</h2>
      </div>

        <div className="flex flex-1 min-h-0 gap-4 overflow-hidden">
          <div className="flex w-64 shrink-0 flex-col gap-2">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Colecciones</span>
              <div className="flex gap-1">
                <Button variant="ghost" size="icon" className="size-7" onClick={() => void loadCollectionTree()}>
                  <Loader2Icon className={`size-4 ${loading ? "animate-spin" : ""}`} />
                </Button>
                <Button variant="ghost" size="icon" className="size-7" onClick={() => setCreateCollectionDialogOpen(true)}>
                  <PlusIcon className="size-4" />
                </Button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto rounded-md border p-2">
              {loading ? (
                <p className="text-sm text-muted-foreground">Cargando...</p>
              ) : collectionTree.length === 0 ? (
                <p className="text-sm text-muted-foreground">No hay colecciones</p>
              ) : (
                <div className="group">
                  {collectionTree.map((node) => (
                    <CollectionTreeItem
                      key={node.name}
                      node={node}
                      path={node.name}
                      currentPath={currentPath}
                      expandedPaths={expandedPaths}
                      onToggleExpand={toggleExpand}
                      onSelect={navigateToCollection}
                      onCreateSubcollection={handleCreateSubcollection}
                    />
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="flex flex-1 flex-col gap-2 min-w-0 overflow-hidden">
            {breadcrumbs.length > 0 && (
              <div className="flex items-center gap-1 text-sm">
                <Button variant="ghost" size="icon" className="size-6" onClick={navigateBack}>
                  <ChevronLeftIcon className="size-4" />
                </Button>
                <FolderIcon className="size-4 text-muted-foreground" />
                <span className="font-medium">{currentCollection}</span>
                <span className="text-muted-foreground">({documents.length})</span>
              </div>
            )}

            {breadcrumbs.length > 0 && (
              <div className="flex justify-end">
                <Button size="sm" onClick={openCreateDoc}>
                  <PlusIcon className="size-4" />
                  <span className="ml-1">Nuevo documento</span>
                </Button>
              </div>
            )}

            <div className="flex-1 min-h-0 overflow-hidden rounded-md border">
              {breadcrumbs.length === 0 ? (
                <div className="flex h-full items-center justify-center text-muted-foreground">
                  Selecciona una colección
                </div>
              ) : loadingDocs ? (
                <div className="flex h-full items-center justify-center">
                  <Loader2Icon className="size-6 animate-spin text-muted-foreground" />
                </div>
              ) : documents.length === 0 ? (
                <div className="flex h-full flex-col items-center justify-center gap-2 text-muted-foreground">
                  <FileIcon className="size-8" />
                  <p className="text-sm">No hay documentos</p>
                  <Button variant="outline" size="sm" onClick={openCreateDoc}>
                    <PlusIcon className="size-4" />
                    <span className="ml-1">Crear documento</span>
                  </Button>
                </div>
              ) : (
                <div className="h-full overflow-auto">
                  <table className="w-full">
                    <thead className="sticky top-0 bg-background">
                      <tr className="border-b text-left text-xs">
                        <th className="px-3 py-2 font-medium w-16">ID</th>
                        <th className="px-3 py-2 font-medium">Campos</th>
                      </tr>
                    </thead>
                    <tbody>
                      {documents.map((doc) => (
                        <tr
                          key={doc.id}
                          className={`cursor-pointer border-b hover:bg-muted/50 ${
                            selectedDoc?.id === doc.id ? "bg-muted" : ""
                          }`}
                          onClick={() => handleSelectDocument(doc)}
                        >
                          <td className="px-3 py-2 align-top">
                            <div className="max-w-[150px] truncate font-mono text-xs" title={doc.id}>
                              {doc.id}
                            </div>
                          </td>
                          <td className="px-3 py-2">
                            <div className="flex flex-wrap gap-2">
                              {Object.entries(doc.data)
                                .slice(0, 5)
                                .map(([key, value]) => (
                                  <span
                                    key={key}
                                    className="inline-flex items-center gap-1 rounded bg-muted px-1.5 py-0.5 text-xs"
                                  >
                                    <span className="font-medium">{key}:</span>
                                    <span className="text-muted-foreground max-w-[100px] truncate">
                                      {formatFieldValue(value)}
                                    </span>
                                  </span>
                                ))}
                              {Object.keys(doc.data).length > 5 && (
                                <span className="text-xs text-muted-foreground">
                                  +{Object.keys(doc.data).length - 5} más
                                </span>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>

          {selectedDoc && (
            <div className="flex w-96 shrink-0 flex-col gap-2 overflow-hidden">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Documento</span>
                <div className="flex gap-1">
                  <Button variant="ghost" size="icon" className="size-7" onClick={openEditDoc}>
                    <PencilIcon className="size-4" />
                  </Button>
                  <Button variant="ghost" size="icon" className="size-7 text-destructive" onClick={() => setDeleteDocDialogOpen(true)}>
                    <Trash2Icon className="size-4" />
                  </Button>
                </div>
              </div>

              <div className="flex-1 overflow-auto rounded-md border">
                <div className="bg-muted/30 px-3 py-2 font-mono text-xs font-semibold border-b">
                  {selectedDoc.id}
                </div>
                <div className="divide-y">
                  {fields.map((field) => (
                    <div key={field.key} className="flex px-3 py-2">
                      <div className="w-24 shrink-0 flex items-center gap-1">
                        {getTypeIcon(field.type)}
                        <span className="truncate font-medium text-xs">{field.key}</span>
                      </div>
                      <div className="flex-1 overflow-hidden">
                        <div className="font-mono text-xs break-all">
                          {field.type === "object" || field.type === "array" ? (
                            <pre className="text-muted-foreground whitespace-pre-wrap">
                              {JSON.stringify(field.value, null, 2).slice(0, 200)}
                              {JSON.stringify(field.value).length > 200 ? "..." : ""}
                            </pre>
                          ) : (
                            <span className="text-blue-600 dark:text-blue-400">
                              {formatFieldValue(field.value)}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                  {fields.length === 0 && (
                    <div className="p-3 text-center text-xs text-muted-foreground">Sin datos</div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

      <Dialog open={createCollectionDialogOpen} onOpenChange={setCreateCollectionDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nueva colección</DialogTitle>
            <DialogDescription>
              Ingresa el nombre de la nueva colección. Se creará cuando agregues el primer documento.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="collection-name">Nombre de colección</Label>
            <Input
              id="collection-name"
              value={newCollectionName}
              onChange={(e) => setNewCollectionName(e.target.value)}
              placeholder="mi-coleccion"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateCollectionDialogOpen(false)}>Cancelar</Button>
            <Button onClick={handleCreateCollection} disabled={!newCollectionName.trim()}>Crear</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={createDocDialogOpen} onOpenChange={setCreateDocDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Crear documento</DialogTitle>
            <DialogDescription>Colección: {currentCollection}</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="create-doc-id">ID del documento</Label>
            <div className="flex gap-2">
              <Input
                id="create-doc-id"
                value={newDocId}
                onChange={(e) => {
                  setNewDocId(e.target.value);
                  setDocIdError(null);
                }}
                placeholder="mi-documento"
                className="font-mono"
              />
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setNewDocId(generateRandomDocId());
                  setDocIdError(null);
                }}
              >
                ID aleatorio
              </Button>
            </div>
            {docIdError && <p className="text-sm text-destructive">{docIdError}</p>}
          </div>
          <div className="space-y-2 max-h-[60vh] overflow-y-auto">
            <FieldEditor 
              fields={docFields} 
              onChange={setDocFields}
              onEditNested={handleEditNested}
            />
            {jsonError && <p className="text-sm text-destructive">{jsonError}</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateDocDialogOpen(false)}>Cancelar</Button>
            <Button onClick={handleCreateDocument}>Crear</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={editDocDialogOpen} onOpenChange={setEditDocDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Editar documento</DialogTitle>
            <DialogDescription>{selectedDoc?.id}</DialogDescription>
          </DialogHeader>
          <div className="space-y-2 max-h-[60vh] overflow-y-auto">
            <FieldEditor 
              fields={docFields} 
              onChange={setDocFields}
              onEditNested={handleEditNested}
            />
            {jsonError && <p className="text-sm text-destructive">{jsonError}</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditDocDialogOpen(false)}>Cancelar</Button>
            <Button onClick={handleUpdateDocument}>Guardar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={deleteDocDialogOpen} onOpenChange={setDeleteDocDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Eliminar documento</DialogTitle>
            <DialogDescription>
              ¿Estás seguro de que quieres eliminar el documento{" "}
              <span className="font-mono font-semibold">{selectedDoc?.id}</span>?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDocDialogOpen(false)}>Cancelar</Button>
            <Button variant="destructive" onClick={handleDeleteDocument}>Eliminar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {nestedDialog && (
        <NestedDialog
          isOpen={nestedDialog.isOpen}
          onClose={() => setNestedDialog(null)}
          onSave={handleSaveNested}
          initialData={nestedDialog.initialData}
          isArray={nestedDialog.isArray}
        />
      )}
    </div>
  );
}
