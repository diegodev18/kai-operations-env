"use client";

import { useCallback, useMemo, useState } from "react";
import { useEnvironment } from "@/contexts/EnvironmentContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2Icon, PencilIcon, PlusIcon, Trash2Icon } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import type { Environment } from "@/contexts/EnvironmentContext";

const API_BASE = () => `${process.env.NEXT_PUBLIC_API_URL}/api/database`;
const MAX_ENTRIES = 15;

type Env = "testing" | "production";

interface Entry {
  environment: Env;
  id: string;
  rutaDocumento: string;
}

interface LoadedDoc {
  documento?: Record<string, unknown>;
  environment: string;
  error?: string;
  rutaDocumento: string;
}

function flattenObj(obj: unknown, prefix = ""): Record<string, unknown> {
  if (obj === null || obj === undefined) return prefix ? { [prefix]: obj } : {};
  if (Array.isArray(obj)) return prefix ? { [prefix]: obj } : {};
  if (typeof obj === "object") {
    const out: Record<string, unknown> = {};
    const o = obj as Record<string, unknown>;
    for (const key of Object.keys(o)) {
      const path = prefix ? `${prefix}.${key}` : key;
      const v = o[key];
      if (v !== null && typeof v === "object" && !Array.isArray(v) && !(v && typeof (v as { _seconds?: number })._seconds === "number") && !(v && typeof (v as { _latitude?: number })._latitude === "number")) {
        Object.assign(out, flattenObj(v, path));
      } else {
        out[path] = v;
      }
    }
    return out;
  }
  return prefix ? { [prefix]: obj } : {};
}

function valueToDisplay(value: unknown): string {
  if (value === null) return "null";
  if (value === undefined) return "—";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return JSON.stringify(value);
}

function parseJsonObject(text: string): Record<string, unknown> | { error: string } {
  const t = text.trim();
  if (!t) return { error: "El JSON está vacío" };
  try {
    const parsed = JSON.parse(t);
    if (parsed !== null && typeof parsed === "object" && !Array.isArray(parsed)) return parsed as Record<string, unknown>;
    return { error: "El JSON debe ser un objeto" };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "JSON inválido" };
  }
}

function nextId() {
  return Math.random().toString(36).slice(2, 10);
}

