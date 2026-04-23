"use client";

import { notFound } from "next/navigation";
import Link from "next/link";
import {
  canEditChangelogEntry,
  getAtlasVersions,
  getProjectById,
  getVersion,
  type ChangelogEntry,
  type DbChangelogEntry,
  type ProjectId,
} from "../changelog-data";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useAuth, useUserRole } from "@/hooks";
import { FileIcon, ImageIcon, LinkIcon, PencilIcon, UserIcon, VideoIcon } from "lucide-react";
import { useState, useEffect, useCallback, useMemo } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import NewChangelogForm from "./new-changelog-form";
import { OperationsShell } from "@/components/operations";

const sectionLabels: Record<string, { label: string; variant: "default" | "secondary" | "outline" | "destructive" }> = {
  added: { label: "Añadido", variant: "default" },
  changed: { label: "Cambiado", variant: "secondary" },
  fixed: { label: "Corregido", variant: "outline" },
  removed: { label: "Eliminado", variant: "destructive" },
  improved: { label: "Mejorado", variant: "secondary" },
};

function AttachmentIcon({ type }: { type: string }) {
  if (type === "image") return <ImageIcon className="size-4" />;
  if (type === "video") return <VideoIcon className="size-4" />;
  return <FileIcon className="size-4" />;
}

interface ChangelogVersionPageProps {
  version: string;
  projectId: ProjectId;
}

