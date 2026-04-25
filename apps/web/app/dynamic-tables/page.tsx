"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { PlusIcon, PencilIcon, Trash2Icon, Loader2Icon } from "lucide-react";

import { DatabaseOperationsChrome } from "@/components/database/database-operations-chrome";
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
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useAuth, useDynamicTableSchemasList, useUserRole } from "@/hooks";
import { useEnvironment } from "@/contexts/EnvironmentContext";
import { createDynamicTableSchema, deleteDynamicTableSchema } from "@/services/dynamic-table-schemas-api";

export default function DynamicTablesListPage() {
  const router = useRouter();
  const { session, signOut } = useAuth();
  const { isAdmin } = useUserRole();
  const { environment, setEnvironment, allowedEnvironments } = useEnvironment();
  const { schemas, isLoading, error, refetch } = useDynamicTableSchemasList(environment);
  const [search, setSearch] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [newLabel, setNewLabel] = useState("");
  const [newTarget, setNewTarget] = useState("");
  const [creating, setCreating] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  const envOptions = allowedEnvironments.length > 0 ? allowedEnvironments : (["testing", "production"] as const);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return schemas;
    return schemas.filter(
      (s) =>
        s.label.toLowerCase().includes(q) ||
        s.schemaId.toLowerCase().includes(q) ||
        s.targetCollection.toLowerCase().includes(q),
    );
  }, [schemas, search]);

  const handleCreate = async () => {
    const label = newLabel.trim();
    const targetCollection = newTarget.trim();
    if (!label || !targetCollection) {
      toast.error("Completa etiqueta y colección destino");
      return;
    }
    setCreating(true);
    const result = await createDynamicTableSchema(environment, {
      label,
      targetCollection,
      version: 1,
      fields: [],
    });
    setCreating(false);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success("Esquema creado");
    setCreateOpen(false);
    setNewLabel("");
    setNewTarget("");
    void refetch();
    router.push(`/dynamic-tables/${encodeURIComponent(result.schema.schemaId)}`);
  };

  const confirmDelete = async () => {
    if (!deleteId) return;
    setDeleting(true);
    const result = await deleteDynamicTableSchema(environment, deleteId);
    setDeleting(false);
    setDeleteId(null);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success("Esquema eliminado");
    void refetch();
  };

  if (!isAdmin) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center">
        <p className="text-muted-foreground">No tienes acceso a esta página.</p>
      </div>
    );
  }

  return (
    <DatabaseOperationsChrome
      breadcrumbLast="Tablas dinámicas"
      userName={session?.user?.name}
      userEmail={session?.user?.email}
      userImage={(session?.user as { image?: string | null })?.image}
      onSignOut={() => void signOut()}
    >
      <main className="mx-auto w-full max-w-5xl flex-1 space-y-6 p-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Tablas dinámicas</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Define esquemas (columnas, tipos, filtros) para colecciones; los documentos se guardan en{" "}
              <code className="rounded bg-muted px-1 text-xs">dynamic_table_schemas</code>.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="grid gap-1">
              <Label htmlFor="dt-env" className="text-xs">
                Ambiente Firestore
              </Label>
              <Select value={environment} onValueChange={(v) => setEnvironment(v as typeof environment)}>
                <SelectTrigger id="dt-env" className="w-[140px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {envOptions.map((env) => (
                    <SelectItem key={env} value={env}>
                      {env === "production" ? "Production" : "Testing"}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button type="button" className="gap-2" onClick={() => setCreateOpen(true)}>
              <PlusIcon className="size-4" />
              Nuevo esquema
            </Button>
          </div>
        </div>

        <div className="max-w-sm">
          <Label htmlFor="dt-search" className="sr-only">
            Buscar
          </Label>
          <Input
            id="dt-search"
            placeholder="Buscar por etiqueta, schemaId o colección…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        {error ? (
          <p className="text-sm text-destructive">{error}</p>
        ) : isLoading ? (
          <div className="flex items-center gap-2 text-muted-foreground">
            <Loader2Icon className="size-5 animate-spin" />
            Cargando…
          </div>
        ) : (
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Etiqueta</TableHead>
                  <TableHead>schemaId</TableHead>
                  <TableHead>Colección</TableHead>
                  <TableHead className="w-20 text-right">Versión</TableHead>
                  <TableHead className="w-44">Actualizado</TableHead>
                  <TableHead className="w-32 text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-muted-foreground">
                      No hay esquemas en este ambiente.
                    </TableCell>
                  </TableRow>
                ) : (
                  filtered.map((row) => (
                    <TableRow key={row.schemaId}>
                      <TableCell className="font-medium">{row.label}</TableCell>
                      <TableCell>
                        <code className="text-xs">{row.schemaId}</code>
                      </TableCell>
                      <TableCell>
                        <code className="text-xs">{row.targetCollection}</code>
                      </TableCell>
                      <TableCell className="text-right">{row.version}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {row.updatedAt ? new Date(row.updatedAt).toLocaleString() : "—"}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button type="button" variant="ghost" size="icon" asChild>
                            <Link href={`/dynamic-tables/${encodeURIComponent(row.schemaId)}`}>
                              <PencilIcon className="size-4" />
                              <span className="sr-only">Editar</span>
                            </Link>
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="text-destructive hover:text-destructive"
                            onClick={() => setDeleteId(row.schemaId)}
                          >
                            <Trash2Icon className="size-4" />
                            <span className="sr-only">Eliminar</span>
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        )}

        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Nuevo esquema</DialogTitle>
              <DialogDescription>
                Indica un nombre para el esquema y la colección de destino; al continuar se creará un nuevo esquema y
                podrás definir columnas y tipos en el editor.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-3 py-2">
              <div className="grid gap-1">
                <Label htmlFor="new-label">Etiqueta</Label>
                <Input
                  id="new-label"
                  placeholder="ej. Candidatos"
                  value={newLabel}
                  onChange={(e) => setNewLabel(e.target.value)}
                />
              </div>
              <div className="grid gap-1">
                <Label htmlFor="new-target">Colección destino</Label>
                <Input
                  id="new-target"
                  placeholder="ej. candidates"
                  value={newTarget}
                  onChange={(e) => setNewTarget(e.target.value)}
                />
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setCreateOpen(false)}>
                Cancelar
              </Button>
              <Button type="button" disabled={creating} onClick={() => void handleCreate()}>
                {creating ? <Loader2Icon className="size-4 animate-spin" /> : "Crear y editar"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <AlertDialog open={deleteId !== null} onOpenChange={(o) => !o && setDeleteId(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>¿Eliminar esquema?</AlertDialogTitle>
              <AlertDialogDescription>
                Se borrará el documento <code className="text-xs">{deleteId}</code> de{" "}
                <code className="text-xs">dynamic_table_schemas</code>. No se pueden deshacer los cambios en Firestore.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={deleting}>Cancelar</AlertDialogCancel>
              <AlertDialogAction
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                disabled={deleting}
                onClick={(e) => {
                  e.preventDefault();
                  void confirmDelete();
                }}
              >
                {deleting ? "Eliminando…" : "Eliminar"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </main>
    </DatabaseOperationsChrome>
  );
}
