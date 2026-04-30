"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  CalendarIcon,
  ChevronLeftIcon,
  CloudDownloadIcon,
  DatabaseIcon,
  FileIcon,
  FolderIcon,
  HashIcon,
  LinkIcon,
  ListIcon,
  Loader2Icon,
  MapIcon,
  MapPinIcon,
  PencilIcon,
  PlusIcon,
  RocketIcon,
  ToggleLeftIcon,
  Trash2Icon,
  TypeIcon,
  XIcon,
} from "lucide-react";
import { ToolsPullFromProductionDialog } from "@/components/agents/tools-pull-from-production-dialog";
import { PromoteDiffDialog } from "@/components/prompt";
import { Badge } from "@/components/ui/badge";
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
import { useTestingData, useTestingDiff, useUserRole } from "@/hooks";
import { fetchAgentById } from "@/services/agents-api";
import { CollectionTreeItem } from "./collection-tree";
import { CollectionsTreeSkeleton } from "./collections-tree-skeleton";
import { DocumentsTableSkeleton } from "./documents-table-skeleton";
import { FieldEditor } from "./field-editor";
import { NestedDialog } from "./nested-dialog";
import { generateRandomDocId } from "./helpers";
import type { FieldDisplay } from "./types";

const SYNC_SUPPORTED_COLLECTIONS = new Set(["properties", "tools", "collaborators"]);

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