export function ChangelogVersionPage({ version, projectId }: ChangelogVersionPageProps) {
  const project = getProjectById(projectId);
  const { session } = useAuth();
  const { isAdmin } = useUserRole();
  const isFirebaseProject = projectId !== "atlas";
  const firebaseProjectId = isFirebaseProject ? (projectId as Exclude<ProjectId, "atlas">) : null;
  const [entry, setEntry] = useState<DbChangelogEntry | null>(null);
  const [loading, setLoading] = useState(isFirebaseProject);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [versionList, setVersionList] = useState<string[]>([]);

  const sessionUser = session?.user
    ? {
        id: session.user.id,
        email: (session.user as { email?: string }).email,
      }
    : null;

  const refetchEntry = useCallback(async () => {
    if (!isFirebaseProject) return;
    try {
      const res = await fetch(`/api/changelogs/${projectId}?version=${version}`, {
        cache: "no-store",
      });
      if (res.ok) {
        const data = await res.json();
        setEntry(data.entry || null);
      }
    } catch (error) {
      console.error("[changelog] fetch error:", error);
    }
  }, [isFirebaseProject, version, projectId]);

  useEffect(() => {
    if (!isFirebaseProject) {
      setLoading(false);
      return;
    }

    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const [entryRes, listRes] = await Promise.all([
          fetch(`/api/changelogs/${projectId}?version=${version}`, {
            cache: "no-store",
          }),
          fetch(`/api/changelogs/${projectId}`, {
            cache: "no-store",
          }),
        ]);
        if (entryRes.ok && !cancelled) {
          const data = await entryRes.json();
          setEntry(data.entry || null);
        }
        if (listRes.ok && !cancelled) {
          const data = await listRes.json();
          const versions = Array.isArray(data.entries)
            ? data.entries.map((item: DbChangelogEntry) => item.version)
            : [];
          setVersionList(versions);
        }
      } catch (error) {
        console.error("[changelog] fetch error:", error);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isFirebaseProject, version, projectId]);

  const atlasEntry = useMemo<ChangelogEntry | null>(() => {
    if (projectId !== "atlas") return null;
    return getVersion(version) ?? null;
  }, [projectId, version]);

  const atlasVersionList = useMemo(() => {
    if (projectId !== "atlas") return [];
    return getAtlasVersions().map((item) => item.version);
  }, [projectId]);

  const currentDate = isFirebaseProject ? entry?.implementationDate : atlasEntry?.date;
  const formattedDate = currentDate
    ? new Date(currentDate).toLocaleDateString("es-ES", {
        year: "numeric",
        month: "short",
        day: "numeric",
      })
    : "Sin fecha";

  const currentDescription = isFirebaseProject ? entry?.description : atlasEntry?.description;
  const currentChanges = isFirebaseProject ? entry?.changes : atlasEntry?.changes;

  const visibleVersionList = isFirebaseProject ? versionList : atlasVersionList;
  const currentIndex = visibleVersionList.indexOf(version);
  const prevVersion = currentIndex < visibleVersionList.length - 1 ? visibleVersionList[currentIndex + 1] : null;
  const nextVersion = currentIndex > 0 ? visibleVersionList[currentIndex - 1] : null;

  if (loading) {
    return (
      <OperationsShell
        breadcrumb={[
          { label: "Operaciones", href: "/" },
          { label: "Changelog", href: "/changelog" },
          { label: project?.name ?? "Proyecto", href: `/changelog/${projectId}` },
          { label: `v${version}` },
        ]}
      >
        <div className="mx-auto w-full max-w-3xl p-6">
          <div className="h-96 animate-pulse rounded-lg bg-muted" />
        </div>
      </OperationsShell>
    );
  }

  if (!isFirebaseProject && !atlasEntry) {
    notFound();
  }

  if (isFirebaseProject && !entry) {
    notFound();
  }

  if (isFirebaseProject && entry && !canEditChangelogEntry(entry, sessionUser)) {
    notFound();
  }

  return (
    <OperationsShell
      breadcrumb={[
        { label: "Operaciones", href: "/" },
        { label: "Changelog", href: "/changelog" },
        { label: project?.name ?? "Proyecto", href: `/changelog/${projectId}` },
        { label: `v${version}` },
      ]}
    >
      <div className="mx-auto w-full max-w-3xl p-6">
        <div className="mb-8 flex items-center justify-between">
          <Button variant="ghost" size="sm" asChild>
            <Link href={`/changelog/${projectId}`}>Volver</Link>
          </Button>
          {isFirebaseProject && isAdmin ? (
            <Button onClick={() => setEditDialogOpen(true)} variant="outline" size="sm">
              <PencilIcon className="mr-2 size-4" />
              Editar
            </Button>
          ) : null}
        </div>

        <header className="mb-12">
          <div className="flex items-center gap-3">
            <h1 className="font-heading text-3xl font-bold tracking-tight text-foreground">Versión {version}</h1>
            <Badge variant="outline">{formattedDate}</Badge>
          </div>
          <p className="mt-3 text-lg text-muted-foreground">{currentDescription}</p>
        </header>

        <div className="space-y-10">
          {Object.entries(sectionLabels).map(([key, { label, variant }]) => {
            const items = currentChanges?.[key as keyof typeof currentChanges];
            if (!items?.length) return null;

            return (
              <section key={key}>
                <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold text-foreground">
                  {label}
                  <Badge variant={variant} title={`${items.length} items`}>
                    {items.length}
                  </Badge>
                </h2>
                <ul className="space-y-3">
                  {items.map((item, index) => (
                    <li key={index} className="flex gap-3 text-sm text-foreground">
                      <span className="select-none text-muted-foreground">•</span>
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}
        </div>

        {isFirebaseProject && entry?.collaborators && entry.collaborators.length > 0 ? (
          <div className="mt-12 border-t pt-8">
            <h3 className="mb-4 font-semibold">Colaboradores</h3>
            <div className="flex flex-wrap gap-2">
              {entry.collaborators.map((collab) => (
                <div key={collab.email} className="rounded-full bg-muted px-3 py-1 text-sm">
                  <UserIcon className="mr-1 inline size-3" />
                  {collab.name || collab.email}
                </div>
              ))}
            </div>
          </div>
        ) : null}

        {isFirebaseProject && entry?.attachments && entry.attachments.length > 0 ? (
          <div className="mt-8">
            <h3 className="mb-4 font-semibold">Archivos adjuntos</h3>
            <div className="space-y-2">
              {entry.attachments.map((att) => (
                <a
                  key={att.url}
                  href={att.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 rounded border p-3 hover:bg-muted"
                >
                  <AttachmentIcon type={att.type} />
                  <span className="flex-1 truncate">{att.name}</span>
                  <LinkIcon className="size-4 text-muted-foreground" />
                </a>
              ))}
            </div>
          </div>
        ) : null}

        <footer className="mt-16 flex justify-between border-t border-border pt-8">
          {prevVersion ? (
            <Link
              href={`/changelog/${projectId}/${prevVersion}`}
              className="text-sm text-muted-foreground transition-colors hover:text-foreground"
            >
              ← v{prevVersion}
            </Link>
          ) : (
            <span />
          )}
          {nextVersion ? (
            <Link
              href={`/changelog/${projectId}/${nextVersion}`}
              className="text-sm text-muted-foreground transition-colors hover:text-foreground"
            >
              v{nextVersion} →
            </Link>
          ) : (
            <span />
          )}
        </footer>

        {isFirebaseProject && entry ? (
          <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
            <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Editar entrada - {project?.name}</DialogTitle>
              </DialogHeader>
              {project && firebaseProjectId && (
                <NewChangelogForm
                  projectId={firebaseProjectId}
                  entryId={entry.id}
                  onClose={() => {
                    setEditDialogOpen(false);
                    void refetchEntry();
                  }}
                />
              )}
            </DialogContent>
          </Dialog>
        ) : null}
      </div>
    </OperationsShell>
  );
}
