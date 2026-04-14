"use client";

import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
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
  fetchTestingDataCollections,
  fetchTestingDataDocuments,
  fetchTestingDataDocument,
  fetchTestingDataSubcollections,
  createTestingDataDocument,
  updateTestingDataDocument,
  deleteTestingDataDocument,
  type TestingDataDocument,
} from "@/lib/agents-api";
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
  const params = useParams();
  const router = useRouter();
  const agentId = typeof params.agentId === "string" ? params.agentId : "";

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
  const [jsonEditor, setJsonEditor] = useState("{\n  \n}");
  const [jsonError, setJsonError] = useState<string | null>(null);

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
    setJsonEditor("{\n  \n}");
    setCreateDocDialogOpen(true);
  };

  const handleCreateSubcollection = (parentPath: string) => {
    setBreadcrumbs(parentPath.split("/"));
    setCreateCollectionDialogOpen(true);
  };

  const handleCreateDocument = async () => {
    const parsed = tryParseJson(jsonEditor);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      setJsonError("Debe ser un objeto JSON");
      return;
    }
    setJsonError(null);

    const result = await createTestingDataDocument(agentId, currentCollection, { data: parsed });
    if (result) {
      toast.success("Documento creado");
      setCreateDocDialogOpen(false);
      setJsonEditor("{\n  \n}");
      void loadDocuments();
    } else {
      toast.error("Error al crear documento");
    }
  };

  const handleUpdateDocument = async () => {
    if (!selectedDoc) return;
    const parsed = tryParseJson(jsonEditor);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      setJsonError("Debe ser un objeto JSON");
      return;
    }
    setJsonError(null);

    const result = await updateTestingDataDocument(agentId, currentCollection, selectedDoc.id, { data: parsed });
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
    setJsonEditor("{\n  \n}");
    setJsonError(null);
    setCreateDocDialogOpen(true);
  };

  const openEditDoc = () => {
    if (!selectedDoc) return;
    setJsonEditor(JSON.stringify(selectedDoc.data, null, 2));
    setJsonError(null);
    setEditDocDialogOpen(true);
  };

  if (!agentId) {
    return <p className="text-sm text-muted-foreground">Agente no especificado.</p>;
  }

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
            <Label htmlFor="json-create">JSON</Label>
            <Textarea
              id="json-create"
              value={jsonEditor}
              onChange={(e) => { setJsonEditor(e.target.value); setJsonError(null); }}
              className="font-mono text-xs h-80"
              placeholder='{"field": "value"}'
            />
            {jsonError && <p className="text-sm text-destructive">{jsonError}</p>}
            <p className="text-xs text-muted-foreground">
              Tipos Firestore: Timestamp {"{ _seconds, _nanoseconds }"}, GeoPoint {"{ _latitude, _longitude }"}, DocumentRef {"{ _path }"}
            </p>
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
          <div className="space-y-2">
            <Label htmlFor="json-edit">JSON</Label>
            <Textarea
              id="json-edit"
              value={jsonEditor}
              onChange={(e) => { setJsonEditor(e.target.value); setJsonError(null); }}
              className="font-mono text-xs h-80"
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
    </div>
  );
}
