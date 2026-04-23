"use client";

import { notFound } from "next/navigation";
import Link from "next/link";
import { getProjectById, canEditChangelogEntry, type DbChangelogEntry } from "../changelog-data";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useAuth, useUserRole } from "@/hooks";
import {
  ArrowLeftIcon,
  HomeIcon,
  UserIcon,
  LinkIcon,
  FileIcon,
  VideoIcon,
  ImageIcon,
  PencilIcon,
} from "lucide-react";
import { useState, useEffect, useCallback } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import NewChangelogForm from "./new-changelog-form";

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
  projectId: "panel" | "tools" | "agents";
}

export function ChangelogVersionPage({ version, projectId }: ChangelogVersionPageProps) {
  const project = getProjectById(projectId);
  const { session } = useAuth();
  const { isAdmin } = useUserRole();
  const [entry, setEntry] = useState<DbChangelogEntry | null>(null);
  const [loading, setLoading] = useState(true);
  const [editDialogOpen, setEditDialogOpen] = useState(false);

  const sessionUser = session?.user
    ? {
        id: session.user.id,
        email: (session.user as { email?: string }).email,
      }
    : null;

  const refetchEntry = useCallback(async () => {
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
  }, [version, projectId]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/changelogs/${projectId}?version=${version}`, {
          cache: "no-store",
        });
        if (res.ok && !cancelled) {
          const data = await res.json();
          setEntry(data.entry || null);
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
  }, [version, projectId]);

  if (loading) {
    return (
      <div className="min-h-screen bg-background p-8">
        <div className="mx-auto max-w-3xl">
          <div className="h-96 animate-pulse rounded-lg bg-muted" />
        </div>
      </div>
    );
  }

  if (!entry) {
    notFound();
  }

  if (!canEditChangelogEntry(entry, sessionUser)) {
    notFound();
  }

  return (
    <div className="min-h-screen bg-background p-8">
      <div className="mx-auto max-w-3xl">
        <div className="mb-8 flex items-center justify-between">
          <Button variant="outline" size="sm" asChild>
            <Link href={`/changelog/${projectId}`}>
              <ArrowLeftIcon className="mr-2 size-4" />
              Volver al changelog
            </Link>
          </Button>
          <Button variant="outline" size="sm" asChild>
            <Link href="/">
              <HomeIcon className="mr-2 size-4" />
              Home
            </Link>
          </Button>
        </div>

        <div className="rounded-lg border bg-card p-8">
          <h1 className="font-heading mb-2 text-3xl font-bold">v{entry.version}</h1>
          <p className="mb-6 text-sm text-muted-foreground">{entry.implementationDate}</p>
          <p className="mb-8 text-lg text-foreground">{entry.description}</p>

          <div className="space-y-8">
            {Object.entries(entry.changes).map(([section, items]) => {
              if (!items || items.length === 0) return null;
              const { label, variant } = sectionLabels[section] || { label: section, variant: "default" as const };
              return (
                <div key={section}>
                  <Badge variant={variant} className="mb-3">
                    {label}
                  </Badge>
                  <ul className="space-y-2">
                    {items.map((item, idx) => (
                      <li key={idx} className="ml-4 flex items-start gap-3">
                        <span className="mt-1.5 size-1.5 flex-shrink-0 rounded-full bg-foreground" />
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </div>

          {entry.collaborators && entry.collaborators.length > 0 && (
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
          )}

          {entry.attachments && entry.attachments.length > 0 && (
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
          )}

          {isAdmin && (
            <div className="mt-12 border-t pt-8">
              <Button
                onClick={() => setEditDialogOpen(true)}
                variant="outline"
                size="sm"
                className="w-full sm:w-auto"
              >
                <PencilIcon className="mr-2 size-4" />
                Editar
              </Button>
            </div>
          )}
        </div>

        <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
          <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Editar entrada - {project?.name}</DialogTitle>
            </DialogHeader>
            {project && entry && (
              <NewChangelogForm
                projectId={projectId}
                entryId={entry.id}
                onClose={() => {
                  setEditDialogOpen(false);
                  void refetchEntry();
                }}
              />
            )}
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}
