"use client";

import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { UserMenu } from "@/components/user-menu";
import { useAuth } from "@/hooks/auth";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Copy,
  Pencil,
  Upload,
  ChevronRightIcon,
  GitCompare,
  FolderSearch,
  MenuIcon,
  LayoutDashboardIcon,
  LayoutGridIcon,
  BookOpenIcon,
  UploadIcon as UploadIconLucide,
  CopyIcon as CopyIconLucide,
  PencilIcon,
  FolderSearch as FolderSearchIcon,
} from "lucide-react";

const SERVICES = [
  {
    id: "upload-data",
    title: "Upload data",
    description:
      "Sube documentos a una colección de Firestore: pega JSON, sube archivo .json, preview de colección, opciones merge y sobrescribir, progreso por lotes.",
    href: "/database/upload-data",
    icon: Upload,
    visual: (
      <div className="flex items-center gap-2 h-20 animate-card-visual">
        <div className="w-8 h-8 rounded bg-muted-foreground/20" />
        <div className="flex flex-col gap-1">
          <div className="w-14 h-1.5 rounded bg-muted-foreground/20" />
          <div className="w-10 h-1.5 rounded bg-muted-foreground/20" />
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
      <div className="flex items-center gap-2 h-20 animate-card-visual">
        <div className="w-8 h-8 rounded bg-muted-foreground/20" />
        <div className="flex gap-1">
          <div className="w-6 h-1.5 rounded bg-muted-foreground/20" />
          <div className="w-6 h-1.5 rounded bg-muted-foreground/20" />
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
      <div className="flex items-center gap-2 h-20 animate-card-visual">
        <div className="w-8 h-8 rounded bg-muted-foreground/20" />
        <div className="w-12 h-1.5 rounded bg-muted-foreground/20" />
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
      <div className="flex items-center gap-2 h-20 animate-card-visual">
        <div className="w-8 h-8 rounded bg-muted-foreground/20" />
        <div className="flex gap-1">
          <div className="w-8 h-1.5 rounded bg-muted-foreground/20" />
          <div className="w-6 h-1.5 rounded bg-muted-foreground/20" />
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
      <div className="flex items-center gap-2 h-20 animate-card-visual">
        <div className="w-8 h-8 rounded bg-muted-foreground/20" />
        <div className="w-10 h-1.5 rounded bg-muted-foreground/20" />
      </div>
    ),
  },
] as const;

export default function DataBasePage() {
  const { session, signOut } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);

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
          <span className="text-muted-foreground">Database</span>
        </div>
        <UserMenu
          userName={session?.user?.name}
          userEmail={session?.user?.email}
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
            <Link href="/changelog" className="flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-foreground hover:bg-muted" onClick={() => setMenuOpen(false)}>
              <LayoutGridIcon className="size-4" />
              Changelog
            </Link>
            <Link href="/blog" className="flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-foreground hover:bg-muted" onClick={() => setMenuOpen(false)}>
              <BookOpenIcon className="size-4" />
              Blog
            </Link>
            <div className="my-2 border-t" />
            <div className="px-3 py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Database</div>
            <Link href="/database" className="flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-foreground hover:bg-muted" onClick={() => setMenuOpen(false)}>
              <FolderSearchIcon className="size-4" />
              Servicios
            </Link>
            <Link href="/database/upload-data" className="flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-foreground hover:bg-muted" onClick={() => setMenuOpen(false)}>
              <UploadIconLucide className="size-4" />
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

      <main className="mx-auto w-full max-w-5xl flex-1 space-y-6 p-6">
        <div>
          <p className="text-sm text-muted-foreground">Herramientas para gestionar datos en Firestore.</p>
        </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {SERVICES.map(({ id, title, description, href, icon: Icon, visual }) => (
          <Link key={id} href={href} className="block group">
            <Card className="h-full bg-card/80 hover:bg-card border-border/50 transition-colors overflow-hidden">
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex flex-col gap-2">
                    <div className="p-2 rounded-lg bg-muted/50 w-fit">
                      <Icon className="w-5 h-5 text-muted-foreground" />
                    </div>
                    <CardTitle className="text-lg">{title}</CardTitle>
                  </div>
                  <ChevronRightIcon className="w-5 h-5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
                </div>
                <CardDescription className="text-sm">{description}</CardDescription>
              </CardHeader>
              <CardContent className="pt-0 flex items-end justify-end">{visual}</CardContent>
            </Card>
          </Link>
          ))}
        </div>
      </main>
    </div>
  );
}