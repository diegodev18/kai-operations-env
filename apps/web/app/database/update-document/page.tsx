"use client";

import { useCallback, useMemo, useState } from "react";
import { useEnvironment } from "@/contexts/EnvironmentContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { ChangelogNavItem } from "@/components/changelog-nav";
import { UserMenu } from "@/components/user-menu";
import { useAuth } from "@/hooks";
import { Loader2Icon, CopyIcon, MenuIcon, LayoutDashboardIcon, BookOpenIcon, MegaphoneIcon, UploadIcon, CopyIcon as CopyIconLucide, PencilIcon, FolderSearch as FolderSearchIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import Link from "next/link";
import { toast } from "sonner";
import type { Environment } from "@/contexts/EnvironmentContext";

const API_BASE = "/api/database";

function parseJsonObject(text: string): Record<string, unknown> | { error: string } {
  const t = text.trim();
  if (!t) return { error: "El JSON está vacío" };
  try {
    const parsed = JSON.parse(t);
    if (parsed !== null && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
    return { error: "El JSON debe ser un objeto" };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "JSON inválido" };
  }
}

export default function ActualizarDocumentoPage() {
  const { allowedEnvironments, environment, setEnvironment } = useEnvironment();
  const { session, signOut } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const [rutaDocumento, setRutaDocumento] = useState("");
  const [jsonText, setJsonText] = useState("");
  const [merge, setMerge] = useState(true);
  const [loadLoading, setLoadLoading] = useState(false);
  const [updateLoading, setUpdateLoading] = useState(false);
  const [resultado, setResultado] = useState<{ success: boolean; mensaje?: string; error?: string } | null>(null);

  const envOptions: Environment[] = allowedEnvironments.length > 0 ? allowedEnvironments : (["testing", "production"] as Environment[]);

  const jsonValidation = useMemo(() => parseJsonObject(jsonText), [jsonText]);
  const datosValidos = typeof jsonValidation === "object" && !("error" in jsonValidation) ? (jsonValidation as Record<string, unknown>) : null;

  const loadDocument = useCallback(async () => {
    const ruta = rutaDocumento.trim();
    if (!ruta) {
      toast.error("Ingresa la ruta del documento");
      return;
    }
    const segs = ruta.split("/").filter(Boolean);
    if (segs.length % 2 !== 0) {
      toast.error("La ruta debe ser un documento (ej: faqs/abc123)");
      return;
    }
    setLoadLoading(true);
    setResultado(null);
    try {
      const url = `${API_BASE}/documento?rutaDocumento=${encodeURIComponent(ruta)}`;
      const res = await fetch(url, { credentials: "include", headers: { "X-Environment": environment } });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error ?? "Error al cargar el documento");
        return;
      }
      const doc = data.documento ?? {};
      setJsonText(JSON.stringify(doc, null, 2));
      toast.success("Documento cargado");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error de conexión");
    } finally {
      setLoadLoading(false);
    }
  }, [rutaDocumento, environment]);

  const copyToClipboard = useCallback((text: string, label?: string) => {
    navigator.clipboard.writeText(text).then(() => toast.success(label ? `${label} copiado` : "Copiado al portapapeles")).catch(() => toast.error("No se pudo copiar"));
  }, []);

  const handleUpdate = useCallback(async () => {
    const ruta = rutaDocumento.trim();
    if (!ruta) {
      toast.error("Ingresa la ruta del documento");
      return;
    }
    if (!datosValidos) {
      toast.error("JSON inválido o no es un objeto. " + (typeof jsonValidation === "object" && "error" in jsonValidation ? (jsonValidation as { error: string }).error : ""));
      return;
    }
    setUpdateLoading(true);
    setResultado(null);
    try {
      const res = await fetch(`${API_BASE}/documento/actualizar`, {
        credentials: "include",
        headers: { "Content-Type": "application/json", "X-Environment": environment },
        method: "POST",
        body: JSON.stringify({ datosActualizados: datosValidos, opciones: { merge }, rutaDocumento: ruta }),
      });
      const data = await res.json();
      if (!res.ok) {
        setResultado({ error: data.error ?? "Error", success: false });
        toast.error(data.error ?? "Error al actualizar");
        return;
      }
      setResultado({ mensaje: data.mensaje, success: true });
      toast.success(data.mensaje ?? "Documento actualizado");
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Error de conexión";
      setResultado({ error: msg, success: false });
      toast.error(msg);
    } finally {
      setUpdateLoading(false);
    }
  }, [rutaDocumento, datosValidos, jsonValidation, merge, environment]);

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
          <span className="text-muted-foreground">Update document</span>
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

      <main className="mx-auto w-full max-w-3xl flex-1 space-y-6 p-6">
        <div>
          <p className="text-sm text-muted-foreground">Carga un documento por ruta, edita el JSON (Timestamp/GeoPoint en formato serializado) y actualiza con merge o reemplazo.</p>
        </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Documento</CardTitle>
          <CardDescription>Ruta del documento (ej: faqs/abc123). Carga el documento actual para editarlo.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-2">
            <Label>Ambiente</Label>
            <Select value={environment} onValueChange={(v) => setEnvironment(v as Environment)}>
              <SelectTrigger className="w-full max-w-xs">
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
            <Label>Ruta del documento</Label>
            <div className="flex gap-2">
              <Input placeholder="faqs/abc123" value={rutaDocumento} onChange={(e) => setRutaDocumento(e.target.value)} />
              <Button type="button" variant="secondary" onClick={loadDocument} disabled={loadLoading}>
                {loadLoading ? <Loader2Icon className="size-4 animate-spin" /> : "Cargar documento actual"}
              </Button>
            </div>
          </div>

          <div className="grid gap-2">
            <div className="flex items-center justify-between">
              <Label>Datos a escribir (JSON)</Label>
              <Button type="button" variant="ghost" size="sm" onClick={() => copyToClipboard(jsonText, "JSON")}>
                <CopyIcon className="size-4 mr-1" />
                Copiar
              </Button>
            </div>
            <Textarea
              className={cn("min-h-[240px] font-mono text-sm", datosValidos === null && jsonText.trim() && "border-destructive")}
              placeholder='{ "campo": "valor", "timestamp": { "_seconds": 123, "_nanoseconds": 0 } }'
              value={jsonText}
              onChange={(e) => setJsonText(e.target.value)}
            />
            {datosValidos === null && jsonText.trim() && (
              <p className="text-sm text-destructive">{"error" in jsonValidation ? (jsonValidation as { error: string }).error : "El JSON debe ser un objeto"}</p>
            )}
          </div>

          <div className="flex items-center gap-2">
            <input id="merge" type="checkbox" className={cn("size-4 rounded border border-input accent-primary cursor-pointer")} checked={merge} onChange={(e) => setMerge(e.target.checked)} />
            <Label htmlFor="merge" className="font-normal cursor-pointer">Merge (actualización parcial). Si no se marca, se reemplaza el documento completo.</Label>
          </div>

          <Button onClick={handleUpdate} disabled={updateLoading || !datosValidos || !rutaDocumento.trim()}>
            {updateLoading ? <Loader2Icon className="size-4 animate-spin mr-2" /> : null}
            Actualizar documento
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
        </Card>
      )}
      </main>
    </div>
  );
}