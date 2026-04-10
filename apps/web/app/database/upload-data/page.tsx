"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { useEnvironment } from "@/contexts/EnvironmentContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { UserMenu } from "@/components/user-menu";
import { useAuth } from "@/hooks/auth";
import {
  UploadIcon,
  FileJsonIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  Loader2Icon,
  EyeIcon,
  CopyIcon,
  Trash2Icon,
  MenuIcon,
  LayoutDashboardIcon,
  LayoutGridIcon,
  BookOpenIcon,
  CopyIcon as CopyIconLucide,
  PencilIcon,
  FolderSearchIcon,
} from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";

const BATCH_SIZE = 50;
const API_BASE = () => `${process.env.NEXT_PUBLIC_API_URL}/api/database`;

type DocResult = {
  id: string;
  nombre: string;
  estado: "exitoso" | "omitido" | "fallido";
  error?: string;
};

type Resultados = {
  exitosos: number;
  fallidos: number;
  omitidos: number;
  errores: Array<{ documento: string; error: string }>;
  documentos: DocResult[];
};

type PreviewDoc = Record<string, unknown> & { id?: string };

type ParsedDatos = unknown[] | Record<string, unknown>;

function parseJsonSafe(text: string): ParsedDatos | { error: string } {
  const t = text.trim();
  if (!t) return { error: "El JSON está vacío" };
  try {
    const parsed = JSON.parse(t);
    if (Array.isArray(parsed)) return parsed;
    if (parsed !== null && typeof parsed === "object") return parsed as Record<string, unknown>;
    return { error: "El JSON debe ser un array de objetos o un solo objeto" };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "JSON inválido" };
  }
}

