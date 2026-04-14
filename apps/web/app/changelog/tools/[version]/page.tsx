"use client";

import { useParams, notFound } from "next/navigation";
import Link from "next/link";
import { getProjectById, canEditChangelogEntry } from "../../changelog-data";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/auth";
import { useUserRole } from "@/hooks/useUserRole";
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
import type { DbChangelogEntry } from "../../changelog-data";
import { useState, useEffect, useCallback } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import NewChangelogForm from "../../components/new-changelog-form";

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

export default function ToolsVersionPage() {
  const params = useParams();
  const version = params.version as string;
  const project = getProjectById("tools");
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
      const res = await fetch(`/api/changelogs/tools?version=${version}`, {
        cache: "no-store",
      });
      if (res.ok) {
        const data = await res.json();
        setEntry(data.entry || null);
      }
    } catch (error) {
      console.error("[changelog] fetch error:", error);
    }
  }, [version]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/changelogs/tools?version=${version}`, {
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
  }, [version]);

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

  return (
    <div className="min-h-screen bg-background p-8">
      <div className="mx-auto max-w-3xl">
        <header className="mb-6 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" asChild>
              <Link href="/changelog/tools">
                <ArrowLeftIcon className="size-4 mr-2" />
                Volver
              </Link>
            </Button>
            <Button variant="ghost" size="sm" asChild>
              <Link href="/">
                <HomeIcon className="size-4" />
                Home
              </Link>
            </Button>
          </div>
        </header>

        <nav className="mb-8 flex items-center gap-2 text-sm">
          <Link href="/changelog" className="text-muted-foreground hover:text-foreground transition-colors">
            Changelog
          </Link>
          <span className="text-muted-foreground">/</span>
          <Link href="/changelog/tools" className="text-muted-foreground hover:text-foreground transition-colors">
            {project?.name}
          </Link>
          <span className="text-muted-foreground">/</span>
          <span className="text-foreground">v{version}</span>
        </nav>

        <header className="mb-8">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="font-heading text-3xl font-bold tracking-tight text-foreground">
              Versión {version}
            </h1>
            {entry.status === "draft" && (
              <Badge variant="secondary">Borrador</Badge>
            )}
            {isAdmin && entry.hidden ? (
              <Badge variant="outline">Oculta (solo admins)</Badge>
            ) : null}
            {canEditChangelogEntry(entry, sessionUser) ? (
              <Button
                variant="outline"
                size="icon"
                className="size-9 shrink-0"
                aria-label="Editar entrada"
                title="Editar"
                onClick={() => setEditDialogOpen(true)}
              >
                <PencilIcon className="size-4" />
              </Button>
            ) : null}
          </div>

          <div className="mt-3 flex flex-wrap gap-4 text-sm text-muted-foreground">
            <div className="flex items-center gap-1">
              <UserIcon className="size-4" />
              <span>{entry.author.name}</span>
            </div>
            {entry.collaborators.length > 0 && (
              <div className="flex items-center gap-1">
                <span>Colaboradores:</span>
                {entry.collaborators.map((c) => c.name).join(", ")}
              </div>
            )}
            <div>
              Registro: {new Date(entry.registerDate).toLocaleDateString("es-ES")}
            </div>
            <div>
              Implementación: {new Date(entry.implementationDate).toLocaleDateString("es-ES")}
            </div>
          </div>

          <p className="mt-3 text-lg text-muted-foreground">{entry.description}</p>

          {entry.ticketUrl && (
            <div className="mt-3 flex items-center gap-2">
              <LinkIcon className="size-4 text-muted-foreground" />
              <Link
                href={entry.ticketUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary hover:underline"
              >
                Ver ticket
              </Link>
            </div>
          )}

          {entry.createTicket && (
            <div className="mt-2">
              <Badge variant="outline">Ticket pendiente</Badge>
            </div>
          )}

          {entry.tags && entry.tags.length > 0 && (
            <div className="mt-3 flex gap-2">
              {entry.tags.map((tag) => (
                <Badge key={tag} variant="outline">
                  {tag}
                </Badge>
              ))}
            </div>
          )}
        </header>

        <div className="space-y-10">
          {Object.entries(sectionLabels).map(([key, { label, variant }]) => {
            const items = entry.changes[key as keyof typeof entry.changes];
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
                      <span className="text-muted-foreground select-none">•</span>
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}
        </div>

        {entry.attachments.length > 0 && (
          <section className="mt-10">
            <h2 className="mb-4 text-lg font-semibold text-foreground">Adjuntos</h2>
            <div className="grid gap-4 sm:grid-cols-2">
              {entry.attachments.map((att, index) => (
                <a
                  key={index}
                  href={att.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-3 rounded-lg border border-border p-3 hover:bg-muted/50"
                >
                  <AttachmentIcon type={att.type} />
                  <span className="text-sm truncate">{att.name}</span>
                </a>
              ))}
            </div>
          </section>
        )}

        {entry.internalNotes && (
          <section className="mt-10">
            <h2 className="mb-4 text-lg font-semibold text-foreground">Notas internas</h2>
            <div className="rounded-lg bg-muted/50 p-4 text-sm">
              {entry.internalNotes}
            </div>
          </section>
        )}
      </div>

      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Editar entrada - {project?.name}</DialogTitle>
          </DialogHeader>
          {entry ? (
            <NewChangelogForm
              key={entry.id}
              projectId="tools"
              entryId={entry.id}
              onClose={() => setEditDialogOpen(false)}
              onSaved={refetchEntry}
            />
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}