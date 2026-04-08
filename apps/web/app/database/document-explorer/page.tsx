"use client";

import { useCallback, useMemo, useState } from "react";
import { useEnvironment } from "@/contexts/EnvironmentContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import JsonTreeView from "@/components/JsonTreeView";
import { collectAllPaths } from "@/components/json-tree-view-utils";
import { Loader2, Copy, Download, ChevronDown, ChevronRight, RefreshCw, FileJson, FolderOpen } from "lucide-react";
import { toast } from "sonner";
import type { Environment } from "@/contexts/EnvironmentContext";

const API_BASE = () => `${process.env.NEXT_PUBLIC_API_URL}/api/database`;

function isDocumentPath(path: string): boolean {
  const segs = path.trim().split("/").filter(Boolean);
  return segs.length > 0 && segs.length % 2 === 0;
}

function isCollectionPath(path: string): boolean {
  const segs = path.trim().split("/").filter(Boolean);
  return segs.length > 0 && segs.length % 2 === 1;
}

type CollectionDoc = { id: string; data: Record<string, unknown> };

export default function ExploradorDocumentosPage() {
  const { allowedEnvironments, environment, setEnvironment } = useEnvironment();
  const [path, setPath] = useState("");
  const [loading, setLoading] = useState(false);
  const [documentData, setDocumentData] = useState<Record<string, unknown> | null>(null);
  const [collectionData, setCollectionData] = useState<CollectionDoc[] | null>(null);
  const [subcollections, setSubcollections] = useState<{ id: string }[]>([]);
  const [viewMode, setViewMode] = useState<"tree" | "raw">("tree");
  const [searchTerm, setSearchTerm] = useState("");
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(new Set(["root"]));
  const [selectedDocId, setSelectedDocId] = useState<string | null>(null);

  const envOptions: Environment[] = allowedEnvironments.length > 0 ? allowedEnvironments : (["testing", "production"] as Environment[]);

  const currentData = useMemo(() => {
    if (documentData) return documentData;
    if (collectionData && selectedDocId) {
      const doc = collectionData.find((d) => d.id === selectedDocId);
      return doc ? doc.data : null;
    }
    return null;
  }, [documentData, collectionData, selectedDocId]);

  const loadDocumentAt = useCallback(
    async (ruta: string) => {
      if (!ruta || !isDocumentPath(ruta)) return;
      setLoading(true);
      setDocumentData(null);
      setCollectionData(null);
      setSubcollections([]);
      setSelectedDocId(null);
      setPath(ruta);
      try {
        const url = `${API_BASE()}/documento?rutaDocumento=${encodeURIComponent(ruta)}`;
        const res = await fetch(url, { credentials: "include", headers: { "X-Environment": environment } });
        const data = await res.json();
        if (!res.ok) {
          toast.error(data.error ?? "Error al cargar");
          return;
        }
        setDocumentData((data.documento ?? {}) as Record<string, unknown>);
        const subRes = await fetch(`${API_BASE()}/documento/subcolecciones?rutaDocumento=${encodeURIComponent(ruta)}`, { credentials: "include", headers: { "X-Environment": environment } });
        const subData = await subRes.json();
        if (subRes.ok && Array.isArray(subData.subcolecciones)) {
          setSubcollections(subData.subcolecciones);
        } else {
          setSubcollections([]);
        }
        toast.success("Documento cargado");
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Error de conexión");
      } finally {
        setLoading(false);
      }
    },
    [environment]
  );

  const loadCollectionAt = useCallback(
    async (ruta: string) => {
      if (!ruta || !isCollectionPath(ruta)) return;
      setLoading(true);
      setDocumentData(null);
      setCollectionData(null);
      setSubcollections([]);
      setSelectedDocId(null);
      setPath(ruta);
      try {
        const url = `${API_BASE()}/coleccion/preview?rutaColeccion=${encodeURIComponent(ruta)}`;
        const res = await fetch(url, { credentials: "include", headers: { "X-Environment": environment } });
        const data = await res.json();
        if (!res.ok) {
          toast.error(data.error ?? "Error al cargar");
          return;
        }
        const docs = (data.documentos ?? []) as Array<Record<string, unknown> & { id: string }>;
        setCollectionData(docs.map((d) => ({ id: d.id, data: d as Record<string, unknown> })));
        toast.success(docs.length === 0 ? "Colección vacía" : `Mostrando ${docs.length} documentos (preview)`);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Error de conexión");
      } finally {
        setLoading(false);
      }
    },
    [environment]
  );

  const loadDocument = useCallback(() => loadDocumentAt(path.trim()), [path, loadDocumentAt]);
  const loadCollection = useCallback(() => loadCollectionAt(path.trim()), [path, loadCollectionAt]);

  const handleLoad = useCallback(() => {
    if (isDocumentPath(path.trim())) loadDocument();
    else if (isCollectionPath(path.trim())) loadCollection();
    else toast.error("Ruta debe ser documento (segmentos par) o colección (segmentos impar)");
  }, [path, loadDocument, loadCollection]);

  const expandAll = useCallback(() => {
    if (currentData) setExpandedPaths(collectAllPaths(currentData));
  }, [currentData]);

  const collapseAll = useCallback(() => {
    setExpandedPaths(new Set(["root"]));
  }, []);

  const copyJson = useCallback(() => {
    if (currentData == null) return;
    const text = JSON.stringify(currentData, null, 2);
    navigator.clipboard.writeText(text).then(() => toast.success("JSON copiado")).catch(() => toast.error("No se pudo copiar"));
  }, [currentData]);

  const exportJson = useCallback(() => {
    if (currentData == null) return;
    const text = JSON.stringify(currentData, null, 2);
    const blob = new Blob([text], { type: "application/json" });
    const name = `documento-${path.replace(/\//g, "-") || "export"}.json`;
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = name;
    a.click();
    URL.revokeObjectURL(a.href);
    toast.success("Descarga iniciada");
  }, [currentData, path]);

  const hasData = documentData !== null || (collectionData !== null && collectionData.length > 0);

  return (
    <div className="p-6 flex flex-col gap-4 overflow-auto">
      <div>
        <h2 className="text-lg font-semibold">Explorador de documentos</h2>
        <p className="text-sm text-muted-foreground mt-0.5">Explora documentos y colecciones con vista JSON legible. Herramientas de copia, exportación y navegación por subcolecciones.</p>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Cargar</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-3">
          <div className="flex-1 min-w-[200px] space-y-1.5">
            <Label htmlFor="path">Ruta (documento o colección)</Label>
            <Input id="path" placeholder="faqs o faqs/abc123" value={path} onChange={(e) => setPath(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Ambiente</Label>
            <Select value={environment} onValueChange={(v) => setEnvironment(v as Environment)}>
              <SelectTrigger className="w-[140px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {envOptions.map((env) => (
                  <SelectItem key={env} value={env}>{env === "production" ? "Producción" : "Testing"}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-end">
            <Button onClick={handleLoad} disabled={loading}>
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Cargar"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {hasData && (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" size="sm" onClick={copyJson}>
              <Copy className="w-4 h-4 mr-1" />
              Copiar
            </Button>
            <Button variant="outline" size="sm" onClick={exportJson}>
              <Download className="w-4 h-4 mr-1" />
              Exportar JSON
            </Button>
            <Input placeholder="Buscar en contenido..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="w-48 h-8 text-sm" />
            <Button variant="outline" size="sm" onClick={expandAll}>
              <ChevronDown className="w-4 h-4 mr-1" />
              Expandir todo
            </Button>
            <Button variant="outline" size="sm" onClick={collapseAll}>
              <ChevronRight className="w-4 h-4 mr-1" />
              Colapsar todo
            </Button>
            <Button variant="outline" size="sm" onClick={() => setViewMode((m) => (m === "tree" ? "raw" : "tree"))}>
              {viewMode === "tree" ? <FileJson className="w-4 h-4 mr-1" /> : <FolderOpen className="w-4 h-4 mr-1" />}
              {viewMode === "tree" ? "Vista raw" : "Vista árbol"}
            </Button>
            <Button variant="outline" size="sm" onClick={handleLoad} disabled={loading}>
              <RefreshCw className="w-4 h-4 mr-1" />
              Refrescar
            </Button>
          </div>

          {collectionData && collectionData.length > 0 && !documentData && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Documentos en la colección (preview)</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-xs text-muted-foreground mb-2">Máximo 10 documentos. Haz clic en uno para ver su contenido abajo.</p>
                <ul className="flex flex-wrap gap-2">
                  {collectionData.map((d) => (
                    <li key={d.id}>
                      <Button variant={selectedDocId === d.id ? "secondary" : "outline"} size="sm" onClick={() => setSelectedDocId((id) => (id === d.id ? null : d.id))}>
                        {d.id}
                      </Button>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}

          {subcollections.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Subcolecciones</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-xs text-muted-foreground mb-2">Clic para cargar la subcolección en la ruta.</p>
                <ul className="flex flex-wrap gap-2">
                  {subcollections.map((s) => {
                    const subPath = `${path.trim()}/${s.id}`;
                    return (
                      <li key={s.id}>
                        <Button variant="outline" size="sm" onClick={() => { if (isDocumentPath(subPath)) loadDocumentAt(subPath); else loadCollectionAt(subPath); }}>
                          {s.id}
                        </Button>
                      </li>
                    );
                  })}
                </ul>
              </CardContent>
            </Card>
          )}

          {currentData && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">{selectedDocId ? `Documento: ${selectedDocId}` : "Contenido"}</CardTitle>
              </CardHeader>
              <CardContent>
                {viewMode === "tree" ? (
                  <div className="rounded-md border bg-muted/20 p-4 min-h-[200px] max-h-[60vh] overflow-auto">
                    <JsonTreeView data={currentData} searchTerm={searchTerm} expandedPaths={expandedPaths} onExpandedPathsChange={setExpandedPaths} />
                  </div>
                ) : (
                  <Textarea readOnly className="font-mono text-sm min-h-[200px] max-h-[60vh]" value={JSON.stringify(currentData, null, 2)} />
                )}
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}