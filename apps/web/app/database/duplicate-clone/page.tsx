"use client";

import { useCallback, useState } from "react";
import { useEnvironment } from "@/contexts/EnvironmentContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { ChangelogNavItem, UserMenu } from "@/components/shared";
import { useAuth } from "@/hooks";
import { Loader2Icon, MenuIcon, LayoutDashboardIcon, LayoutGridIcon, BookOpenIcon, MegaphoneIcon, UploadIcon, CopyIcon as CopyIconLucide, PencilIcon, FolderSearch as FolderSearchIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import Link from "next/link";
import { toast } from "sonner";
import type { Environment } from "@/contexts/EnvironmentContext";

const API_BASE = "/api/database";

type Operacion = "duplicar-coleccion" | "duplicar-documento" | "clonar-recursivo";

interface DuplicacionLog {
  documentos: { id: string; estado: string; razon?: string; error?: string }[];
  errores: { documento?: string; ruta?: string; error: string }[];
  resumen: { total: number; exitosos: number; fallidos: number; omitidos: number };
  operacion: string;
  proyectoOrigen: string;
  proyectoDestino: string;
  rutaOrigen: string;
  rutaDestino: string;
  timestamp: string;
}

export default function DuplicarClonarPage() {
  const { allowedEnvironments } = useEnvironment();
  const { session, signOut } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const [operacion, setOperacion] = useState<Operacion>("duplicar-coleccion");
  const [proyectoOrigen, setProyectoOrigen] = useState<Environment>("testing");
  const [proyectoDestino, setProyectoDestino] = useState<Environment>("production");
  const [rutaOrigen, setRutaOrigen] = useState("");
  const [rutaDestino, setRutaDestino] = useState("");
  const [sobrescribir, setSobrescribir] = useState(false);
  const [recursivo, setRecursivo] = useState(false);

  const [subcolecciones, setSubcolecciones] = useState<{ id: string }[]>([]);
  const [subcoleccionesIncluidas, setSubcoleccionesIncluidas] = useState<Set<string>>(new Set());
  const [manualExcluidas, setManualExcluidas] = useState<string[]>([]);
  const [nuevaExcluida, setNuevaExcluida] = useState("");
  const [previewSubLoading, setPreviewSubLoading] = useState(false);
  const [loading, setLoading] = useState(false);
  const [resultado, setResultado] = useState<{
    error?: string;
    log?: DuplicacionLog;
    logDocumentosTotal?: number;
    mensaje?: string;
    success: boolean;
  } | null>(null);

  const envOptions = allowedEnvironments.length > 0 ? allowedEnvironments : (["testing", "production"] as Environment[]);

  const fetchSubcolecciones = useCallback(async () => {
    const ruta = rutaOrigen.trim();
    if (!ruta) {
      toast.error("Ingresa la ruta del documento origen");
      return;
    }
    const segs = ruta.split("/").filter(Boolean);
    if (segs.length % 2 !== 0) {
      toast.error("La ruta debe ser un documento (ej: faqs/abc123)");
      return;
    }
    setPreviewSubLoading(true);
    setSubcolecciones([]);
    setSubcoleccionesIncluidas(new Set());
    try {
      const url = `${API_BASE}/documento/subcolecciones?rutaDocumento=${encodeURIComponent(ruta)}`;
      const res = await fetch(url, { credentials: "include", headers: { "X-Environment": proyectoOrigen } });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error ?? "Error al listar subcolecciones");
        return;
      }
      const list = (data.subcolecciones ?? []) as { id: string }[];
      setSubcolecciones(list);
      setSubcoleccionesIncluidas(new Set(list.map((c) => c.id)));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error de conexión");
    } finally {
      setPreviewSubLoading(false);
    }
  }, [rutaOrigen, proyectoOrigen]);

  const toggleSubcoleccion = useCallback((id: string) => {
    setSubcoleccionesIncluidas((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const addManualExcluida = useCallback(() => {
    const name = nuevaExcluida.trim();
    if (!name) return;
    setManualExcluidas((prev) => (prev.includes(name) ? prev : [...prev, name]));
    setNuevaExcluida("");
  }, [nuevaExcluida]);

  const removeManualExcluida = useCallback((name: string) => {
    setManualExcluidas((prev) => prev.filter((n) => n !== name));
  }, []);

  const handleSubmit = useCallback(async () => {
    const rutaO = rutaOrigen.trim();
    const rutaD = rutaDestino.trim();
    if (!rutaO || !rutaD) {
      toast.error("Ruta origen y destino son requeridas");
      return;
    }

    setLoading(true);
    setResultado(null);
    const body: Record<string, unknown> = {
      opciones: { sobrescribir },
      proyectoDestino,
      proyectoOrigen,
      rutaDestino: rutaD,
      rutaOrigen: rutaO,
    };

    if (operacion === "duplicar-coleccion") {
      (body.opciones as Record<string, unknown>).recursivo = recursivo;
      if (recursivo) {
        const excluir = subcolecciones.map((c) => c.id).filter((id) => !subcoleccionesIncluidas.has(id));
        (body.opciones as Record<string, unknown>).excluirColecciones = [...excluir, ...manualExcluidas];
      }
    } else if (operacion === "duplicar-documento") {
      (body.opciones as Record<string, unknown>).recursivo = recursivo;
      if (recursivo) {
        const excluir = subcolecciones.map((c) => c.id).filter((id) => !subcoleccionesIncluidas.has(id));
        (body.opciones as Record<string, unknown>).excluirColecciones = [...excluir, ...manualExcluidas];
      }
    } else if (operacion === "clonar-recursivo") {
      const excluir = subcolecciones.map((c) => c.id).filter((id) => !subcoleccionesIncluidas.has(id));
      (body.opciones as Record<string, unknown>).excluirColecciones = [...excluir, ...manualExcluidas];
    }

    let endpoint: string;
    if (operacion === "duplicar-coleccion") endpoint = `${API_BASE}/duplicar/coleccion`;
    else if (operacion === "duplicar-documento") endpoint = `${API_BASE}/duplicar/documento`;
    else endpoint = `${API_BASE}/clonar-recursivo`;

    try {
      const res = await fetch(endpoint, { credentials: "include", headers: { "Content-Type": "application/json" }, method: "POST", body: JSON.stringify(body) });
      const text = await res.text();
      let data: { error?: string; log?: DuplicacionLog; logDocumentosTotal?: number; mensaje?: string; success?: boolean };
      try {
        data = text ? (JSON.parse(text) as typeof data) : {};
      } catch {
        const preview = text.replace(/\s+/g, " ").trim().slice(0, 280);
        const looksHtml = preview.startsWith("<") || preview.toLowerCase().includes("<!doctype");
        const errMsg = looksHtml
          ? `Error HTTP ${String(res.status)}: el servidor devolvió HTML (p. ej. error interno o tiempo de espera agotado), no JSON. Si la operación fue muy grande, prueba excluir más subcolecciones o revisa los logs de la API.`
          : preview || `Error HTTP ${String(res.status)} (respuesta no JSON)`;
        setResultado({ error: errMsg, success: false });
        toast.error(res.status >= 500 ? `Error del servidor (${String(res.status)})` : "Respuesta no válida");
        return;
      }
      if (!res.ok) {
        setResultado({ error: data.error ?? "Error en la operación", success: false });
        toast.error(data.error ?? "Error");
        return;
      }
      setResultado({
        log: data.log,
        logDocumentosTotal: typeof data.logDocumentosTotal === "number" ? data.logDocumentosTotal : undefined,
        mensaje: data.mensaje,
        success: true,
      });
      toast.success(data.mensaje ?? "Operación completada");
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Error de conexión";
      setResultado({ error: msg, success: false });
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  }, [operacion, proyectoOrigen, proyectoDestino, rutaOrigen, rutaDestino, sobrescribir, recursivo, subcolecciones, subcoleccionesIncluidas, manualExcluidas]);

  const isClonarRecursivo = operacion === "clonar-recursivo";
  const showSubcolecciones =
    isClonarRecursivo ||
    (operacion === "duplicar-coleccion" && recursivo) ||
    (operacion === "duplicar-documento" && recursivo);

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
          <span className="text-muted-foreground">Duplicate / clone</span>
        </div>
        <UserMenu
          userName={session?.user?.name}
          userEmail={session?.user?.email}
          userImage={(session?.user as { image?: string | null })?.image}
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
            <ChangelogNavItem onClick={() => setMenuOpen(false)} />
            <Link href="/blog" className="flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-foreground hover:bg-muted" onClick={() => setMenuOpen(false)}>
              <BookOpenIcon className="size-4" />
              Lecciones
            </Link>
            <Link href="/blog-actuality" className="flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-foreground hover:bg-muted" onClick={() => setMenuOpen(false)}>
              <MegaphoneIcon className="size-4" />
              Actualidad
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

      <main className="mx-auto w-full max-w-4xl flex-1 space-y-6 p-6">
        <div>
          <p className="text-sm text-muted-foreground">Duplica colecciones o documentos entre ambientes. Clonación recursiva con selección de subcolecciones.</p>
        </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Operación</CardTitle>
          <CardDescription>Elige el tipo y rellena rutas y ambientes.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-2">
            <Label>Tipo de operación</Label>
            <Select value={operacion} onValueChange={(v) => setOperacion(v as Operacion)}>
              <SelectTrigger className="w-full max-w-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="duplicar-coleccion">Duplicar colección</SelectItem>
                <SelectItem value="duplicar-documento">Duplicar documento</SelectItem>
                <SelectItem value="clonar-recursivo">Clonar recursivo</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="grid gap-2">
              <Label>Ambiente origen</Label>
              <Select value={proyectoOrigen} onValueChange={(v) => setProyectoOrigen(v as Environment)}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {envOptions.map((env) => (
                    <SelectItem key={env} value={env}>{env === "production" ? "Production" : "Testing"}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label>Ambiente destino</Label>
              <Select value={proyectoDestino} onValueChange={(v) => setProyectoDestino(v as Environment)}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {envOptions.map((env) => (
                    <SelectItem key={env} value={env}>{env === "production" ? "Production" : "Testing"}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid gap-2">
            <Label>Ruta origen</Label>
            <Input placeholder={operacion === "duplicar-coleccion" ? "ej: faqs" : "ej: faqs/abc123"} value={rutaOrigen} onChange={(e) => setRutaOrigen(e.target.value)} />
          </div>
          <div className="grid gap-2">
            <Label>Ruta destino</Label>
            <Input placeholder={operacion === "duplicar-coleccion" ? "ej: faqs" : "ej: faqs/abc123"} value={rutaDestino} onChange={(e) => setRutaDestino(e.target.value)} />
          </div>

          <div className="flex items-center gap-2">
            <input id="sobrescribir" type="checkbox" className={cn("size-4 rounded border border-input accent-primary cursor-pointer")} checked={sobrescribir} onChange={(e) => setSobrescribir(e.target.checked)} />
            <Label htmlFor="sobrescribir" className="font-normal cursor-pointer">Sobrescribir si ya existe en destino</Label>
          </div>

          {(operacion === "duplicar-coleccion" || operacion === "duplicar-documento") && (
            <div className="flex items-center gap-2">
              <input id="recursivo" type="checkbox" className={cn("size-4 rounded border border-input accent-primary cursor-pointer")} checked={recursivo} onChange={(e) => setRecursivo(e.target.checked)} />
              <Label htmlFor="recursivo" className="font-normal cursor-pointer">
                {operacion === "duplicar-documento"
                  ? "Incluir subcolecciones (clonación recursiva)"
                  : "Duplicar recursivamente (incluir subcolecciones)"}
              </Label>
            </div>
          )}

          {showSubcolecciones && (
            <div className="space-y-3 rounded-lg border p-4">
              <div className="flex items-center gap-2">
                <Button type="button" variant="secondary" size="sm" onClick={fetchSubcolecciones} disabled={previewSubLoading}>
                  {previewSubLoading ? <Loader2Icon className="size-4 animate-spin" /> : "Preview subcolecciones"}
                </Button>
                <span className="text-sm text-muted-foreground">Marca las que quieres incluir; las desmarcadas se excluirán.</span>
              </div>
              {subcolecciones.length > 0 && (
                <div className="flex flex-wrap gap-3">
                  {subcolecciones.map((c) => (
                    <label key={c.id} className="flex items-center gap-2 cursor-pointer text-sm">
                      <input type="checkbox" className={cn("size-4 rounded border border-input accent-primary cursor-pointer")} checked={subcoleccionesIncluidas.has(c.id)} onChange={() => toggleSubcoleccion(c.id)} />
                      {c.id}
                    </label>
                  ))}
                </div>
              )}
              <div className="flex flex-wrap gap-2 items-center">
                <Input className="max-w-[200px]" placeholder="Añadir nombre a excluir" value={nuevaExcluida} onChange={(e) => setNuevaExcluida(e.target.value)} onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addManualExcluida())} />
                <Button type="button" variant="outline" size="sm" onClick={addManualExcluida}>Añadir a excluir</Button>
                {manualExcluidas.length > 0 && (
                  <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    <span>Excluidas a mano:</span>
                    {manualExcluidas.map((n) => (
                      <span key={n} className="inline-flex items-center gap-1 rounded bg-muted px-2 py-0.5">
                        {n}
                        <button type="button" className="text-destructive hover:underline" onClick={() => removeManualExcluida(n)}>quitar</button>
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          <Button onClick={handleSubmit} disabled={loading}>
            {loading ? <Loader2Icon className="size-4 animate-spin mr-2" /> : null}
            Ejecutar
          </Button>
        </CardContent>
      </Card>

      {resultado && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{resultado.success ? "Resultado" : "Error"}</CardTitle>
            {resultado.mensaje && <CardDescription>{resultado.mensaje}</CardDescription>}
            {resultado.error && <p className="text-sm text-destructive">{resultado.error}</p>}
          </CardHeader>
            {resultado.log && (
            <CardContent>
              <div className="rounded-md border p-3 text-sm space-y-2">
                {resultado.logDocumentosTotal != null && resultado.logDocumentosTotal > resultado.log.documentos.length && (
                  <p className="text-muted-foreground">
                    El log en pantalla muestra {resultado.log.documentos.length} entradas; la operación registró {resultado.logDocumentosTotal} rutas en total.
                  </p>
                )}
                <p>Exitosos: {resultado.log.resumen.exitosos}, Fallidos: {resultado.log.resumen.fallidos}, Omitidos: {resultado.log.resumen.omitidos}</p>
                {resultado.log.documentos.length > 0 && (
                  <ul className="space-y-1 max-h-[200px] overflow-auto">
                    {resultado.log.documentos.slice(0, 100).map((d, i) => (
                      <li key={i}>{d.id} — {d.estado}{d.error != null ? `: ${d.error}` : ""}</li>
                    ))}
                    {resultado.log.documentos.length > 100 && <li className="text-muted-foreground">… y {resultado.log.documentos.length - 100} más</li>}
                  </ul>
                )}
              </div>
            </CardContent>
          )}
        </Card>
      )}
      </main>
    </div>
  );
}