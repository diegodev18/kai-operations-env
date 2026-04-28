"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import {
  BookOpenIcon,
  CopyIcon as CopyIconLucide,
  FolderSearchIcon,
  LayoutDashboardIcon,
  MegaphoneIcon,
  MenuIcon,
  PencilIcon,
  Table2Icon,
  UploadIcon,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { ChangelogNavItem, UserMenu } from "@/components/shared";

export type DatabaseOperationsChromeProps = {
  /** Texto del segundo segmento del breadcrumb (muted), p. ej. "Subir datos" o "Tablas dinámicas". */
  breadcrumbLast: string;
  userName: string | null | undefined;
  userEmail: string | null | undefined;
  userImage?: string | null | undefined;
  onSignOut: () => void | Promise<void>;
  children: ReactNode;
};

export function DatabaseOperationsChrome(props: DatabaseOperationsChromeProps) {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="flex h-14 shrink-0 items-center justify-between border-b px-4">
        <div className="flex items-center gap-2 font-semibold">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-9"
            onClick={() => setMenuOpen(!menuOpen)}
          >
            <MenuIcon className="size-5" />
          </Button>
          <LayoutDashboardIcon className="size-5" />
          <span>Operaciones</span>
          <span className="text-muted-foreground">/</span>
          <span className="text-muted-foreground">{props.breadcrumbLast}</span>
        </div>
        <UserMenu
          userName={props.userName}
          userEmail={props.userEmail}
          userImage={props.userImage}
          onSignOut={() => void props.onSignOut()}
        />
      </header>

      <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
        <SheetContent side="left" className="w-64">
          <SheetHeader>
            <SheetTitle>Menú</SheetTitle>
          </SheetHeader>
          <nav className="mt-4 flex flex-col gap-1 px-2">
            <Link
              href="/"
              className="flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-foreground hover:bg-muted"
              onClick={() => setMenuOpen(false)}
            >
              <LayoutDashboardIcon className="size-4" />
              Inicio
            </Link>
            <ChangelogNavItem onClick={() => setMenuOpen(false)} />
            <Link
              href="/blog"
              className="flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-foreground hover:bg-muted"
              onClick={() => setMenuOpen(false)}
            >
              <BookOpenIcon className="size-4" />
              Lecciones
            </Link>
            <Link
              href="/blog-actuality"
              className="flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-foreground hover:bg-muted"
              onClick={() => setMenuOpen(false)}
            >
              <MegaphoneIcon className="size-4" />
              Actualidad
            </Link>
            <div className="my-2 border-t" />
            <div className="px-3 py-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Database
            </div>
            <Link
              href="/database"
              className="flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-foreground hover:bg-muted"
              onClick={() => setMenuOpen(false)}
            >
              <FolderSearchIcon className="size-4" />
              Servicios
            </Link>
            <Link
              href="/database/upload-data"
              className="flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-foreground hover:bg-muted"
              onClick={() => setMenuOpen(false)}
            >
              <UploadIcon className="size-4" />
              Upload data
            </Link>
            <Link
              href="/database/duplicate-clone"
              className="flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-foreground hover:bg-muted"
              onClick={() => setMenuOpen(false)}
            >
              <CopyIconLucide className="size-4" />
              Duplicate / clone
            </Link>
            <Link
              href="/database/update-document"
              className="flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-foreground hover:bg-muted"
              onClick={() => setMenuOpen(false)}
            >
              <PencilIcon className="size-4" />
              Update document
            </Link>
            <Link
              href="/database/viewer-comparator"
              className="flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-foreground hover:bg-muted"
              onClick={() => setMenuOpen(false)}
            >
              <CopyIconLucide className="size-4" />
              Viewer and comparator
            </Link>
            <Link
              href="/database/document-explorer"
              className="flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-foreground hover:bg-muted"
              onClick={() => setMenuOpen(false)}
            >
              <FolderSearchIcon className="size-4" />
              Document explorer
            </Link>
            <div className="my-2 border-t" />
            <div className="px-3 py-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Esquemas
            </div>
            <Link
              href="/dynamic-tables"
              className="flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-foreground hover:bg-muted"
              onClick={() => setMenuOpen(false)}
            >
              <Table2Icon className="size-4" />
              Tablas dinámicas
            </Link>
          </nav>
        </SheetContent>
      </Sheet>

      {props.children}
    </div>
  );
}