export default function SubirDatosPage() {
  const { environment } = useEnvironment();
  const { session, signOut } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const [rutaColeccion, setRutaColeccion] = useState("");
  const [jsonText, setJsonText] = useState("");
  const [sobrescribir, setSobrescribir] = useState(false);
  const [merge, setMerge] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewDocs, setPreviewDocs] = useState<PreviewDoc[] | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<{ current: number; total: number } | null>(null);
  const [resultados, setResultados] = useState<Resultados | null>(null);
  const [schemaText, setSchemaText] = useState("");
  const [validateSchema, setValidateSchema] = useState(false);
  const [schemaBlockUpload, setSchemaBlockUpload] = useState(false);
  const [leftPanelPercent, setLeftPanelPercent] = useState(50);
  const containerRef = useRef<HTMLDivElement>(null);

  const jsonValidation = useMemo(() => parseJsonSafe(jsonText), [jsonText]);

  const handleResizerMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    const container = containerRef.current;
    if (!container) return;
    const onMove = (ev: MouseEvent) => {
      const rect = container.getBoundingClientRect();
      const x = ev.clientX - rect.left;
      const p = Math.min(90, Math.max(20, (x / rect.width) * 100));
      setLeftPanelPercent(p);
    };
    const onUp = () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  }, []);

  const datos = useMemo((): ParsedDatos | null => {
    if (typeof jsonValidation === "object" && "error" in jsonValidation) return null;
    return jsonValidation as ParsedDatos;
  }, [jsonValidation]);

  const isSingleObject = datos !== null && !Array.isArray(datos) && typeof datos === "object";
  const hasValidDatos = datos !== null && (Array.isArray(datos) ? datos.length > 0 : true);

  const fetchPreview = useCallback(async () => {
    const ruta = rutaColeccion.trim();
    if (!ruta) {
      toast.error("Ingresa la ruta de la colección");
      return;
    }
    setPreviewLoading(true);
    setPreviewDocs(null);
    try {
      const url = `${API_BASE()}/coleccion/preview?rutaColeccion=${encodeURIComponent(ruta)}`;
      const res = await fetch(url, { credentials: "include", headers: { "X-Environment": environment } });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error ?? "Error al obtener el preview");
        return;
      }
      setPreviewDocs(data.documentos ?? []);
      setPreviewOpen(true);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error de conexión");
    } finally {
      setPreviewLoading(false);
    }
  }, [rutaColeccion, environment]);

  const validateAgainstSchema = useCallback((docs: unknown[], schema: unknown): { valid: boolean; errors: string[] } => {
    const errors: string[] = [];
    if (!schema || typeof schema !== "object") return { valid: true, errors: [] };
    const schemaObj = schema as Record<string, unknown>;
    const requiredKeys = Array.isArray(schemaObj.required) ? (schemaObj.required as string[]) : [];
    const typeMap = schemaObj.properties && typeof schemaObj.properties === "object" ? (schemaObj.properties as Record<string, { type?: string }>) : {};

    for (let i = 0; i < docs.length; i++) {
      const doc = docs[i];
      if (doc === null || typeof doc !== "object") {
        errors.push(`Documento ${i + 1}: no es un objeto`);
        continue;
      }
      const d = doc as Record<string, unknown>;
      for (const key of requiredKeys) {
        if (!(key in d) || d[key] === undefined) {
          errors.push(`Documento ${i + 1}: falta campo requerido "${key}"`);
        }
      }
      for (const [key, prop] of Object.entries(typeMap)) {
        if (!(key in d)) continue;
        const expected = prop?.type;
        if (!expected) continue;
        const val = d[key];
        const actual = Array.isArray(val) ? "array" : val === null ? "null" : typeof val;
        if (actual !== expected) {
          errors.push(`Documento ${i + 1}, campo "${key}": se esperaba ${expected}, se obtuvo ${actual}`);
        }
      }
    }
    return { valid: errors.length === 0, errors };
  }, []);

  const copyToClipboard = useCallback((text: string, label?: string) => {
    navigator.clipboard.writeText(text).then(() => toast.success(label ? `${label} copiado` : "Copiado al portapapeles")).catch(() => toast.error("No se pudo copiar"));
  }, []);

  const handleClearAll = useCallback(() => {
    setRutaColeccion("");
    setJsonText("");
    setSobrescribir(false);
    setMerge(false);
    setPreviewOpen(false);
    setPreviewDocs(null);
    setResultados(null);
    setSchemaText("");
    setValidateSchema(false);
    setSchemaBlockUpload(false);
    toast.success("Contenido limpiado");
  }, []);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const text = reader.result as string;
      setJsonText(text);
    };
    reader.readAsText(file, "utf-8");
    e.target.value = "";
  }, []);

  const handleUpload = useCallback(async () => {
    const ruta = rutaColeccion.trim();
    if (!ruta) {
      toast.error("Ingresa la ruta (colección o documento)");
      return;
    }
    if (!datos || !hasValidDatos) {
      toast.error("No hay datos válidos para subir. Verifica el JSON.");
      return;
    }

    const docsForSchema = Array.isArray(datos) ? datos : [datos];
    if (validateSchema && schemaText.trim()) {
      let schema: unknown;
      try {
        schema = JSON.parse(schemaText.trim());
      } catch {
        toast.error("El esquema de validación no es un JSON válido");
        return;
      }
      const { valid, errors } = validateAgainstSchema(docsForSchema, schema);
      if (!valid) {
        const msg = errors.slice(0, 5).join("; ");
        toast.error(`Validación de esquema: ${msg}${errors.length > 5 ? ` (+${errors.length - 5} más)` : ""}`);
        if (schemaBlockUpload) return;
      }
    }

    setUploading(true);
    setResultados(null);
    const url = `${API_BASE()}/subir`;

    if (isSingleObject) {
      setUploadProgress({ current: 1, total: 1 });
      try {
        const res = await fetch(url, {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json", "X-Environment": environment },
          body: JSON.stringify({ datos, rutaColeccion: ruta, opciones: { sobrescribir, merge } }),
        });
        const data = await res.json();
        setUploading(false);
        setUploadProgress(null);
        if (!res.ok) {
          toast.error(data.error ?? "Error en la subida");
          return;
        }
        setResultados(data.resultados as Resultados);
        toast.success(data.mensaje ?? "Documento subido correctamente");
      } catch (e) {
        setUploading(false);
        setUploadProgress(null);
        toast.error(e instanceof Error ? e.message : "Error de conexión");
      }
      return;
    }

    const chunks: unknown[][] = [];
    for (let i = 0; i < datos.length; i += BATCH_SIZE) {
      chunks.push(datos.slice(i, i + BATCH_SIZE));
    }
    setUploadProgress({ current: 0, total: chunks.length });

    const accumulated: Resultados = { exitosos: 0, fallidos: 0, omitidos: 0, errores: [], documentos: [] };

    for (let i = 0; i < chunks.length; i++) {
      setUploadProgress({ current: i + 1, total: chunks.length });
      try {
        const res = await fetch(url, {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json", "X-Environment": environment },
          body: JSON.stringify({ datos: chunks[i], rutaColeccion: ruta, opciones: { sobrescribir, merge } }),
        });
        const data = await res.json();
        if (!res.ok) {
          toast.error(data.error ?? "Error en la subida");
          accumulated.fallidos += chunks[i].length;
          break;
        }
        const r = data.resultados as Resultados;
        accumulated.exitosos += r.exitosos;
        accumulated.fallidos += r.fallidos;
        accumulated.omitidos += r.omitidos;
        accumulated.errores.push(...r.errores);
        accumulated.documentos.push(...r.documentos);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Error de conexión");
        accumulated.fallidos += chunks[i].length;
        break;
      }
    }

    setUploading(false);
    setUploadProgress(null);
    setResultados(accumulated);
    toast.success(`Subida completada: ${accumulated.exitosos} exitosos, ${accumulated.fallidos} fallidos, ${accumulated.omitidos} omitidos`);
  }, [rutaColeccion, datos, hasValidDatos, isSingleObject, environment, sobrescribir, merge, validateSchema, schemaText, schemaBlockUpload, validateAgainstSchema]);

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="flex h-14 shrink-0 items-center justify-between border-b px-4">
        <div className="flex items-center gap-2 font-semibold">
          <Button type="button" variant="ghost" size="icon" className="size-9" onClick={() => setMenuOpen(!menuOpen)}>
            <MenuIcon className="size-5" />
          </Button>
          <LayoutDashboardIcon className="size-5" />
          <span>Operaciones</span>
          <span className="text-muted-foreground">/</span>
          <span className="text-muted-foreground">Subir datos</span>
        </div>
        <UserMenu
          userName={session?.user?.name}
          userEmail={session?.user?.email}
          onSignOut={() => void signOut()}
        />
      </header>

      <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
        <SheetContent side="left" className="w-64">
          <SheetHeader>
            <SheetTitle>Menú</SheetTitle>
          </SheetHeader>
          <nav className="mt-4 flex flex-col gap-1 px-2">
            <Link href="/" className="flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-foreground hover:bg-muted" onClick={() => setMenuOpen(false)}>
              <LayoutDashboardIcon className="size-4" />
              Inicio
            </Link>
            <Link href="/changelog" className="flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-foreground hover:bg-muted" onClick={() => setMenuOpen(false)}>
              <LayoutGridIcon className="size-4" />
              Changelog
            </Link>
            <Link href="/blog" className="flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-foreground hover:bg-muted" onClick={() => setMenuOpen(false)}>
              <BookOpenIcon className="size-4" />
              Lecciones
            </Link>
            <div className="my-2 border-t" />
            <div className="px-3 py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Database</div>
            <Link href="/database" className="flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-foreground hover:bg-muted" onClick={() => setMenuOpen(false)}>
              <FolderSearchIcon className="size-4" />
              Servicios
            </Link>
            <Link href="/database/upload-data" className="flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-foreground hover:bg-muted" onClick={() => setMenuOpen(false)}>
              <UploadIcon className="size-4" />
              Upload data
            </Link>
            <Link href="/database/duplicate-clone" className="flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-foreground hover:bg-muted" onClick={() => setMenuOpen(false)}>
              <CopyIconLucide className="size-4" />
              Duplicate / clone
            </Link>
            <Link href="/database/update-document" className="flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-foreground hover:bg-muted" onClick={() => setMenuOpen(false)}>
              <PencilIcon className="size-4" />
              Update document
            </Link>
            <Link href="/database/viewer-comparator" className="flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-foreground hover:bg-muted" onClick={() => setMenuOpen(false)}>
              <CopyIconLucide className="size-4" />
              Viewer and comparator
            </Link>
            <Link href="/database/document-explorer" className="flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-foreground hover:bg-muted" onClick={() => setMenuOpen(false)}>
              <FolderSearchIcon className="size-4" />
              Document explorer
            </Link>
          </nav>
        </SheetContent>
      </Sheet>

      <main ref={containerRef} className="flex flex-1 flex-col lg:flex-row min-h-0 overflow-hidden p-6 gap-0" style={{ ["--left-pct" as string]: `${leftPanelPercent}%` }}>
        <div className="flex flex-col gap-4 min-w-0 overflow-auto w-full lg:shrink-0 lg:[width:var(--left-pct)]">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Ruta (colección o documento)</CardTitle>
              <CardDescription>Colección: faqs o agent_configurations/xxx/users. Documento: faqs/miId (con un solo objeto escribe en ese id).</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              <Input placeholder="faqs o faqs/miId" value={rutaColeccion} onChange={(e) => setRutaColeccion(e.target.value)} className="font-mono" />
              <Button type="button" variant="outline" size="sm" onClick={fetchPreview} disabled={previewLoading || !rutaColeccion.trim()}>
                {previewLoading ? <Loader2Icon className="w-4 h-4 animate-spin" /> : <EyeIcon className="w-4 h-4" />}
                <span className="ml-2">Ver preview de la colección</span>
              </Button>
              {previewDocs && (
                <>
                  <Button type="button" variant="ghost" size="sm" className="w-full justify-start" onClick={() => setPreviewOpen((o) => !o)}>
                    {previewOpen ? <ChevronDownIcon className="w-4 h-4" /> : <ChevronRightIcon className="w-4 h-4" />}
                    <span className="ml-2">{previewDocs.length} documento(s)</span>
                  </Button>
                  {previewOpen && (
                    <div className="mt-2 relative min-h-[12rem] max-h-[28rem] h-48 resize-y rounded-md bg-muted border border-border flex flex-col overflow-hidden" title="Arrastra el borde inferior para redimensionar">
                      <Button type="button" variant="ghost" size="icon" className="absolute right-1 top-1 h-7 w-7 opacity-70 hover:opacity-100 z-10" onClick={() => copyToClipboard(JSON.stringify(previewDocs, null, 2), "Preview")} title="Copiar JSON">
                        <CopyIcon className="w-3.5 h-3.5" />
                      </Button>
                      <pre className="p-3 pr-10 text-xs font-mono overflow-auto">{JSON.stringify(previewDocs, null, 2)}</pre>
                    </div>
                  )}
                </>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Datos (JSON)</CardTitle>
              <CardDescription>Array de objetos (varios documentos) o un solo objeto (un documento). Pega JSON o sube un archivo .json.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              <div className="flex gap-2 items-center">
                <Label className="sr-only">Archivo JSON</Label>
                <Button type="button" variant="outline" size="sm" asChild>
                  <label className="cursor-pointer flex items-center gap-2">
                    <FileJsonIcon className="w-4 h-4" />
                    Subir archivo .json
                    <input type="file" accept=".json,application/json" className="hidden" onChange={handleFileSelect} />
                  </label>
                </Button>
                {jsonText.trim() && (
                  <Button type="button" variant="outline" size="sm" onClick={() => copyToClipboard(jsonText, "JSON")} title="Copiar JSON">
                    <CopyIcon className="w-4 h-4" />
                  </Button>
                )}
              </div>
              <Textarea placeholder='[{"id": "1", "name": "..."}, ...]' value={jsonText} onChange={(e) => setJsonText(e.target.value)} className="min-h-[200px] font-mono text-sm" />
              {typeof jsonValidation === "object" && "error" in jsonValidation && jsonText.trim() && (
                <p className="text-sm text-destructive" role="alert">{String(jsonValidation.error)}</p>
              )}
              {datos && (
                <p className="text-sm text-muted-foreground">
                  {Array.isArray(datos) ? `${datos.length} documento(s) listos para subir a la colección.` : "1 objeto listo. Usa ruta tipo colección (ej: faqs) para crear con id auto o documento (ej: faqs/miId) para ese id."}
                </p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Opciones</CardTitle>
              <CardDescription>Sobrescribir y merge afectan solo a documentos con id existente.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center space-x-2">
                <input type="checkbox" id="sobrescribir" checked={sobrescribir} onChange={(e) => setSobrescribir(e.target.checked)} className="h-4 w-4 rounded border-input" />
                <Label htmlFor="sobrescribir">Sobrescribir si el documento ya existe</Label>
              </div>
              <div className="flex items-center space-x-2">
                <input type="checkbox" id="merge" checked={merge} onChange={(e) => setMerge(e.target.checked)} className="h-4 w-4 rounded border-input" />
                <Label htmlFor="merge">Merge (no reemplazar documento entero)</Label>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Validación de esquema (opcional)</CardTitle>
              <CardDescription>JSON con "required" (array de claves) y/o "properties" (tipos). Si activas validar, se comprobará antes de subir.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center space-x-2">
                <input type="checkbox" id="validateSchema" checked={validateSchema} onChange={(e) => setValidateSchema(e.target.checked)} className="h-4 w-4 rounded border-input" />
                <Label htmlFor="validateSchema">Validar esquema antes de subir</Label>
              </div>
              {validateSchema && (
                <>
                  <div className="flex items-center space-x-2">
                    <input type="checkbox" id="schemaBlock" checked={schemaBlockUpload} onChange={(e) => setSchemaBlockUpload(e.target.checked)} className="h-4 w-4 rounded border-input" />
                    <Label htmlFor="schemaBlock">Bloquear subida si hay errores de esquema</Label>
                  </div>
                  <div className="relative">
                    <Textarea placeholder='{"required": ["name"], "properties": {"name": {"type": "string"}}}' value={schemaText} onChange={(e) => setSchemaText(e.target.value)} className="min-h-[80px] font-mono text-sm pr-10" />
                    {schemaText.trim() && (
                      <Button type="button" variant="ghost" size="icon" className="absolute right-1 top-1 h-7 w-7" onClick={() => copyToClipboard(schemaText, "Esquema")} title="Copiar esquema">
                        <CopyIcon className="w-3.5 h-3.5" />
                      </Button>
                    )}
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          <div className="flex flex-wrap gap-2">
            <Button onClick={handleUpload} disabled={uploading || !hasValidDatos || !rutaColeccion.trim()}>
              {uploading ? <Loader2Icon className="w-4 h-4 animate-spin" /> : <UploadIcon className="w-4 h-4" />}
              <span className="ml-2">{uploading && uploadProgress ? `Subiendo lote ${uploadProgress.current} de ${uploadProgress.total}` : "Subir datos"}</span>
            </Button>
            <Button type="button" variant="outline" onClick={handleClearAll} disabled={uploading} title="Vaciar ruta, JSON, opciones, preview y resultados">
              <Trash2Icon className="w-4 h-4" />
              <span className="ml-2">Limpiar todo</span>
            </Button>
          </div>
        </div>

        <div role="separator" aria-label="Redimensionar columnas" tabIndex={0} onMouseDown={handleResizerMouseDown} className="shrink-0 w-2 cursor-col-resize hover:bg-primary/20 active:bg-primary/30 transition-colors items-center justify-center group hidden lg:flex">
          <div className="w-0.5 h-12 rounded-full bg-border group-hover:bg-primary/50" />
        </div>

        <div className="flex flex-col gap-4 min-w-0 overflow-hidden flex-1 w-full">
          <Card className="flex-1 min-h-0 flex flex-col overflow-hidden">
            <CardHeader className="pb-2 shrink-0">
              <CardTitle className="text-base">Resultados</CardTitle>
              <CardDescription>Resumen y detalle por documento después de subir.</CardDescription>
            </CardHeader>
            <CardContent className="flex-1 min-h-0 flex flex-col overflow-hidden pt-0">
              {!resultados ? (
                <p className="text-sm text-muted-foreground">Los resultados aparecerán aquí después de subir.</p>
              ) : (
                <div className="space-y-3 min-h-[8rem] max-h-[24rem] resize-y flex flex-col rounded border border-transparent overflow-hidden">
                  <div className="flex flex-wrap items-center gap-2 shrink-0">
                    <div className="flex gap-4 text-sm">
                      <span className="text-green-600 dark:text-green-400">Exitosos: <strong>{resultados.exitosos}</strong></span>
                      <span className="text-destructive">Fallidos: <strong>{resultados.fallidos}</strong></span>
                      <span className="text-muted-foreground">Omitidos: <strong>{resultados.omitidos}</strong></span>
                    </div>
                    <Button type="button" variant="ghost" size="sm" className="h-7 px-2" onClick={() => copyToClipboard(JSON.stringify(resultados, null, 2), "Resultados")} title="Copiar resultados">
                      <CopyIcon className="w-3.5 h-3.5 mr-1" />
                      Copiar
                    </Button>
                  </div>
                  {resultados.documentos.length > 0 && (
                    <ul className="space-y-1 text-xs font-mono p-0.5 overflow-auto">
                      {resultados.documentos.map((doc, i) => (
                        <li key={`${doc.id}-${i}`} className={doc.estado === "exitoso" ? "text-green-600 dark:text-green-400" : doc.estado === "omitido" ? "text-muted-foreground" : "text-destructive"}>
                          {doc.id || doc.nombre}: {doc.estado}{doc.error ? ` — ${doc.error}` : ""}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
}