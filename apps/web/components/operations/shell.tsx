"use client";

import { useCallback, useState } from "react";
import { toast } from "sonner";
import { SendTipDialog } from "@/components/bonuses/send-tip-dialog";
import { useActivity, useTips, useTeamMembers } from "@/hooks";
import type { Tip } from "@/types";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import Link from "next/link";
import {
  BookOpenIcon,
  BriefcaseIcon,
  BuildingIcon,
  ChevronDownIcon,
  GiftIcon,
  CopyIcon,
  FolderOpenIcon,
  LayoutDashboardIcon,
  ListTodoIcon,
  MegaphoneIcon,
  MenuIcon,
  PencilIcon,
  PlusIcon,
  SearchIcon,
  Table2Icon,
  UploadIcon,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { ChangelogNavItem, UserMenu } from "@/components/shared";
import { useAuth, useUserRole } from "@/hooks";

export type BreadcrumbSegment = { label: string; href?: string };

export function OperationsShell(props: {
  breadcrumb: BreadcrumbSegment[];
  children: React.ReactNode;
}) {
  const { session, signOut } = useAuth();
  const { role, isAdmin } = useUserRole();
  const isCommercial = role === "commercial";
  const [menuOpen, setMenuOpen] = useState(false);
  const [sendTipOpen, setSendTipOpen] = useState(false);
  const { members } = useTeamMembers();
  const { send, refetch: refetchTips } = useTips();

  const handleNewReceivedTip = useCallback((tip: Tip & { type: "tip" }) => {
    toast.success(`¡Recibiste una propina de $${tip.amount} MXN de ${tip.senderName}! 🎉`, {
      description: tip.description,
      duration: 6000,
    });
  }, []);

  useActivity({
    currentUserId: session?.user?.id,
    onNewReceivedTip: handleNewReceivedTip,
  });
  const [defaultBuilderMode] = useState<"form" | "conversational">(() => {
    if (typeof window === "undefined") return "form";
    const stored = localStorage.getItem("agent-builder-default-mode");
    if (stored === "form" || stored === "conversational") return stored;
    return "form";
  });

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="flex h-14 shrink-0 items-center justify-between border-b px-4">
        <div className="flex min-w-0 flex-1 items-center gap-2 font-semibold text-foreground">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-9 shrink-0"
            onClick={() => setMenuOpen(!menuOpen)}
          >
            <MenuIcon className="size-5" />
          </Button>
          <LayoutDashboardIcon className="size-5 shrink-0" />
          <nav
            className="flex min-w-0 items-center gap-1.5 text-sm sm:text-base"
            aria-label="Migas de pan"
          >
            {props.breadcrumb.map((seg, i) => {
              const isLast = i === props.breadcrumb.length - 1;
              return (
                <span key={`${seg.label}-${i}`} className="flex min-w-0 items-center gap-1.5">
                  {i > 0 ? (
                    <span className="text-muted-foreground" aria-hidden>
                      /
                    </span>
                  ) : null}
                  {seg.href && !isLast ? (
                    <Link
                      href={seg.href}
                      className="truncate text-muted-foreground transition-colors hover:text-foreground"
                    >
                      {seg.label}
                    </Link>
                  ) : (
                    <span
                      className={
                        isLast
                          ? "truncate text-foreground"
                          : "truncate text-muted-foreground"
                      }
                    >
                      {seg.label}
                    </span>
                  )}
                </span>
              );
            })}
          </nav>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {(isAdmin || isCommercial) && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" className="gap-1.5">
                  <BuildingIcon className="size-4" />
                  CRM
                  <ChevronDownIcon className="size-3 opacity-60" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem asChild>
                  <Link href="/crm/companies" className="flex items-center gap-2">
                    <BuildingIcon className="size-4" />
                    Empresas
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link href="/crm/opportunities" className="flex items-center gap-2">
                    <BriefcaseIcon className="size-4" />
                    Oportunidades
                  </Link>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="size-9"
                onClick={() => setSendTipOpen(true)}
              >
                <GiftIcon className="size-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">Enviar propina</TooltipContent>
          </Tooltip>
          {session?.user ? (
            <UserMenu
              userName={session.user.name}
              userEmail={session.user.email}
              userImage={(session.user as { image?: string | null }).image}
              onSignOut={() => void signOut()}
            />
          ) : (
            <Button variant="outline" size="sm" asChild>
              <Link href="/">Iniciar sesión</Link>
            </Button>
          )}
        </div>
      </header>

      <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
        <SheetContent side="left" className="w-64 overflow-y-auto">
          <SheetHeader>
            <SheetTitle>Menú</SheetTitle>
          </SheetHeader>
          <nav className="mt-4 flex flex-col gap-1 px-2 pb-6">
            <Link
              href="/"
              className="flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-foreground hover:bg-muted"
              onClick={() => setMenuOpen(false)}
            >
              <LayoutDashboardIcon className="size-4" />
              Inicio
            </Link>
            <Link
              href={`/agents/new?mode=${defaultBuilderMode}`}
              className="flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-foreground hover:bg-muted"
              onClick={() => setMenuOpen(false)}
            >
              <PlusIcon className="size-4" />
              Crear agente
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
              Tareas
            </div>
            <Link
              href="/tasks"
              className="flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-foreground hover:bg-muted"
              onClick={() => setMenuOpen(false)}
            >
              <ListTodoIcon className="size-4" />
              Panel global
            </Link>
            <div className="my-2 border-t" />
            <div className="px-3 py-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Bonificaciones
            </div>
            <Link
              href="/bonuses"
              className="flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-foreground hover:bg-muted"
              onClick={() => setMenuOpen(false)}
            >
              <GiftIcon className="size-4" />
              Propinas
            </Link>
            {(isAdmin || isCommercial) && (
              <>
                <div className="my-2 border-t" />
                <div className="px-3 py-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  CRM
                </div>
                <Link
                  href="/crm/companies"
                  className="flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-foreground hover:bg-muted"
                  onClick={() => setMenuOpen(false)}
                >
                  <BuildingIcon className="size-4" />
                  Empresas
                </Link>
                <Link
                  href="/crm/opportunities"
                  className="flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-foreground hover:bg-muted"
                  onClick={() => setMenuOpen(false)}
                >
                  <BriefcaseIcon className="size-4" />
                  Oportunidades
                </Link>
              </>
            )}
            <div className="my-2 border-t" />
            {isAdmin && (
              <>
                <div className="px-3 py-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Database
                </div>
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
                  <CopyIcon className="size-4" />
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
                  <SearchIcon className="size-4" />
                  Viewer and comparator
                </Link>
                <Link
                  href="/database/document-explorer"
                  className="flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-foreground hover:bg-muted"
                  onClick={() => setMenuOpen(false)}
                >
                  <FolderOpenIcon className="size-4" />
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
              </>
            )}
          </nav>
        </SheetContent>
      </Sheet>

      <main className="flex min-h-0 flex-1 flex-col">{props.children}</main>

      <SendTipDialog
        open={sendTipOpen}
        onOpenChange={setSendTipOpen}
        members={members}
        currentUserId={session?.user?.id}
        onSend={async (input) => {
          const res = await send(input);
          if (res.ok) void refetchTips();
          return res;
        }}
      />
    </div>
  );
}