export default function VisorComparadorPage() {
  const { allowedEnvironments, environment } = useEnvironment();
  const [entries, setEntries] = useState<Entry[]>(() => [{ id: nextId(), rutaDocumento: "", environment: environment as Env }]);
  const [loaded, setLoaded] = useState<LoadedDoc[] | null>(null);
  const [loadLoading, setLoadLoading] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [editJson, setEditJson] = useState("");
  const [editMerge, setEditMerge] = useState(true);
  const [updateLoading, setUpdateLoading] = useState(false);

  const envOptions: Environment[] = allowedEnvironments.length > 0 ? allowedEnvironments : (["testing", "production"] as Environment[]);

  const addEntry = useCallback(() => {
    setEntries((prev) => {
      if (prev.length >= MAX_ENTRIES) return prev;
      return [...prev, { id: nextId(), rutaDocumento: "", environment: environment as Env }];
    });
  }, [environment]);

  const removeEntry = useCallback((id: string) => {
    setEntries((prev) => (prev.length <= 1 ? prev : prev.filter((e) => e.id !== id)));
    setLoaded(null);
    setSelectedIndex(null);
  }, []);

  const updateEntry = useCallback((id: string, patch: Partial<Pick<Entry, "rutaDocumento" | "environment">>) => {
    setEntries((prev) => prev.map((e) => (e.id === id ? { ...e, ...patch } : e)));
  }, []);

  const loadDocuments = useCallback(async () => {
    const items = entries.map((e) => ({ environment: e.environment, rutaDocumento: e.rutaDocumento.trim() })).filter((e) => e.rutaDocumento.length > 0);
    if (items.length === 0) {
      toast.error("Añade al menos una ruta de documento");
      return;
    }
    setLoadLoading(true);
    setLoaded(null);
    setSelectedIndex(null);
    try {
      const res = await fetch(`${API_BASE()}/documentos`, { credentials: "include", headers: { "Content-Type": "application/json" }, method: "POST", body: JSON.stringify({ items }) });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error ?? "Error al cargar documentos");
        return;
      }
      const docs = (data.documentos ?? []) as LoadedDoc[];
      setLoaded(docs);
      const ok = docs.filter((d) => d.documento && !d.error).length;
      if (ok < docs.length) toast.warning(`${ok} cargados, ${docs.length - ok} con error`);
      else toast.success(`${docs.length} documento(s) cargado(s)`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error de conexión");
    } finally {
      setLoadLoading(false);
    }
  }, [entries]);

  const successfulDocs = useMemo(() => {
    if (!loaded) return [];
    return loaded.filter((d) => d.documento && !d.error);
  }, [loaded]);

  const flattenedKeys = useMemo(() => {
    const keys = new Set<string>();
    for (const d of successfulDocs) {
      if (d.documento) {
        const flat = flattenObj(d.documento);
        Object.keys(flat).forEach((k) => keys.add(k));
      }
    }
    return Array.from(keys).sort();
  }, [successfulDocs]);

  const openEdit = useCallback((index: number) => {
    const doc = successfulDocs[index];
    if (!doc?.documento) return;
    setSelectedIndex(index);
    setEditJson(JSON.stringify(doc.documento, null, 2));
    setEditMerge(true);
  }, [successfulDocs]);

  const closeEdit = useCallback(() => {
    setSelectedIndex(null);
  }, []);

  const editValidation = useMemo(() => parseJsonObject(editJson), [editJson]);
  const editPayload = typeof editValidation === "object" && !("error" in editValidation) ? (editValidation as Record<string, unknown>) : null;

  const handleUpdate = useCallback(async () => {
    if (selectedIndex == null || !loaded) return;
    const doc = loaded[selectedIndex];
    if (!doc?.documento || doc.error) return;
    if (!editPayload) {
      toast.error("JSON inválido. " + (typeof editValidation === "object" && "error" in editValidation ? (editValidation as { error: string }).error : ""));
      return;
    }
    setUpdateLoading(true);
    try {
      const res = await fetch(`${API_BASE()}/documento/actualizar`, {
        credentials: "include",
        headers: { "Content-Type": "application/json", "X-Environment": doc.environment },
        method: "POST",
        body: JSON.stringify({ datosActualizados: editPayload, opciones: { merge: editMerge }, rutaDocumento: doc.rutaDocumento }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error ?? "Error al actualizar");
        return;
      }
      toast.success(data.mensaje ?? "Documento actualizado");
      setLoaded((prev) => {
        if (!prev) return prev;
        const next = [...prev];
        next[selectedIndex] = { ...next[selectedIndex], documento: editPayload };
        return next;
      });
      setEditJson(JSON.stringify(editPayload, null, 2));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error de conexión");
    } finally {
      setUpdateLoading(false);
    }
  }, [selectedIndex, loaded, editPayload, editValidation, editMerge]);

  const isDiffView = successfulDocs.length === 2;
  const isTableView = successfulDocs.length >= 3;

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <div>
        <h2 className="text-lg font-semibold">Visor y comparador de documentos</h2>
        <p className="text-sm text-muted-foreground mt-0.5">Añade rutas y ambientes, carga varios documentos y compáralos (diff o tabla). Puedes editar un documento desde aquí.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Documentos a cargar</CardTitle>
          <CardDescription>Cada fila: ruta del documento (ej: faqs/abc123) y ambiente. Máximo {MAX_ENTRIES} documentos.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {entries.map((entry) => (
            <div key={entry.id} className="flex flex-wrap items-center gap-2">
              <Input className="min-w-[200px] max-w-xs" placeholder="faqs/abc123" value={entry.rutaDocumento} onChange={(e) => updateEntry(entry.id, { rutaDocumento: e.target.value })} />
              <Select value={entry.environment} onValueChange={(v) => updateEntry(entry.id, { environment: v as Env })}>
                <SelectTrigger className="w-[130px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {envOptions.map((env) => (
                    <SelectItem key={env} value={env}>{env === "production" ? "Production" : "Testing"}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button type="button" variant="ghost" size="icon" onClick={() => removeEntry(entry.id)} disabled={entries.length <= 1}>
                <Trash2Icon className="size-4" />
              </Button>
            </div>
          ))}
          <div className="flex gap-2">
            <Button type="button" variant="secondary" onClick={addEntry} disabled={entries.length >= MAX_ENTRIES}>
              <PlusIcon className="size-4 mr-1" />
              Añadir documento
            </Button>
            <Button type="button" onClick={loadDocuments} disabled={loadLoading}>
              {loadLoading ? <Loader2Icon className="size-4 animate-spin mr-2" /> : null}
              Cargar documentos
            </Button>
          </div>
        </CardContent>
      </Card>

      {loaded && loaded.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Resultado</CardTitle>
            <CardDescription>
              {successfulDocs.length} documento(s) cargado(s).
              {isDiffView && " Vista diff (2 documentos)."}
              {isTableView && " Vista tabla."}
              {successfulDocs.length === 1 && " Selecciona Editar para modificar."}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {loaded.some((d) => d.error) && (
              <div className="text-sm text-destructive space-y-1">
                {loaded.map((d, i) => d.error && <div key={i}>{d.rutaDocumento} ({d.environment}): {d.error}</div>)}
              </div>
            )}

            {isDiffView && (
              <div className="overflow-x-auto rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[180px]">Campo</TableHead>
                      <TableHead>{successfulDocs[0]?.rutaDocumento} ({successfulDocs[0]?.environment})</TableHead>
                      <TableHead>{successfulDocs[1]?.rutaDocumento} ({successfulDocs[1]?.environment})</TableHead>
                      <TableHead className="w-[100px]">Acción</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {flattenedKeys.map((key) => {
                      const flat0 = flattenObj(successfulDocs[0]?.documento ?? {});
                      const flat1 = flattenObj(successfulDocs[1]?.documento ?? {});
                      const v0 = flat0[key];
                      const v1 = flat1[key];
                      const same = JSON.stringify(v0) === JSON.stringify(v1);
                      return (
                        <TableRow key={key} className={cn(!same && "bg-muted/50")}>
                          <TableCell className="font-mono text-xs">{key}</TableCell>
                          <TableCell className="font-mono text-xs break-all max-w-[240px]">{valueToDisplay(v0)}</TableCell>
                          <TableCell className="font-mono text-xs break-all max-w-[240px]">{valueToDisplay(v1)}</TableCell>
                          <TableCell />
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
                <div className="p-2 border-t flex flex-wrap gap-2">
                  <Button type="button" variant="outline" size="sm" onClick={() => openEdit(0)}><PencilIcon className="size-3 mr-1" />Editar doc 1</Button>
                  <Button type="button" variant="outline" size="sm" onClick={() => openEdit(1)}><PencilIcon className="size-3 mr-1" />Editar doc 2</Button>
                </div>
              </div>
            )}

            {isTableView && (
              <div className="overflow-x-auto rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[180px]">Campo</TableHead>
                      {successfulDocs.map((d, i) => (<TableHead key={i} className="min-w-[160px]">{d.rutaDocumento} ({d.environment})</TableHead>))}
                      <TableHead className="w-[120px]">Acción</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {flattenedKeys.map((key) => (
                      <TableRow key={key}>
                        <TableCell className="font-mono text-xs">{key}</TableCell>
                        {successfulDocs.map((doc, i) => {
                          const flat = flattenObj(doc.documento ?? {});
                          return <TableCell key={i} className="font-mono text-xs break-all max-w-[200px]">{valueToDisplay(flat[key])}</TableCell>;
                        })}
                        <TableCell />
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                <div className="p-2 border-t flex flex-wrap gap-2">
                  {successfulDocs.map((_, i) => (
                    <Button key={i} type="button" variant="outline" size="sm" onClick={() => openEdit(i)}><PencilIcon className="size-3 mr-1" />Editar doc {i + 1}</Button>
                  ))}
                </div>
              </div>
            )}

            {successfulDocs.length === 1 && (
              <div className="flex gap-2">
                <Button type="button" variant="outline" size="sm" onClick={() => openEdit(0)}><PencilIcon className="size-3 mr-1" />Editar documento</Button>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {selectedIndex != null && loaded && loaded[selectedIndex] && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Editar documento</CardTitle>
            <CardDescription>{loaded[selectedIndex].rutaDocumento} ({loaded[selectedIndex].environment})</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-2">
              <Label>JSON</Label>
              <Textarea className={cn("min-h-[220px] font-mono text-sm", !editPayload && editJson.trim() && "border-destructive")} value={editJson} onChange={(e) => setEditJson(e.target.value)} />
              {!editPayload && editJson.trim() && <p className="text-sm text-destructive">{"error" in editValidation ? (editValidation as { error: string }).error : "El JSON debe ser un objeto"}</p>}
            </div>
            <div className="flex items-center gap-2">
              <input id="edit-merge" type="checkbox" className="size-4 rounded border border-input accent-primary cursor-pointer" checked={editMerge} onChange={(e) => setEditMerge(e.target.checked)} />
              <Label htmlFor="edit-merge" className="font-normal cursor-pointer">Merge (actualización parcial)</Label>
            </div>
            <div className="flex gap-2">
              <Button onClick={handleUpdate} disabled={updateLoading || !editPayload}>
                {updateLoading ? <Loader2Icon className="size-4 animate-spin mr-2" /> : null}
                Actualizar documento
              </Button>
              <Button type="button" variant="outline" onClick={closeEdit}>Cerrar</Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}