export function TestingDataPanel({ agentId }: { agentId: string }) {
  const { isAdmin } = useUserRole();
  const {
    data: diffData,
    isLoading: isDiffLoading,
    refetch: refetchDiff,
  } = useTestingDiff(agentId);
  const [pullDialogOpen, setPullDialogOpen] = useState(false);
  const [promoteDialogOpen, setPromoteDialogOpen] = useState(false);
  const [syncingFromProd, setSyncingFromProd] = useState(false);
  const [agentNameForConfirm, setAgentNameForConfirm] = useState("");

  const handleTestingDataChanged = useCallback(() => {
    refetchDiff();
  }, [refetchDiff]);

  const {
    collectionTree, loading, expandedPaths,
    loadCollectionTree, toggleExpand, navigateToCollection, navigateBack,
    handleCreateCollection, handleCreateSubcollection,
    createCollectionDialogOpen, setCreateCollectionDialogOpen,
    newCollectionName, setNewCollectionName,
    breadcrumbs, documents, selectedDoc, fields, loadingDocs,
    currentCollection, refreshCurrentCollection,
    handleSelectDocument,
    openCreateDoc, openEditDoc,
    handleCreateDocument, handleUpdateDocument, handleDeleteDocument,
    createDocDialogOpen, setCreateDocDialogOpen,
    editDocDialogOpen, setEditDocDialogOpen,
    deleteDocDialogOpen, setDeleteDocDialogOpen,
    docFields, setDocFields,
    newDocId, setNewDocId,
    jsonError, docIdError, setDocIdError,
    nestedDialog, setNestedDialog,
    handleEditNested, handleSaveNested,
  } = useTestingData(agentId, { onDataChanged: handleTestingDataChanged });

  const currentPath = breadcrumbs.join("/");
  const collectionDiff = useMemo(
    () => (diffData || []).filter((d) => d.collection === currentCollection),
    [currentCollection, diffData],
  );
  const isSyncSupported = currentCollection
    ? SYNC_SUPPORTED_COLLECTIONS.has(currentCollection)
    : false;
  const hasDiff = collectionDiff.length > 0;
  const canTransfer = isSyncSupported && hasDiff && !isDiffLoading;
  const canPromote = canTransfer && isAdmin;
  const syncCollections = useMemo(
    () => (currentCollection ? [currentCollection] : undefined),
    [currentCollection],
  );
  const transferTitle = !isSyncSupported
    ? "Esta colección todavía no tiene diff de sincronización soportado"
    : canTransfer
      ? `Transferir diferencias de ${currentCollection}`
      : "No hay diferencias entre pruebas y producción para esta colección";

  useEffect(() => {
    if (!agentId) return;
    let cancelled = false;
    (async () => {
      const agent = await fetchAgentById(agentId);
      if (!cancelled && agent) {
        setAgentNameForConfirm(agent.agentName || agent.name || agentId);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [agentId]);

  const handleTransferSuccess = useCallback(async () => {
    await loadCollectionTree();
    await refreshCurrentCollection();
    refetchDiff();
  }, [loadCollectionTree, refetchDiff, refreshCurrentCollection]);

  return (
    <div className="flex h-full min-h-0 flex-col gap-4">
      <div className="flex items-center gap-2">
        <DatabaseIcon className="size-5 text-muted-foreground" />
        <h2 className="text-lg font-semibold">Testing</h2>
      </div>

      <div className="flex flex-1 min-h-0 gap-4 overflow-hidden">
        {/* Collections tree */}
        <div className="flex w-64 shrink-0 flex-col gap-2">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">Colecciones</span>
            <div className="flex gap-1">
              <Button
                variant="ghost"
                size="icon"
                className="size-7"
                onClick={() => void loadCollectionTree()}
                aria-label="Recargar colecciones"
              >
                <Loader2Icon className={`size-4 ${loading ? "animate-spin" : ""}`} />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="size-7"
                onClick={() => setCreateCollectionDialogOpen(true)}
                aria-label="Nueva colección"
              >
                <PlusIcon className="size-4" />
              </Button>
            </div>
          </div>

          <div
            role="tree"
            className="flex-1 overflow-y-auto rounded-md border p-2"
            aria-label="Árbol de colecciones"
            aria-busy={loading}
          >
            {loading ? (
              <CollectionsTreeSkeleton rows={6} />
            ) : collectionTree.length === 0 ? (
              <p className="text-sm text-muted-foreground">No hay colecciones</p>
            ) : (
              collectionTree.map((node) => (
                <CollectionTreeItem
                  key={node.name}
                  node={node}
                  path={node.name}
                  currentPath={currentPath}
                  expandedPaths={expandedPaths}
                  onToggleExpand={(path) => void toggleExpand(path)}
                  onSelect={navigateToCollection}
                  onCreateSubcollection={handleCreateSubcollection}
                />
              ))
            )}
          </div>
        </div>

        {/* Document list */}
        <div className="flex flex-1 flex-col gap-2 min-w-0 overflow-hidden">
          {breadcrumbs.length > 0 && (
            <div className="flex items-center gap-1 text-sm">
              <Button
                variant="ghost"
                size="icon"
                className="size-6"
                onClick={navigateBack}
                aria-label="Volver atrás"
              >
                <ChevronLeftIcon className="size-4" />
              </Button>
              <FolderIcon className="size-4 text-muted-foreground" aria-hidden />
              <span className="font-medium">{currentCollection}</span>
              <span className="text-muted-foreground">({documents.length})</span>
            </div>
          )}

          {breadcrumbs.length > 0 && (
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="min-w-0 text-xs text-muted-foreground">
                {isSyncSupported ? (
                  hasDiff ? (
                    <span className="inline-flex items-center gap-1.5">
                      <span>
                        {collectionDiff.length}{" "}
                        {collectionDiff.length === 1 ? "diferencia" : "diferencias"} con producción
                      </span>
                      <Badge variant="secondary">{collectionDiff.length}</Badge>
                    </span>
                  ) : (
                    "Sin diferencias con producción"
                  )
                ) : (
                  "Sync no disponible para esta colección"
                )}
              </div>
              <div className="flex flex-wrap justify-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  title={transferTitle}
                  onClick={() => {
                    refetchDiff();
                    setPullDialogOpen(true);
                  }}
                  disabled={!canTransfer || syncingFromProd}
                >
                  <CloudDownloadIcon className="size-4" />
                  <span className="ml-1">Bajar cambios</span>
                </Button>
                {isAdmin ? (
                  <Button
                    type="button"
                    size="sm"
                    title={transferTitle}
                    onClick={() => {
                      refetchDiff();
                      setPromoteDialogOpen(true);
                    }}
                    disabled={!canPromote}
                  >
                    <RocketIcon className="size-4" />
                    <span className="ml-1">Subir cambios</span>
                  </Button>
                ) : null}
                <Button size="sm" onClick={openCreateDoc}>
                  <PlusIcon className="size-4" />
                  <span className="ml-1">Nuevo documento</span>
                </Button>
              </div>
            </div>
          )}

          <div
            className="flex-1 min-h-0 overflow-hidden rounded-md border"
            aria-busy={breadcrumbs.length > 0 ? loadingDocs : undefined}
          >
            {breadcrumbs.length === 0 ? (
              <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                Selecciona una colección
              </div>
            ) : loadingDocs ? (
              <DocumentsTableSkeleton rows={8} />
            ) : documents.length === 0 ? (
              <div className="flex h-full flex-col items-center justify-center gap-2 text-muted-foreground">
                <FileIcon className="size-8" aria-hidden />
                <p className="text-sm">No hay documentos en esta colección</p>
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
                        onClick={() => void handleSelectDocument(doc)}
                        aria-selected={selectedDoc?.id === doc.id}
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

        {/* Document detail */}
        {selectedDoc && (
          <div className="flex w-96 shrink-0 flex-col gap-2 overflow-hidden">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Documento</span>
              <div className="flex gap-1">
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-7"
                  onClick={openEditDoc}
                  aria-label="Editar documento"
                >
                  <PencilIcon className="size-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-7 text-destructive"
                  onClick={() => setDeleteDocDialogOpen(true)}
                  aria-label="Eliminar documento"
                >
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

      {/* Create collection dialog */}
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
            <Button variant="outline" onClick={() => setCreateCollectionDialogOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleCreateCollection} disabled={!newCollectionName.trim()}>
              Crear
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Create document dialog */}
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
                onChange={(e) => { setNewDocId(e.target.value); setDocIdError(null); }}
                placeholder="mi-documento"
                className="font-mono"
              />
              <Button
                type="button"
                variant="outline"
                onClick={() => { setNewDocId(generateRandomDocId()); setDocIdError(null); }}
              >
                ID aleatorio
              </Button>
            </div>
            {docIdError && <p className="text-sm text-destructive">{docIdError}</p>}
          </div>
          <div className="space-y-2 max-h-[60vh] overflow-y-auto">
            <FieldEditor fields={docFields} onChange={setDocFields} onEditNested={handleEditNested} />
            {jsonError && <p className="text-sm text-destructive">{jsonError}</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateDocDialogOpen(false)}>Cancelar</Button>
            <Button onClick={() => void handleCreateDocument()}>Crear</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit document dialog */}
      <Dialog open={editDocDialogOpen} onOpenChange={setEditDocDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Editar documento</DialogTitle>
            <DialogDescription>{selectedDoc?.id}</DialogDescription>
          </DialogHeader>
          <div className="space-y-2 max-h-[60vh] overflow-y-auto">
            <FieldEditor fields={docFields} onChange={setDocFields} onEditNested={handleEditNested} />
            {jsonError && <p className="text-sm text-destructive">{jsonError}</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditDocDialogOpen(false)}>Cancelar</Button>
            <Button onClick={() => void handleUpdateDocument()}>Guardar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete document dialog */}
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
            <Button variant="destructive" onClick={() => void handleDeleteDocument()}>Eliminar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Nested field editor dialog */}
      {nestedDialog && (
        <NestedDialog
          isOpen={nestedDialog.isOpen}
          onClose={() => setNestedDialog(null)}
          onSave={handleSaveNested}
          initialData={nestedDialog.initialData}
          isArray={nestedDialog.isArray}
        />
      )}

      <ToolsPullFromProductionDialog
        open={pullDialogOpen}
        onOpenChange={setPullDialogOpen}
        diff={collectionDiff}
        isLoading={isDiffLoading}
        agentId={agentId}
        collections={syncCollections}
        syncing={syncingFromProd}
        onSyncingChange={setSyncingFromProd}
        onSuccess={handleTransferSuccess}
        diffPreviewLabel={currentCollection || "colección"}
      />

      <PromoteDiffDialog
        open={promoteDialogOpen}
        onOpenChange={setPromoteDialogOpen}
        diff={collectionDiff}
        isLoading={isDiffLoading}
        agentId={agentId}
        agentNameForConfirm={agentNameForConfirm}
        onSuccess={handleTransferSuccess}
        dialogTitle={`Subir cambios (${currentCollection || "colección"})`}
        dialogDescription={
          <>
            Solo se publican los campos de{" "}
            <span className="font-medium text-foreground">
              {currentCollection || "la colección seleccionada"}
            </span>{" "}
            que selecciones desde el estado guardado en pruebas. Escribe{" "}
            <span className="font-medium text-foreground">CONFIRMAR</span> para
            continuar.
          </>
        }
        contentClassName="max-h-[min(90vh,48rem)] overflow-y-auto sm:max-w-3xl"
      />
    </div>
  );
}
