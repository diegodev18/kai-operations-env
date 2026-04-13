"use client";

import { useParams, notFound } from "next/navigation";
import Link from "next/link";
import { getVersion, getAtlasVersions } from "../../changelog-data";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ArrowLeftIcon, HomeIcon } from "lucide-react";

const sectionLabels: Record<string, { label: string; variant: "default" | "secondary" | "outline" | "destructive" }> = {
  added: { label: "Añadido", variant: "default" },
  changed: { label: "Cambiado", variant: "secondary" },
  fixed: { label: "Corregido", variant: "outline" },
  removed: { label: "Eliminado", variant: "destructive" },
  improved: { label: "Mejorado", variant: "secondary" },
};

export default function AtlasVersionPage() {
  const params = useParams();
  const version = params.version as string;
  const entry = getVersion(version);
  const versions = getAtlasVersions();

  if (!entry) {
    notFound();
  }

  const currentIndex = versions.findIndex((v) => v.version === version);
  const prevVersion = currentIndex < versions.length - 1 ? versions[currentIndex + 1]?.version : null;
  const nextVersion = currentIndex > 0 ? versions[currentIndex - 1]?.version : null;

  return (
    <div className="min-h-screen bg-background p-8">
      <div className="mx-auto max-w-3xl">
        <header className="mb-6 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" asChild>
              <Link href="/changelog/atlas">
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
          <Link href="/changelog/atlas" className="text-muted-foreground hover:text-foreground transition-colors">
            Atlas
          </Link>
          <span className="text-muted-foreground">/</span>
          <span className="text-foreground">v{version}</span>
        </nav>

        <header className="mb-12">
          <div className="flex items-center gap-3">
            <h1 className="font-heading text-3xl font-bold tracking-tight text-foreground">
              Versión {version}
            </h1>
            <Badge variant="outline">
              {new Date(entry.date).toLocaleDateString("es-ES", {
                year: "numeric",
                month: "short",
                day: "numeric",
              })}
            </Badge>
          </div>
          <p className="mt-3 text-lg text-muted-foreground">{entry.description}</p>
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

        <footer className="mt-16 flex justify-between border-t border-border pt-8">
          {prevVersion ? (
            <Link
              href={`/changelog/atlas/${prevVersion}`}
              className="text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              ← v{prevVersion}
            </Link>
          ) : (
            <span />
          )}
          {nextVersion ? (
            <Link
              href={`/changelog/atlas/${nextVersion}`}
              className="text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              v{nextVersion} →
            </Link>
          ) : (
            <span />
          )}
        </footer>
      </div>
    </div>
  );
}