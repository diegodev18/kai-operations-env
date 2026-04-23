"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import Link from "next/link";
import {
  getProjectById,
  getAtlasVersions,
  type DbChangelogEntry,
  type ProjectId,
} from "../changelog-data";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useUserRole } from "@/hooks";
import { ArrowLeftIcon, EyeIcon, EyeOffIcon, PencilIcon, PlusIcon } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import NewChangelogForm from "./new-changelog-form";
import { OperationsShell } from "@/components/operations";

interface ChangelogListPageProps {
  projectId: ProjectId;
}

export function ChangelogListPage({ projectId }: ChangelogListPageProps) {
  const project = getProjectById(projectId);
  const { isAdmin } = useUserRole();
  const isFirebaseProject = projectId !== "atlas";
  const firebaseProjectId = isFirebaseProject ? (projectId as Exclude<ProjectId, "atlas">) : null;
  const [search, setSearch] = useState("");
  const [entries, setEntries] = useState<DbChangelogEntry[]>([]);
  const [loading, setLoading] = useState(isFirebaseProject);
  const [formDialogOpen, setFormDialogOpen] = useState(false);
  const [formEntryId, setFormEntryId] = useState<string | undefined>(undefined);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  async function toggleEntryHidden(entry: DbChangelogEntry) {
    setTogglingId(entry.id);
    try {
      const res = await fetch(`/api/changelogs/${projectId}/entries/${entry.id}`, {
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
    if (!isFirebaseProject) {
      setLoading(false);
      return;
    }
    try {
      const res = await fetch(`/api/changelogs/${projectId}`, { cache: "no-store" });
      if (res.ok) {
        const data = await res.json();
        setEntries(data.entries || []);
      }
    } catch (error) {
      console.error("[changelog] fetch error:", error);
    } finally {
      setLoading(false);
    }
  }, [isFirebaseProject, projectId]);

  useEffect(() => {
    fetchEntries();
  }, [fetchEntries]);

  const atlasEntries = useMemo(() => {
    if (projectId !== "atlas") return [];
    return getAtlasVersions().map(({ version, entry }) => ({
      id: version,
      version,
      implementationDate: entry.date,
      description: entry.description,
      changes: entry.changes,
      hidden: false,
    }));
  }, [projectId]);

  const filteredEntries = useMemo(() => {
    const sourceEntries = isFirebaseProject ? entries : atlasEntries;
    if (!search.trim()) return sourceEntries;
    const query = search.toLowerCase();
    return sourceEntries.filter((entry) => {
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
  }, [atlasEntries, entries, isFirebaseProject, search]);

  const tableRows = useMemo(() => {
    return filteredEntries.map((entry) => ({
      sourceEntry: isFirebaseProject ? (entry as DbChangelogEntry) : null,
      id: entry.id,
      version: entry.version,
      description: entry.description,
      hidden: entry.hidden ?? false,
      href: `/changelog/${projectId}/${entry.version}`,
      formattedDate: new Date(entry.implementationDate).toLocaleDateString("es-ES", {
        year: "numeric",
        month: "short",
        day: "numeric",
      }),
    }));
  }, [filteredEntries, isFirebaseProject, projectId]);

  return (
    <OperationsShell
      breadcrumb={[
        { label: "Operaciones", href: "/" },
        { label: "Changelog", href: "/changelog" },
        { label: project?.name ?? "Proyecto" },
      ]}
    >
      <div className="mx-auto w-full max-w-6xl p-6">
        <header className="mb-8 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="font-heading text-3xl font-bold tracking-tight text-foreground">
              {project?.name} Changelog
            </h1>
            <p className="mt-1 text-muted-foreground">{project?.description}</p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" asChild>
              <Link href="/changelog">
                <ArrowLeftIcon className="mr-2 size-4" />
                Proyectos
              </Link>
            </Button>
            {isFirebaseProject && isAdmin && (
              <Button onClick={() => setFormDialogOpen(true)} size="sm">
                <PlusIcon className="mr-1 size-4" />
                Nueva entrada
              </Button>
            )}
          </div>
        </header>

        <div className="mb-6">
          <Input
            type="search"
            placeholder="Buscar versiones o cambios..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="max-w-sm"
          />
        </div>

        {loading ? (
          <div className="h-72 animate-pulse rounded-lg bg-muted" />
        ) : (
          <div className="overflow-hidden rounded-lg border border-border">
            <table className="w-full">
              <thead className="bg-muted/50">
                <tr>
                  <th className="px-4 py-3 text-left text-sm font-medium text-muted-foreground">Version</th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-muted-foreground">Date</th>
                  <th className="hidden px-4 py-3 text-left text-sm font-medium text-muted-foreground md:table-cell">
                    Description
                  </th>
                  <th className="px-4 py-3 text-right text-sm font-medium text-muted-foreground">Details</th>
                  {isFirebaseProject && isAdmin ? (
                    <th className="px-4 py-3 text-right text-sm font-medium text-muted-foreground">Admin</th>
                  ) : null}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {tableRows.map((entry) => (
                  <tr key={entry.id} className="transition-colors hover:bg-muted/30">
                    <td className="px-4 py-4">
                      <Link href={entry.href} className="font-mono text-sm font-medium text-foreground hover:underline">
                        v{entry.version}
                      </Link>
                    </td>
                    <td className="px-4 py-4 text-sm text-muted-foreground">{entry.formattedDate}</td>
                    <td className="hidden px-4 py-4 text-sm text-muted-foreground md:table-cell">{entry.description}</td>
                    <td className="px-4 py-4 text-right">
                      <Link
                        href={entry.href}
                        className="inline-flex items-center justify-center rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
                      >
                        View
                      </Link>
                    </td>
                    {isFirebaseProject && isAdmin ? (
                      <td className="px-4 py-4">
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => {
                              setFormEntryId(entry.id);
                              setFormDialogOpen(true);
                            }}
                            disabled={togglingId === entry.id}
                          >
                            <PencilIcon className="size-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => {
                              if (entry.sourceEntry) {
                                void toggleEntryHidden(entry.sourceEntry);
                              }
                            }}
                            disabled={togglingId === entry.id}
                          >
                            {entry.hidden ? <EyeIcon className="size-4" /> : <EyeOffIcon className="size-4" />}
                          </Button>
                        </div>
                      </td>
                    ) : null}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {!loading && tableRows.length === 0 ? (
          <p className="mt-8 text-center text-muted-foreground">
            No se encontraron versiones que coincidan con &quot;{search}&quot;.
          </p>
        ) : null}

        <Dialog open={formDialogOpen} onOpenChange={setFormDialogOpen}>
          <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
            <DialogHeader>
              <DialogTitle>
                {formEntryId ? "Editar entrada" : "Nueva entrada"} - {project?.name}
              </DialogTitle>
            </DialogHeader>
            {project && firebaseProjectId && (
              <NewChangelogForm
                projectId={firebaseProjectId}
                entryId={formEntryId}
                onClose={() => {
                  setFormDialogOpen(false);
                  setFormEntryId(undefined);
                  void fetchEntries();
                }}
              />
            )}
          </DialogContent>
        </Dialog>
      </div>
    </OperationsShell>
  );
}
