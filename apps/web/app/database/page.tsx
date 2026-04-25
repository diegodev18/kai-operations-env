"use client";

import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { DatabaseOperationsChrome } from "@/components/database/database-operations-chrome";
import { useAuth, useUserRole } from "@/hooks";
import {
  Copy,
  Pencil,
  Upload,
  ChevronRightIcon,
  GitCompare,
  FolderSearch,
  Table2,
} from "lucide-react";

const DATABASE_SERVICES = [
  {
    id: "upload-data",
    title: "Upload data",
    description:
      "Sube documentos a una colección de Firestore: pega JSON, sube archivo .json, preview de colección, opciones merge y sobrescribir, progreso por lotes.",
    href: "/database/upload-data",
    icon: Upload,
    visual: (
      <div className="flex h-20 animate-card-visual items-center gap-2">
        <div className="h-8 w-8 rounded bg-muted-foreground/20" />
        <div className="flex flex-col gap-1">
          <div className="h-1.5 w-14 rounded bg-muted-foreground/20" />
          <div className="h-1.5 w-10 rounded bg-muted-foreground/20" />
        </div>
      </div>
    ),
  },
  {
    id: "duplicate-clone",
    title: "Duplicate / clone",
    description:
      "Duplica colecciones o documentos entre ambientes (testing/production). Clonación recursiva con selección de subcolecciones por checkbox.",
    href: "/database/duplicate-clone",
    icon: Copy,
    visual: (
      <div className="flex h-20 animate-card-visual items-center gap-2">
        <div className="h-8 w-8 rounded bg-muted-foreground/20" />
        <div className="flex gap-1">
          <div className="h-1.5 w-6 rounded bg-muted-foreground/20" />
          <div className="h-1.5 w-6 rounded bg-muted-foreground/20" />
        </div>
      </div>
    ),
  },
  {
    id: "update-document",
    title: "Update document",
    description:
      "Actualiza un documento por ruta: carga el actual, edita el JSON (Timestamp/GeoPoint en formato serializado) y aplica merge o reemplazo.",
    href: "/database/update-document",
    icon: Pencil,
    visual: (
      <div className="flex h-20 animate-card-visual items-center gap-2">
        <div className="h-8 w-8 rounded bg-muted-foreground/20" />
        <div className="h-1.5 w-12 rounded bg-muted-foreground/20" />
      </div>
    ),
  },
  {
    id: "viewer-compare",
    title: "Viewer and comparator",
    description:
      "Carga varios documentos por ruta y ambiente, compara diferencias (diff o tabla) y edita un documento desde la vista.",
    href: "/database/viewer-comparator",
    icon: GitCompare,
    visual: (
      <div className="flex h-20 animate-card-visual items-center gap-2">
        <div className="h-8 w-8 rounded bg-muted-foreground/20" />
        <div className="flex gap-1">
          <div className="h-1.5 w-8 rounded bg-muted-foreground/20" />
          <div className="h-1.5 w-6 rounded bg-muted-foreground/20" />
        </div>
      </div>
    ),
  },
  {
    id: "document-explorer",
    title: "Document explorer",
    description:
      "Explora documentos y colecciones con vista JSON legible, herramientas de copia/exportación y navegación por subcolecciones.",
    href: "/database/document-explorer",
    icon: FolderSearch,
    visual: (
      <div className="flex h-20 animate-card-visual items-center gap-2">
        <div className="h-8 w-8 rounded bg-muted-foreground/20" />
        <div className="h-1.5 w-10 rounded bg-muted-foreground/20" />
      </div>
    ),
  },
] as const;

const ESQUEMAS_SERVICES = [
  {
    id: "dynamic-tables",
    title: "Tablas dinámicas",
    description:
      "Define esquemas (columnas, tipos, filtros) para colecciones de Firestore; los documentos viven en dynamic_table_schemas.",
    href: "/dynamic-tables",
    icon: Table2,
    visual: (
      <div className="flex h-20 animate-card-visual items-center gap-2">
        <div className="h-8 w-8 rounded bg-muted-foreground/20" />
        <div className="grid h-8 w-10 grid-cols-2 gap-0.5">
          <div className="rounded-sm bg-muted-foreground/25" />
          <div className="rounded-sm bg-muted-foreground/25" />
          <div className="rounded-sm bg-muted-foreground/25" />
          <div className="rounded-sm bg-muted-foreground/25" />
        </div>
      </div>
    ),
  },
] as const;

export default function DataBasePage() {
  const { session, signOut } = useAuth();
  const { isAdmin } = useUserRole();

  if (!isAdmin) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center">
        <p className="text-muted-foreground">No tienes acceso a esta página.</p>
      </div>
    );
  }

  return (
    <DatabaseOperationsChrome
      breadcrumbLast="Database"
      userName={session?.user?.name}
      userEmail={session?.user?.email}
      userImage={(session?.user as { image?: string | null })?.image}
      onSignOut={() => void signOut()}
    >
      <main className="mx-auto w-full max-w-5xl flex-1 space-y-8 p-6">
        <div>
          <p className="text-sm text-muted-foreground">Herramientas para gestionar datos en Firestore.</p>
        </div>
        <section className="space-y-3">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Database</h2>
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
            {DATABASE_SERVICES.map(({ id, title, description, href, icon: Icon, visual }) => (
              <Link key={id} href={href} className="group block">
                <Card className="h-full overflow-hidden border-border/50 bg-card/80 transition-colors hover:bg-card">
                  <CardHeader className="pb-2">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex flex-col gap-2">
                        <div className="w-fit rounded-lg bg-muted/50 p-2">
                          <Icon className="h-5 w-5 text-muted-foreground" />
                        </div>
                        <CardTitle className="text-lg">{title}</CardTitle>
                      </div>
                      <ChevronRightIcon className="h-5 w-5 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
                    </div>
                    <CardDescription className="text-sm">{description}</CardDescription>
                  </CardHeader>
                  <CardContent className="flex items-end justify-end pt-0">{visual}</CardContent>
                </Card>
              </Link>
            ))}
          </div>
        </section>
        <section className="space-y-3">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Esquemas</h2>
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
            {ESQUEMAS_SERVICES.map(({ id, title, description, href, icon: Icon, visual }) => (
              <Link key={id} href={href} className="group block">
                <Card className="h-full overflow-hidden border-border/50 bg-card/80 transition-colors hover:bg-card">
                  <CardHeader className="pb-2">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex flex-col gap-2">
                        <div className="w-fit rounded-lg bg-muted/50 p-2">
                          <Icon className="h-5 w-5 text-muted-foreground" />
                        </div>
                        <CardTitle className="text-lg">{title}</CardTitle>
                      </div>
                      <ChevronRightIcon className="h-5 w-5 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
                    </div>
                    <CardDescription className="text-sm">{description}</CardDescription>
                  </CardHeader>
                  <CardContent className="flex items-end justify-end pt-0">{visual}</CardContent>
                </Card>
              </Link>
            ))}
          </div>
        </section>
      </main>
    </DatabaseOperationsChrome>
  );
}
