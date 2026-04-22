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
import NewChangelogForm from "./new-changelog-form";

interface ChangelogListPageProps {
  projectId: "panel" | "tools" | "agents";
}

export function ChangelogListPage({ projectId }: ChangelogListPageProps) {
  const project = getProjectById(projectId);
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
  }, [projectId]);

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
              <Link href="/">
                <HomeIcon className="mr-1 size-4" />
                Home
              </Link>
            </Button>
            {isAdmin && (
              <Button onClick={() => setFormDialogOpen(true)} size="sm">
                <PlusIcon className="mr-1 size-4" />
                Nueva entrada
              </Button>
            )}
          </div>
        </header>

        <div className="mb-8">
          <Input
            placeholder="Buscar por versión, descripción o cambios..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full"
          />
        </div>

        {loading ? (
          <p>Cargando...</p>
        ) : (
          <div className="space-y-6">
            {filteredEntries.length === 0 ? (
              <p className="text-center text-muted-foreground">No se encontraron entradas</p>
            ) : (
              filteredEntries.map((entry) => (
                <div key={entry.id} className="rounded-lg border p-6">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <Link href={`/changelog/${projectId}/${entry.version}`}>
                        <h2 className="font-semibold hover:underline">v{entry.version}</h2>
                      </Link>
                      <p className="mt-1 text-sm text-muted-foreground">{entry.implementationDate}</p>
                      <p className="mt-2">{entry.description}</p>
                    </div>
                    {isAdmin && (
                      <div className="ml-4 flex items-center gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
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
                          size="sm"
                          onClick={() => void toggleEntryHidden(entry)}
                          disabled={togglingId === entry.id}
                        >
                          {entry.hidden ? (
                            <EyeIcon className="size-4" />
                          ) : (
                            <EyeOffIcon className="size-4" />
                          )}
                        </Button>
                      </div>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        <Dialog open={formDialogOpen} onOpenChange={setFormDialogOpen}>
          <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
            <DialogHeader>
              <DialogTitle>
                {formEntryId ? "Editar entrada" : "Nueva entrada"} - {project?.name}
              </DialogTitle>
            </DialogHeader>
            {project && (
              <NewChangelogForm
                projectId={projectId}
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
    </div>
  );
}
