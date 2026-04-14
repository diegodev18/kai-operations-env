"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import Link from "next/link";
import { getProjectById, type DbChangelogEntry, canEditChangelogEntry } from "../changelog-data";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useUserRole } from "@/hooks/useUserRole";
import { useAuth } from "@/hooks/auth";
import { ArrowLeftIcon, HomeIcon, PlusIcon, PencilIcon, EyeOffIcon, EyeIcon } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import NewChangelogForm from "../components/new-changelog-form";

export default function ToolsChangelogPage() {
  const project = getProjectById("tools");
  const { session } = useAuth();
  const { isAdmin } = useUserRole();
  const [search, setSearch] = useState("");
  const [entries, setEntries] = useState<DbChangelogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [formDialogOpen, setFormDialogOpen] = useState(false);
  const [formEntryId, setFormEntryId] = useState<string | undefined>(undefined);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  const sessionUser = session?.user
    ? {
        id: session.user.id,
        email: (session.user as { email?: string }).email,
      }
    : null;

  async function toggleEntryHidden(entry: DbChangelogEntry) {
    setTogglingId(entry.id);
    try {
      const res = await fetch(`/api/changelogs/tools/entries/${entry.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hidden: !entry.hidden }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        alert(err.error || "No se pudo actualizar la visibilidad");
        return;
      }
      await fetchEntries();
    } catch (e) {
      console.error(e);
      alert("Error de red");
    } finally {
      setTogglingId(null);
    }
  }

  const fetchEntries = useCallback(async () => {
    try {
      const res = await fetch("/api/changelogs/tools", { cache: "no-store" });
      if (res.ok) {
        const data = await res.json();
        setEntries(data.entries || []);
      }
    } catch (error) {
      console.error("[changelog] fetch error:", error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchEntries();
  }, [fetchEntries]);

  const filteredEntries = useMemo(() => {
    if (!search.trim()) return entries;
    const query = search.toLowerCase();
    return entries.filter((entry) => {
      if (entry.version.toLowerCase().includes(query)) return true;
      if (entry.description.toLowerCase().includes(query)) return true;
      const allChanges = [
        ...(entry.changes.added || []),
        ...(entry.changes.changed || []),
        ...(entry.changes.fixed || []),
        ...(entry.changes.removed || []),
        ...(entry.changes.improved || []),
      ];
      return allChanges.some((c) => c.toLowerCase().includes(query));
    });
  }, [entries, search]);

  return (
    <div className="min-h-screen bg-background p-8">
      <div className="mx-auto max-w-4xl">
        <header className="mb-12 flex items-center justify-between">
          <div>
            <h1 className="font-heading text-4xl font-bold tracking-tight text-foreground">
              {project?.name} Changelog
            </h1>
            <p className="mt-2 text-muted-foreground">{project?.description}</p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" asChild>
              <Link href="/changelog">
                <ArrowLeftIcon className="size-4 mr-2" />
                Proyectos
              </Link>
            </Button>
            <Button variant="outline" size="sm" asChild>
              <Link href="/">
                <HomeIcon className="size-4" />
                Home
              </Link>
            </Button>
            <Button
              size="sm"
              onClick={() => {
                setFormEntryId(undefined);
                setFormDialogOpen(true);
              }}
            >
              <PlusIcon className="size-4 mr-2" />
              Nueva entrada
            </Button>
          </div>
        </header>

        <div className="mb-8">
          <Input
            type="search"
            placeholder="Buscar versiones o cambios..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="max-w-sm"
          />
        </div>

        {loading ? (
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-16 animate-pulse rounded-lg bg-muted" />
            ))}
          </div>
        ) : filteredEntries.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-muted-foreground">No hay entradas todavía.</p>
            <Button
              className="mt-4"
              onClick={() => {
                setFormEntryId(undefined);
                setFormDialogOpen(true);
              }}
            >
              Crear primera entrada
            </Button>
          </div>
        ) : (
          <div className="rounded-lg border border-border overflow-hidden">
            <table className="w-full">
              <thead className="bg-muted/50">
                <tr>
                  <th className="px-4 py-3 text-left text-sm font-medium text-muted-foreground">Version</th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-muted-foreground">Fecha</th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-muted-foreground hidden md:table-cell">Description</th>
                  <th className="px-4 py-3 text-right text-sm font-medium text-muted-foreground">
                    Acciones
                  </th>
                  <th className="px-4 py-3 text-right text-sm font-medium text-muted-foreground">Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filteredEntries.map((entry) => (
                  <tr key={entry.id} className="hover:bg-muted/30 transition-colors">
                    <td className="px-4 py-4">
                      <div className="flex flex-wrap items-center gap-2">
                        <Link
                          href={`/changelog/tools/${entry.version}`}
                          className="font-mono text-sm font-medium text-foreground hover:underline"
                        >
                          v{entry.version}
                        </Link>
                        {isAdmin && entry.hidden ? (
                          <span className="text-xs text-muted-foreground">(oculta)</span>
                        ) : null}
                      </div>
                    </td>
                    <td className="px-4 py-4 text-sm text-muted-foreground">
                      {new Date(entry.registerDate).toLocaleDateString("es-ES", {
                        year: "numeric",
                        month: "short",
                        day: "numeric",
                      })}
                    </td>
                    <td className="px-4 py-4 text-sm text-muted-foreground hidden md:table-cell">
                      {entry.description}
                    </td>
                    <td className="px-4 py-4 text-right">
                      <div className="flex flex-wrap items-center justify-end gap-2">
                        {canEditChangelogEntry(entry, sessionUser) ? (
                          <Button
                            variant="outline"
                            size="icon"
                            className="size-8 shrink-0"
                            aria-label="Editar entrada"
                            title="Editar"
                            onClick={() => {
                              setFormEntryId(entry.id);
                              setFormDialogOpen(true);
                            }}
                          >
                            <PencilIcon className="size-4" />
                          </Button>
                        ) : null}
                        {isAdmin ? (
                          <Button
                            variant="ghost"
                            size="sm"
                            disabled={togglingId === entry.id}
                            onClick={() => toggleEntryHidden(entry)}
                            title={entry.hidden ? "Mostrar en el changelog" : "Ocultar del changelog"}
                          >
                            {entry.hidden ? (
                              <EyeIcon className="size-4" />
                            ) : (
                              <EyeOffIcon className="size-4" />
                            )}
                          </Button>
                        ) : null}
                      </div>
                    </td>
                    <td className="px-4 py-4 text-right">
                      <Link
                        href={`/changelog/tools/${entry.version}`}
                        className="inline-flex items-center justify-center rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
                      >
                        View
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Dialog
        open={formDialogOpen}
        onOpenChange={(open) => {
          setFormDialogOpen(open);
          if (!open) setFormEntryId(undefined);
        }}
      >
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {formEntryId ? "Editar entrada - Tools MCP" : "Nueva entrada - Tools MCP"}
            </DialogTitle>
          </DialogHeader>
          <NewChangelogForm
            key={formEntryId ?? "new"}
            projectId="tools"
            entryId={formEntryId}
            onClose={() => {
              setFormDialogOpen(false);
              setFormEntryId(undefined);
            }}
            onSaved={fetchEntries}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}