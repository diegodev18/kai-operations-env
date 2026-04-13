"use client";

import { Fragment, useCallback, useEffect, useMemo, useState, useRef } from "react";
import {
  AlertCircleIcon,
  BanknoteIcon,
  BookOpenIcon,
  Building2Icon,
  CalendarIcon,
  CheckCircleIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  CloudDownloadIcon,
  CopyIcon,
  DatabaseIcon,
  FolderOpenIcon,
  LayoutDashboardIcon,
  LayoutGridIcon,
  Loader2Icon,
  MegaphoneIcon,
  MenuIcon,
  BotIcon,
  WrenchIcon,
  PauseCircleIcon,
  PencilIcon,
  PlusIcon,
  PowerIcon,
  SearchIcon,
  Settings2Icon,
  StarIcon,
  Trash2Icon,
  UploadIcon,
  XIcon,
} from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { UserMenu } from "@/components/user-menu";
import { useUserRole } from "@/hooks/useUserRole";
import { Input } from "@/components/ui/input";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type {
  AgentOperationalStatus,
  AgentWithOperations,
  PaymentRecord,
} from "@/lib/agent";
import {
  AGENTS_PAGE_SIZE,
  type AgentGrowerRow,
  deleteAgentGrower,
  fetchAgentGrowers,
  fetchAgentsPage,
  postAgentGrower,
  fetchAgentBilling,
  patchAgentBillingConfig,
  createPaymentRecord,
  deletePaymentRecord,
} from "@/lib/agents-api";
import {
  fetchOrganizationUsers,
  type OrganizationUser,
} from "@/lib/organization-api";

const STATUS_LABELS: Record<AgentOperationalStatus, string> = {
  active: "Activo",
  off: "Apagado",
  testing: "En Pruebas",
  suspended: "Suspendido",
};

const STATUS_BADGE_VARIANT: Record<
  AgentOperationalStatus,
  "default" | "secondary" | "destructive" | "outline"
> = {
  active: "default",
  off: "secondary",
  testing: "outline",
  suspended: "destructive",
};

type StatusFilter = "all" | AgentOperationalStatus;

export function OperationsDashboard(props: {
  userName: string | null | undefined;
  userEmail: string | null | undefined;
  onSignOut: () => void;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { isAdmin } = useUserRole();
  const [search, setSearch] = useState(() => searchParams.get("q") ?? "");
  /** Texto de búsqueda aplicado al API (debounce 300 ms; vacío al limpiar al instante). */
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [billingAlertOnly, setBillingAlertOnly] = useState(false);
  const [agents, setAgents] = useState<AgentWithOperations[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [isLoadingAll, setIsLoadingAll] = useState(false);
  const [isInitialLoad, setIsInitialLoad] = useState(true);
  const [nextCursor, setNextCursor] = useState<string | null | undefined>(
    undefined,
  );
  const [growerTarget, setGrowerTarget] = useState<{
    id: string;
    name: string;
  } | null>(null);
  const [orgUsers, setOrgUsers] = useState<OrganizationUser[]>([]);
  const [orgUsersLoading, setOrgUsersLoading] = useState(false);
  const [dialogGrowers, setDialogGrowers] = useState<AgentGrowerRow[]>([]);
  const [dialogGrowersLoading, setDialogGrowersLoading] = useState(false);
  const [addingGrowerUserId, setAddingGrowerUserId] = useState<string | null>(
    null,
  );

  type CobranzaFilter = "all" | "domiciliated" | "non-domiciliated" | "overdue";
  const [cobranzaFilter, setCobranzaFilter] = useState<CobranzaFilter>("all");
  const [lastPaymentFrom, setLastPaymentFrom] = useState("");
  const [lastPaymentTo, setLastPaymentTo] = useState("");
  const [expandedAgentId, setExpandedAgentId] = useState<string | null>(null);
  const [expandedPayments, setExpandedPayments] = useState<PaymentRecord[]>([]);
  const [paymentsLoading, setPaymentsLoading] = useState(false);
  const [billingDialogAgent, setBillingDialogAgent] =
    useState<AgentWithOperations | null>(null);
  const [billingSaving, setBillingSaving] = useState(false);
  const [billingDomiciliated, setBillingDomiciliated] = useState(false);
  const [billingDefaultAmount, setBillingDefaultAmount] = useState("");
  const [billingDueDate, setBillingDueDate] = useState("");
  const [paymentDialogOpen, setPaymentDialogOpen] = useState(false);
  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentPeriod, setPaymentPeriod] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("transferencia");
  const [paymentReference, setPaymentReference] = useState("");
  const [paymentNotes, setPaymentNotes] = useState("");
  const [paymentSaving, setPaymentSaving] = useState(false);
  const [defaultModeDialogOpen, setDefaultModeDialogOpen] = useState(false);
  const [defaultBuilderMode, setDefaultBuilderMode] = useState<
    "form" | "conversational"
  >("form");
  const [menuOpen, setMenuOpen] = useState(false);
  const [changelogSubmenuOpen, setChangelogSubmenuOpen] = useState(false);
  const changelogSubmenuTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  
  const handleChangelogMouseEnter = () => {
    if (changelogSubmenuTimeoutRef.current) {
      clearTimeout(changelogSubmenuTimeoutRef.current);
      changelogSubmenuTimeoutRef.current = null;
    }
    setChangelogSubmenuOpen(true);
  };
  
  const handleChangelogMouseLeave = () => {
    changelogSubmenuTimeoutRef.current = setTimeout(() => {
      setChangelogSubmenuOpen(false);
    }, 1000);
  };
  
  type FavoritesFilter = "all" | "favorites";
  const [favoritesFilter, setFavoritesFilter] =
    useState<FavoritesFilter>("all");
  const [isTogglingFavorite, setIsTogglingFavorite] = useState<string | null>(
    null,
  );

  useEffect(() => {
    const stored = localStorage.getItem("agent-builder-default-mode");
    if (stored === "form" || stored === "conversational") {
      setDefaultBuilderMode(stored);
    }
  }, []);

  useEffect(() => {
    const trimmed = search.trim();
    if (trimmed === "" || trimmed.length < 3) {
      setDebouncedSearch("");
      return;
    }
    const t = window.setTimeout(() => setDebouncedSearch(trimmed), 300);
    return () => window.clearTimeout(t);
  }, [search]);

  useEffect(() => {
    const q = search.trim();
    const currentQ = searchParams.get("q") ?? "";
    if (q !== currentQ) {
      const params = new URLSearchParams(searchParams.toString());
      if (q) {
        params.set("q", q);
      } else {
        params.delete("q");
      }
      router.replace(`?${params.toString()}`, { scroll: false });
    }
  }, [search, searchParams, router]);

  const fetchPage = useCallback(
    async (cursor: string | undefined, usePreview = false) => {
      const q = debouncedSearch.trim() || undefined;
      const serverSearchActive = debouncedSearch.trim().length >= 3;

      let filters:
        | { status?: string; billingAlert?: string; domiciliated?: string }
        | undefined;

      if (serverSearchActive) {
        if (statusFilter !== "all") {
          filters = { ...filters, status: statusFilter };
        }
        if (billingAlertOnly) {
          filters = { ...filters, billingAlert: "true" };
        }
        if (cobranzaFilter === "domiciliated") {
          filters = { ...filters, domiciliated: "true" };
        } else if (cobranzaFilter === "non-domiciliated") {
          filters = { ...filters, domiciliated: "false" };
        } else if (cobranzaFilter === "overdue") {
          filters = { ...filters, billingAlert: "true" };
        }
      }

      return fetchAgentsPage({
        light: true,
        paginated: true,
        pageSize: AGENTS_PAGE_SIZE,
        cursor,
        ...(q ? { q } : {}),
        ...(filters ? { filters } : {}),
        ...(usePreview ? { preview: true } : {}),
        ...(favoritesFilter === "favorites" ? { favorites: true } : {}),
      });
    },
    [
      debouncedSearch,
      statusFilter,
      billingAlertOnly,
      cobranzaFilter,
      favoritesFilter,
    ],
  );

  const fetchAgents = useCallback(async () => {
    setNextCursor(undefined);
    setAgents([]);
    setIsLoading(true);
    setIsInitialLoad(true);
    try {
      const result = await fetchPage(undefined, true);
      if (result == null) {
        toast.error("Error al cargar agentes");
        return;
      }
      setAgents(result.agents);
      setNextCursor(result.nextCursor);
    } catch {
      toast.error("Error al cargar agentes");
    } finally {
      setIsLoading(false);
      setIsInitialLoad(false);
    }
  }, [fetchPage]);

  // Effect to load agents when searchParams changes (initial load or q param changes)
  useEffect(() => {
    // Skip initial load if there's a search query - debouncedSearch will trigger the fetch
    const hasSearchQuery = searchParams.get("q");
    if (hasSearchQuery && !debouncedSearch) {
      return;
    }
    void fetchAgents();
  }, [fetchAgents, searchParams, debouncedSearch]);

  useEffect(() => {
    if (!growerTarget) {
      setOrgUsers([]);
      setDialogGrowers([]);
      return;
    }
    let cancelled = false;
    setOrgUsersLoading(true);
    setDialogGrowersLoading(true);
    void (async () => {
      const [usersRes, growersRes] = await Promise.all([
        fetchOrganizationUsers(),
        fetchAgentGrowers(growerTarget.id),
      ]);
      if (cancelled) return;
      setOrgUsersLoading(false);
      setDialogGrowersLoading(false);
      if (usersRes?.users) {
        setOrgUsers(usersRes.users);
      } else {
        setOrgUsers([]);
        toast.error("No se pudieron cargar los usuarios de la organización");
      }
      if (growersRes === null) {
        setDialogGrowers([]);
        toast.error("No se pudieron cargar los growers del agente");
      } else {
        setDialogGrowers(
          Array.isArray(growersRes.growers) ? growersRes.growers : [],
        );
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [growerTarget]);

  const loadMore = useCallback(async () => {
    if (
      nextCursor == null ||
      nextCursor === undefined ||
      isLoadingMore ||
      isLoadingAll
    )
      return;
    setIsLoadingMore(true);
    try {
      const result = await fetchPage(nextCursor);
      if (result == null) {
        toast.error("Error al cargar más agentes");
        return;
      }
      setAgents((prev) => [...prev, ...result.agents]);
      setNextCursor(result.nextCursor);
    } catch {
      toast.error("Error al cargar más agentes");
    } finally {
      setIsLoadingMore(false);
    }
  }, [fetchPage, nextCursor, isLoadingMore, isLoadingAll]);

  const loadAll = useCallback(async () => {
    if (
      nextCursor == null ||
      nextCursor === undefined ||
      isLoadingMore ||
      isLoadingAll
    )
      return;
    setIsLoadingAll(true);
    try {
      let cursor: string | undefined = nextCursor;
      while (cursor != null && cursor !== undefined) {
        const result = await fetchPage(cursor);
        if (result == null) {
          toast.error("Error al cargar todos los agentes");
          break;
        }
        setAgents((prev) => [...prev, ...result.agents]);
        cursor = result.nextCursor ?? undefined;
        setNextCursor(cursor ?? null);
      }
    } catch {
      toast.error("Error al cargar todos los agentes");
    } finally {
      setIsLoadingAll(false);
    }
  }, [fetchPage, nextCursor, isLoadingMore, isLoadingAll]);

  const agentGrowersRow = useMemo(() => {
    if (!growerTarget) return [];
    return agents.find((a) => a.id === growerTarget.id)?.growers ?? [];
  }, [agents, growerTarget]);

  /** API + fila en tabla: evita desfase si una fuente trae growers y la otra no. */
  const mergedGrowersList = useMemo(() => {
    const byEmail = new Map<string, AgentGrowerRow>();
    for (const g of dialogGrowers) {
      const e = g.email.trim().toLowerCase();
      if (e) byEmail.set(e, { email: e, name: g.name });
    }
    for (const g of agentGrowersRow) {
      const e = g.email.trim().toLowerCase();
      if (e && !byEmail.has(e)) {
        byEmail.set(e, { email: e, name: g.name });
      }
    }
    return [...byEmail.values()];
  }, [dialogGrowers, agentGrowersRow]);

  const growerEmailsForUi = useMemo(() => {
    return new Set(mergedGrowersList.map((g) => g.email.trim().toLowerCase()));
  }, [mergedGrowersList]);

  const checkIsGrower = useCallback(
    (u: OrganizationUser) => {
      const e = u.email.trim().toLowerCase();
      if (growerEmailsForUi.has(e)) return true;
      const un = u.name.trim().toLowerCase();
      if (!un) return false;
      return mergedGrowersList.some((g) => g.name.trim().toLowerCase() === un);
    },
    [growerEmailsForUi, mergedGrowersList],
  );

  const onCheckAddGrower = useCallback(
    async (orgUser: OrganizationUser) => {
      if (!growerTarget) return;
      const emailNorm = orgUser.email.trim().toLowerCase();
      if (checkIsGrower(orgUser)) return;
      setAddingGrowerUserId(orgUser.id);
      try {
        const displayName = orgUser.name.trim() || orgUser.email.trim();
        const result = await postAgentGrower(growerTarget.id, {
          email: orgUser.email.trim(),
          name: displayName,
        });
        if (!result.ok) {
          toast.error(result.error);
          return;
        }
        toast.success(`${displayName} agregado como grower`);
        const row: AgentGrowerRow = { email: emailNorm, name: displayName };
        setDialogGrowers((prev) =>
          prev.some((g) => g.email.trim().toLowerCase() === emailNorm)
            ? prev
            : [...prev, row],
        );
        setAgents((prev) =>
          prev.map((a) => {
            if (a.id !== growerTarget.id) return a;
            const growers = [...(a.growers ?? [])];
            if (
              growers.some((g) => g.email.trim().toLowerCase() === emailNorm)
            ) {
              return a;
            }
            growers.push(row);
            return { ...a, growers };
          }),
        );
      } finally {
        setAddingGrowerUserId(null);
      }
    },
    [growerTarget, checkIsGrower],
  );

  const onUncheckRemoveGrower = useCallback(
    async (orgUser: OrganizationUser) => {
      if (!growerTarget) return;
      const emailNorm = orgUser.email.trim().toLowerCase();
      if (!checkIsGrower(orgUser)) return;
      setAddingGrowerUserId(orgUser.id);
      try {
        const result = await deleteAgentGrower(growerTarget.id, orgUser.email);
        if (!result.ok) {
          toast.error(result.error);
          return;
        }
        toast.success("Grower quitado");
        setDialogGrowers((prev) =>
          prev.filter((g) => g.email.trim().toLowerCase() !== emailNorm),
        );
        setAgents((prev) =>
          prev.map((a) => {
            if (a.id !== growerTarget.id) return a;
            return {
              ...a,
              growers: (a.growers ?? []).filter(
                (g) => g.email.trim().toLowerCase() !== emailNorm,
              ),
            };
          }),
        );
      } finally {
        setAddingGrowerUserId(null);
      }
    },
    [growerTarget, checkIsGrower],
  );

  const sortedOrgUsers = useMemo(() => {
    return [...orgUsers].sort((a, b) =>
      a.name.localeCompare(b.name, "es", { sensitivity: "base" }),
    );
  }, [orgUsers]);

  const growerPickerLoading = orgUsersLoading || dialogGrowersLoading;

  const serverSearchActive = debouncedSearch.trim().length >= 3;
  const isSearchDebouncing =
    search.trim() !== debouncedSearch.trim() &&
    (search.trim().length >= 3 || debouncedSearch !== "");

  const filteredAgents = useMemo(() => {
    let list = agents;
    if (!serverSearchActive) {
      const q = search.trim().toLowerCase();
      if (q) {
        list = list.filter((a) => {
          if (
            a.name.toLowerCase().includes(q) ||
            a.owner.toLowerCase().includes(q)
          ) {
            return true;
          }
          return (a.growers ?? []).some(
            (g) =>
              g.name.toLowerCase().includes(q) ||
              g.email.toLowerCase().includes(q),
          );
        });
      }

      if (statusFilter !== "all") {
        list = list.filter((a) => a.operationalStatus === statusFilter);
      }
      if (billingAlertOnly) {
        list = list.filter((a) => a.billing.paymentAlert);
      }
      if (cobranzaFilter === "domiciliated") {
        list = list.filter((a) => a.billing.domiciliated);
      }
      if (cobranzaFilter === "non-domiciliated") {
        list = list.filter((a) => !a.billing.domiciliated);
      }
      if (cobranzaFilter === "overdue") {
        list = list.filter((a) => a.billing.paymentAlert);
      }
    }

    if (lastPaymentFrom) {
      list = list.filter((a) => {
        const d = a.billing.lastPaymentDate;
        if (!d) return false;
        return d >= lastPaymentFrom;
      });
    }
    if (lastPaymentTo) {
      list = list.filter((a) => {
        const d = a.billing.lastPaymentDate;
        if (!d) return false;
        return d <= lastPaymentTo;
      });
    }
    if (favoritesFilter === "favorites") {
      list = list.filter((a) => a.isFavorite === true);
    }
    return list;
  }, [
    agents,
    search,
    serverSearchActive,
    statusFilter,
    billingAlertOnly,
    cobranzaFilter,
    lastPaymentFrom,
    lastPaymentTo,
    favoritesFilter,
  ]);

  const hasMore = nextCursor != null && nextCursor !== undefined;

  return (
    <>
      <div className="flex h-full min-h-0 flex-col">
        <header className="flex h-14 shrink-0 items-center justify-between border-b px-4">
          <div className="flex items-center gap-2 font-semibold text-foreground">
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
            Operaciones
          </div>
          <UserMenu
            userName={props.userName}
            userEmail={props.userEmail}
            onSignOut={props.onSignOut}
          />
        </header>

        <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
          <SheetContent side="left" className="w-64">
            <SheetHeader>
              <SheetTitle>Menú</SheetTitle>
            </SheetHeader>
            <nav className="mt-4 flex flex-col gap-1 px-2">
              <Link
                href={`/agents/new?mode=${defaultBuilderMode}`}
                className="flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-foreground hover:bg-muted"
                onClick={() => setMenuOpen(false)}
              >
                <PlusIcon className="size-4" />
                Crear agente
              </Link>
              <div 
                className="relative"
                onMouseEnter={handleChangelogMouseEnter}
                onMouseLeave={handleChangelogMouseLeave}
              >
              <Link
                href="/changelog"
                className="flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-foreground hover:bg-muted"
                onClick={() => setMenuOpen(false)}
              >
                <LayoutGridIcon className="size-4" />
                Changelog
              </Link>
              {/* Submenu */}
              <div className={`absolute left-full top-0 ml-0 z-50 bg-background border rounded-md shadow-lg p-1 min-w-[160px] ${changelogSubmenuOpen ? 'block' : 'hidden'}`}>
                <Link href="/changelog/atlas" className="flex items-center gap-2 rounded px-3 py-2 text-sm hover:bg-muted" onClick={() => setMenuOpen(false)}>
                  <LayoutDashboardIcon className="size-4" /> Atlas
                </Link>
                <Link href="/changelog/panel" className="flex items-center gap-2 rounded px-3 py-2 text-sm hover:bg-muted" onClick={() => setMenuOpen(false)}>
                  <LayoutGridIcon className="size-4" /> Panel Web
                </Link>
                <Link href="/changelog/agents" className="flex items-center gap-2 rounded px-3 py-2 text-sm hover:bg-muted" onClick={() => setMenuOpen(false)}>
                  <BotIcon className="size-4" /> kAI Agents
                </Link>
                <Link href="/changelog/tools" className="flex items-center gap-2 rounded px-3 py-2 text-sm hover:bg-muted" onClick={() => setMenuOpen(false)}>
                  <WrenchIcon className="size-4" /> Tools MCP
                </Link>
              </div>
            </div>
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
              {isAdmin && (
                <>
                  <div className="px-3 py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
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
                </>
              )}
            </nav>
          </SheetContent>
        </Sheet>

        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
          <div className="shrink-0 flex flex-col gap-4 border-b p-6">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <h1 className="text-2xl font-semibold tracking-tight">
                Dashboard de Operaciones
              </h1>
              <div className="flex items-center gap-1">
                <Button type="button" className="gap-2" asChild>
                  <Link href={`/agents/new?mode=${defaultBuilderMode}`}>
                    <PlusIcon className="size-4" />
                    Crear nuevo agente
                  </Link>
                </Button>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      onClick={() => setDefaultModeDialogOpen(true)}
                    >
                      <Settings2Icon className="size-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Configurar modo por defecto</TooltipContent>
                </Tooltip>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <div className="relative w-56 min-w-[12rem]">
                <SearchIcon className="absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  type="search"
                  placeholder="Buscar por nombre, dueño..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="h-9 pl-8"
                  aria-busy={
                    isSearchDebouncing || (Boolean(search.trim()) && isLoading)
                  }
                />
                {isSearchDebouncing || (Boolean(search.trim()) && isLoading) ? (
                  <Loader2Icon className="absolute top-1/2 right-2.5 size-4 -translate-y-1/2 animate-spin text-muted-foreground" />
                ) : null}
              </div>
              <div className="flex items-center gap-1 rounded-md border border-border bg-muted/30 p-1">
                <span className="px-2 py-1.5 text-xs text-muted-foreground">
                  Estatus
                </span>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      type="button"
                      variant={statusFilter === "all" ? "secondary" : "ghost"}
                      size="icon-sm"
                      className="size-8"
                      onClick={() => setStatusFilter("all")}
                    >
                      <LayoutGridIcon className="size-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Todos los estatus</TooltipContent>
                </Tooltip>
                {(Object.keys(STATUS_LABELS) as AgentOperationalStatus[]).map(
                  (s) => (
                    <Tooltip key={s}>
                      <TooltipTrigger asChild>
                        <Button
                          type="button"
                          variant={statusFilter === s ? "secondary" : "ghost"}
                          size="icon-sm"
                          className="size-8"
                          onClick={() => setStatusFilter(s)}
                        >
                          {s === "active" && (
                            <CheckCircleIcon className="size-4" />
                          )}
                          {s === "testing" && (
                            <Loader2Icon className="size-4" />
                          )}
                          {s === "suspended" && (
                            <PauseCircleIcon className="size-4" />
                          )}
                          {s === "off" && <PowerIcon className="size-4" />}
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>{STATUS_LABELS[s]}</TooltipContent>
                    </Tooltip>
                  ),
                )}
              </div>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    type="button"
                    variant={billingAlertOnly ? "secondary" : "ghost"}
                    size="icon-sm"
                    className="size-9 rounded-md border border-border"
                    onClick={() => setBillingAlertOnly((v) => !v)}
                  >
                    <AlertCircleIcon className="size-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Solo alerta de pago</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    type="button"
                    variant={
                      favoritesFilter === "favorites" ? "secondary" : "ghost"
                    }
                    size="icon-sm"
                    className="size-9 rounded-md border border-border"
                    onClick={() =>
                      setFavoritesFilter((v) =>
                        v === "all" ? "favorites" : "all",
                      )
                    }
                  >
                    <StarIcon className="size-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Favoritos</TooltipContent>
              </Tooltip>
              <div className="flex items-center gap-1 rounded-md border border-border bg-muted/30 p-1">
                <span className="px-2 py-1.5 text-xs text-muted-foreground">
                  Cobranza
                </span>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      type="button"
                      variant={cobranzaFilter === "all" ? "secondary" : "ghost"}
                      size="icon-sm"
                      className="size-8"
                      onClick={() => setCobranzaFilter("all")}
                    >
                      <LayoutGridIcon className="size-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Todos</TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      type="button"
                      variant={
                        cobranzaFilter === "domiciliated"
                          ? "secondary"
                          : "ghost"
                      }
                      size="icon-sm"
                      className="size-8"
                      onClick={() => setCobranzaFilter("domiciliated")}
                    >
                      <Building2Icon className="size-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Domiciliados</TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      type="button"
                      variant={
                        cobranzaFilter === "non-domiciliated"
                          ? "secondary"
                          : "ghost"
                      }
                      size="icon-sm"
                      className="size-8"
                      onClick={() => setCobranzaFilter("non-domiciliated")}
                    >
                      <BanknoteIcon className="size-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>No domiciliados</TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      type="button"
                      variant={
                        cobranzaFilter === "overdue" ? "secondary" : "ghost"
                      }
                      size="icon-sm"
                      className="size-8"
                      onClick={() => setCobranzaFilter("overdue")}
                    >
                      <AlertCircleIcon className="size-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Alerta de falta de pago</TooltipContent>
                </Tooltip>
              </div>
              {cobranzaFilter !== "all" && (
                <div className="flex items-center gap-2">
                  <div className="flex items-center gap-1.5">
                    <CalendarIcon className="size-3.5 text-muted-foreground" />
                    <Input
                      type="date"
                      value={lastPaymentFrom}
                      onChange={(e) => setLastPaymentFrom(e.target.value)}
                      className="h-8 w-36 text-xs"
                      placeholder="Desde"
                    />
                  </div>
                  <span className="text-xs text-muted-foreground">a</span>
                  <Input
                    type="date"
                    value={lastPaymentTo}
                    onChange={(e) => setLastPaymentTo(e.target.value)}
                    className="h-8 w-36 text-xs"
                    placeholder="Hasta"
                  />
                  {(lastPaymentFrom || lastPaymentTo) && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      className="size-7"
                      onClick={() => {
                        setLastPaymentFrom("");
                        setLastPaymentTo("");
                      }}
                    >
                      <XIcon className="size-3" />
                    </Button>
                  )}
                </div>
              )}
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-auto p-6">
            <div className="overflow-x-auto rounded-md border border-border">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/50">
                    <th className="p-3 text-left font-medium w-8"></th>
                    <th className="p-3 text-left font-medium">Agente</th>
                    <th className="p-3 text-left font-medium">Estatus</th>
                    <th className="p-3 text-left font-medium">Cobranza</th>
                    <th className="p-3 text-left font-medium">Growers</th>
                  </tr>
                </thead>
                <tbody>
                  {isInitialLoad || isLoading ? (
                    [...Array(10)].map((_, i) => (
                      <tr key={i} className="border-b border-border">
                        <td className="p-3 w-8"></td>
                        <td className="p-3">
                          <div className="h-5 w-32 bg-muted animate-pulse rounded" />
                        </td>
                        <td className="p-3">
                          <div className="h-5 w-16 bg-muted animate-pulse rounded" />
                        </td>
                        <td className="p-3">
                          <div className="h-5 w-20 bg-muted animate-pulse rounded" />
                        </td>
                        <td className="p-3">
                          <div className="h-5 w-12 bg-muted animate-pulse rounded" />
                        </td>
                      </tr>
                    ))
                  ) : !isLoading && filteredAgents.length === 0 ? (
                    <tr>
                      <td
                        colSpan={7}
                        className="p-12 text-center text-muted-foreground"
                      >
                        No hay agentes que mostrar
                      </td>
                    </tr>
                  ) : (
                    filteredAgents.map((agent) => (
                      <Fragment key={agent.id}>
                        <tr
                          className="border-b border-border transition-colors hover:bg-muted/50 cursor-pointer"
                          onClick={() =>
                            router.push(
                              `/agents/${encodeURIComponent(agent.id)}/prompt-design`,
                            )
                          }
                        >
                          <td className="p-3">
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon-sm"
                              className="size-7"
                              onClick={(e) => {
                                e.stopPropagation();
                                void (async () => {
                                  if (expandedAgentId === agent.id) {
                                    setExpandedAgentId(null);
                                    return;
                                  }
                                  setExpandedAgentId(agent.id);
                                  setPaymentsLoading(true);
                                  const res = await fetchAgentBilling(agent.id);
                                  setExpandedPayments(res?.payments ?? []);
                                  setPaymentsLoading(false);
                                })();
                              }}
                            >
                              {expandedAgentId === agent.id ? (
                                <ChevronDownIcon className="size-4" />
                              ) : (
                                <ChevronRightIcon className="size-4" />
                              )}
                            </Button>
                          </td>
                          <td className="p-3 font-medium">
                            <div className="flex items-center gap-2">
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon-sm"
                                className="size-7"
                                disabled={isTogglingFavorite === agent.id}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  if (isTogglingFavorite === agent.id) return;
                                  void (async () => {
                                    const isFavorite =
                                      agent.isFavorite === true;
                                    const method = isFavorite
                                      ? "DELETE"
                                      : "POST";
                                    setIsTogglingFavorite(agent.id);
                                    try {
                                      const res = await fetch(
                                        `/api/favorites/${encodeURIComponent(agent.id)}`,
                                        { method, credentials: "include" },
                                      );
                                      if (res.ok) {
                                        setAgents((prev) =>
                                          prev.map((a) =>
                                            a.id === agent.id
                                              ? {
                                                  ...a,
                                                  isFavorite: !isFavorite,
                                                }
                                              : a,
                                          ),
                                        );
                                        toast.success(
                                          isFavorite
                                            ? "Eliminado de favoritos"
                                            : "Añadido a favoritos",
                                        );
                                      } else {
                                        const err = await res.text();
                                        toast.error(
                                          `Error: ${res.status} - ${err || "Error desconocido"}`,
                                        );
                                      }
                                    } catch {
                                      toast.error(
                                        "Error de red al actualizar favoritos",
                                      );
                                    } finally {
                                      setIsTogglingFavorite(null);
                                    }
                                  })();
                                }}
                              >
                                {isTogglingFavorite === agent.id ? (
                                  <Loader2Icon className="size-4 animate-spin" />
                                ) : agent.isFavorite === true ? (
                                  <StarIcon className="size-4 fill-yellow-400 text-yellow-400" />
                                ) : (
                                  <StarIcon className="size-4 text-muted-foreground" />
                                )}
                              </Button>
                              <Link
                                href={`/agents/${encodeURIComponent(agent.id)}/prompt-design`}
                                className="text-primary hover:underline"
                                onClick={(e) => e.stopPropagation()}
                              >
                                {agent.name}
                              </Link>
                            </div>
                          </td>
                          <td className="p-3">
                            <Badge
                              variant={
                                STATUS_BADGE_VARIANT[agent.operationalStatus]
                              }
                            >
                              {STATUS_LABELS[agent.operationalStatus]}
                            </Badge>
                          </td>
                          <td className="p-3">
                            <div className="flex items-center gap-2">
                              {agent.billing.domiciliated ? (
                                <Badge variant="outline" className="gap-1">
                                  <Building2Icon className="size-3" />
                                  Domiciliado
                                </Badge>
                              ) : (
                                <Badge variant="secondary">
                                  No domiciliado
                                </Badge>
                              )}
                              {agent.billing.paymentAlert && (
                                <Badge variant="destructive" className="gap-1">
                                  <AlertCircleIcon className="size-3" />
                                  Falta de pago
                                </Badge>
                              )}
                              {!agent.billing.domiciliated &&
                                agent.billing.lastPaymentDate && (
                                  <span className="text-xs text-muted-foreground">
                                    Último:{" "}
                                    {new Date(
                                      agent.billing.lastPaymentDate,
                                    ).toLocaleDateString("es-MX")}
                                  </span>
                                )}
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon-sm"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setBillingDialogAgent(agent);
                                  setBillingDomiciliated(
                                    agent.billing.domiciliated,
                                  );
                                  setBillingDefaultAmount(
                                    agent.billing.defaultPaymentAmount
                                      ? String(
                                          agent.billing.defaultPaymentAmount,
                                        )
                                      : "",
                                  );
                                  setBillingDueDate(
                                    agent.billing.paymentDueDate
                                      ? agent.billing.paymentDueDate.slice(
                                          0,
                                          10,
                                        )
                                      : "",
                                  );
                                }}
                              >
                                <PencilIcon className="size-3" />
                              </Button>
                            </div>
                          </td>
                          <td className="p-3 text-muted-foreground">
                            <div className="flex flex-wrap items-center gap-2">
                              <div className="min-w-0 flex-1">
                                {agent.growers && agent.growers.length > 0 ? (
                                  <span className="flex flex-wrap items-center gap-x-1 gap-y-0.5">
                                    {agent.growers.map((g, i) => (
                                      <span
                                        key={`${g.email}-${i}`}
                                        className="inline-flex items-center"
                                      >
                                        {i > 0 ? (
                                          <span className="mr-1 text-muted-foreground/60">
                                            ,
                                          </span>
                                        ) : null}
                                        <Tooltip>
                                          <TooltipTrigger asChild>
                                            <button
                                              type="button"
                                              className="cursor-default border-0 bg-transparent p-0 text-left text-inherit underline-offset-2 hover:underline"
                                            >
                                              {g.name}
                                            </button>
                                          </TooltipTrigger>
                                          <TooltipContent>
                                            {g.email}
                                          </TooltipContent>
                                        </Tooltip>
                                      </span>
                                    ))}
                                  </span>
                                ) : (
                                  <span>—</span>
                                )}
                              </div>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button
                                    type="button"
                                    variant="outline"
                                    size="icon-sm"
                                    aria-label="Gestionar growers"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setGrowerTarget({
                                        id: agent.id,
                                        name: agent.name,
                                      });
                                    }}
                                  >
                                    <PlusIcon className="size-4" />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>
                                  Gestionar growers
                                </TooltipContent>
                              </Tooltip>
                            </div>
                          </td>
                        </tr>
                        {expandedAgentId === agent.id && (
                          <tr className="bg-muted/30">
                            <td colSpan={7} className="p-4">
                              {agent.billing.domiciliated ? (
                                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                  <Building2Icon className="size-4" />
                                  Los pagos domiciliados se renuevan
                                  automáticamente cada mes. No se requiere
                                  registro manual.
                                </div>
                              ) : paymentsLoading ? (
                                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                  <Loader2Icon className="size-4 animate-spin" />
                                  Cargando historial...
                                </div>
                              ) : (
                                <div className="space-y-3">
                                  <div className="flex items-center justify-between">
                                    <h4 className="text-sm font-medium">
                                      Historial de Pagos
                                    </h4>
                                    <Button
                                      size="sm"
                                      onClick={() => {
                                        setPaymentAmount(
                                          agent.billing.defaultPaymentAmount
                                            ? String(
                                                agent.billing
                                                  .defaultPaymentAmount,
                                              )
                                            : "",
                                        );
                                        const now = new Date();
                                        const months = [
                                          "Enero",
                                          "Febrero",
                                          "Marzo",
                                          "Abril",
                                          "Mayo",
                                          "Junio",
                                          "Julio",
                                          "Agosto",
                                          "Septiembre",
                                          "Octubre",
                                          "Noviembre",
                                          "Diciembre",
                                        ];
                                        setPaymentPeriod(
                                          `${months[now.getMonth()]} ${now.getFullYear()}`,
                                        );
                                        setPaymentMethod("transferencia");
                                        setPaymentReference("");
                                        setPaymentNotes("");
                                        setPaymentDialogOpen(true);
                                      }}
                                    >
                                      <PlusIcon className="size-3 mr-1" />{" "}
                                      Registrar pago
                                    </Button>
                                  </div>
                                  {expandedPayments.length === 0 ? (
                                    <p className="text-sm text-muted-foreground">
                                      Sin pagos registrados
                                    </p>
                                  ) : (
                                    <table className="w-full text-xs">
                                      <thead>
                                        <tr className="border-b">
                                          <th className="p-2 text-left">
                                            Período
                                          </th>
                                          <th className="p-2 text-left">
                                            Monto
                                          </th>
                                          <th className="p-2 text-left">
                                            Método
                                          </th>
                                          <th className="p-2 text-left">
                                            Referencia
                                          </th>
                                          <th className="p-2 text-left">
                                            Fecha
                                          </th>
                                          <th className="p-2 text-left">
                                            Notas
                                          </th>
                                          <th className="p-2 text-left">
                                            Acciones
                                          </th>
                                        </tr>
                                      </thead>
                                      <tbody>
                                        {expandedPayments.map((p) => (
                                          <tr
                                            key={p.id}
                                            className="border-b border-border/50"
                                          >
                                            <td className="p-2">{p.period}</td>
                                            <td className="p-2 font-mono">
                                              ${p.amount.toFixed(2)}
                                            </td>
                                            <td className="p-2">
                                              {p.paymentMethod}
                                            </td>
                                            <td className="p-2 text-muted-foreground">
                                              {p.reference || "—"}
                                            </td>
                                            <td className="p-2">
                                              {new Date(
                                                p.paidAt,
                                              ).toLocaleDateString("es-MX")}
                                            </td>
                                            <td className="p-2 max-w-[200px] truncate">
                                              {p.notes || "—"}
                                            </td>
                                            <td className="p-2">
                                              <Button
                                                variant="ghost"
                                                size="icon-sm"
                                                onClick={async () => {
                                                  const r =
                                                    await deletePaymentRecord(
                                                      agent.id,
                                                      p.id,
                                                    );
                                                  if (r.ok) {
                                                    setExpandedPayments(
                                                      (prev) =>
                                                        prev.filter(
                                                          (x) => x.id !== p.id,
                                                        ),
                                                    );
                                                    toast.success(
                                                      "Pago eliminado",
                                                    );
                                                  } else {
                                                    toast.error(r.error);
                                                  }
                                                }}
                                              >
                                                <Trash2Icon className="size-3 text-destructive" />
                                              </Button>
                                            </td>
                                          </tr>
                                        ))}
                                      </tbody>
                                    </table>
                                  )}
                                </div>
                              )}
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    ))
                  )}
                </tbody>
              </table>
            </div>
            <div className="flex gap-2 items-center mt-4 mb-1">
              <span className="text-xs text-muted-foreground">
                {agents.length} agentes
              </span>
            </div>
            {!isLoading && filteredAgents.length === 0 ? (
              <p className="py-8 text-center text-muted-foreground">
                {agents.length === 0
                  ? serverSearchActive
                    ? "No hay agentes que coincidan con la búsqueda."
                    : "No hay agentes."
                  : "Ningún agente coincide con los filtros."}
              </p>
            ) : null}
            {hasMore && !isLoading ? (
              <div className="flex gap-2 items-center">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={isLoadingMore || isSearchDebouncing}
                  onClick={() => void loadMore()}
                >
                  {isLoadingMore ? (
                    <Loader2Icon className="mr-2 size-4 animate-spin" />
                  ) : null}
                  Cargar más
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={
                    isLoadingAll ||
                    isSearchDebouncing ||
                    Boolean(debouncedSearch.trim())
                  }
                  onClick={() => void loadAll()}
                  title={
                    debouncedSearch.trim()
                      ? "Con búsqueda activa usa «Cargar más» para ver más resultados."
                      : undefined
                  }
                >
                  {isLoadingAll ? (
                    <Loader2Icon className="mr-2 size-4 animate-spin" />
                  ) : null}
                  Cargar todos
                </Button>
              </div>
            ) : null}
          </div>
        </div>
      </div>
      <Dialog
        open={growerTarget != null}
        onOpenChange={(open) => {
          if (!open) setGrowerTarget(null);
        }}
      >
        <DialogContent showClose className="max-h-[min(90vh,32rem)]">
          <DialogHeader>
            <DialogTitle>Gestionar growers</DialogTitle>
            <DialogDescription>
              Agente:{" "}
              <span className="font-medium text-foreground">
                {growerTarget?.name}
              </span>
              . Los usuarios de la organización aparecen con un tick si ya son
              growers; marca para añadir o desmarca para quitar (nombre y correo
              de su cuenta).
            </DialogDescription>
          </DialogHeader>
          <div className="min-h-0 flex-1 overflow-hidden py-2">
            {growerPickerLoading ? (
              <div className="flex items-center justify-center gap-2 py-10 text-muted-foreground">
                <Loader2Icon className="size-5 animate-spin" />
                <span>Cargando usuarios y growers…</span>
              </div>
            ) : sortedOrgUsers.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">
                No hay usuarios en la organización.
              </p>
            ) : (
              <ul className="max-h-64 space-y-1 overflow-y-auto pr-1">
                {sortedOrgUsers.map((u) => {
                  const already = checkIsGrower(u);
                  const busy = addingGrowerUserId === u.id;
                  return (
                    <li key={u.id}>
                      <label className="flex cursor-pointer items-center gap-3 rounded-md border border-transparent px-2 py-2 hover:bg-muted/50">
                        <Checkbox
                          checked={already}
                          disabled={
                            busy || growerPickerLoading || !growerTarget
                          }
                          onCheckedChange={(v) => {
                            if (v === true) void onCheckAddGrower(u);
                            else void onUncheckRemoveGrower(u);
                          }}
                        />
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-sm font-medium">
                            {u.name}
                          </div>
                          <div className="truncate text-xs text-muted-foreground">
                            {u.email}
                            {u.role === "admin" ? (
                              <span className="ml-2 text-foreground/80">
                                · admin
                              </span>
                            ) : null}
                          </div>
                        </div>
                        {busy ? (
                          <Loader2Icon
                            className="size-4 shrink-0 animate-spin text-muted-foreground"
                            aria-hidden
                          />
                        ) : null}
                      </label>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setGrowerTarget(null)}
            >
              Cerrar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog
        open={billingDialogAgent != null}
        onOpenChange={(open) => {
          if (!open) setBillingDialogAgent(null);
        }}
      >
        <DialogContent showClose>
          <DialogHeader>
            <DialogTitle>Configuración de Cobranza</DialogTitle>
            <DialogDescription>
              Agente:{" "}
              <span className="font-medium text-foreground">
                {billingDialogAgent?.name}
              </span>
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="flex items-center gap-2">
              <Checkbox
                id="billing-domiciliated"
                checked={billingDomiciliated}
                onCheckedChange={(v) => setBillingDomiciliated(v === true)}
              />
              <label
                htmlFor="billing-domiciliated"
                className="text-sm cursor-pointer"
              >
                Cliente domiciliado (pago automático mensual)
              </label>
            </div>
            <div>
              <label className="text-sm font-medium">Monto mensual</label>
              <Input
                type="number"
                value={billingDefaultAmount}
                onChange={(e) => setBillingDefaultAmount(e.target.value)}
                placeholder="p. ej. 1500"
              />
            </div>
            {!billingDomiciliated && (
              <div>
                <label className="text-sm font-medium">
                  Fecha límite de pago
                </label>
                <Input
                  type="date"
                  value={billingDueDate}
                  onChange={(e) => setBillingDueDate(e.target.value)}
                />
              </div>
            )}
            {billingDialogAgent?.billing.lastPaymentDate && (
              <p className="text-xs text-muted-foreground">
                Último pago:{" "}
                {new Date(
                  billingDialogAgent.billing.lastPaymentDate,
                ).toLocaleDateString("es-MX")}
              </p>
            )}
            {billingDomiciliated && (
              <p className="text-xs text-muted-foreground bg-muted/50 rounded-md p-2">
                Los pagos domiciliados se renuevan automáticamente cada mes. No
                se requiere acción manual.
              </p>
            )}
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setBillingDialogAgent(null)}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              disabled={billingSaving}
              onClick={async () => {
                if (!billingDialogAgent) return;
                setBillingSaving(true);
                try {
                  const r = await patchAgentBillingConfig(
                    billingDialogAgent.id,
                    {
                      domiciliated: billingDomiciliated,
                      defaultPaymentAmount: billingDefaultAmount
                        ? Number(billingDefaultAmount)
                        : undefined,
                      paymentDueDate: billingDueDate || null,
                    },
                  );
                  if (r.ok) {
                    toast.success("Configuración actualizada");
                    void fetchAgents();
                    setBillingDialogAgent(null);
                  } else {
                    toast.error(r.error);
                  }
                } finally {
                  setBillingSaving(false);
                }
              }}
            >
              Guardar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog
        open={paymentDialogOpen}
        onOpenChange={(open) => {
          if (!open) setPaymentDialogOpen(false);
        }}
      >
        <DialogContent showClose>
          <DialogHeader>
            <DialogTitle>Registrar Pago</DialogTitle>
            <DialogDescription>
              Agente:{" "}
              <span className="font-medium text-foreground">
                {billingDialogAgent?.name}
              </span>
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <label className="text-sm font-medium">Monto</label>
              <Input
                type="number"
                value={paymentAmount}
                onChange={(e) => setPaymentAmount(e.target.value)}
                placeholder="p. ej. 1500"
              />
            </div>
            <div>
              <label className="text-sm font-medium">Período</label>
              <Input
                value={paymentPeriod}
                onChange={(e) => setPaymentPeriod(e.target.value)}
                placeholder="p. ej. Abril 2026"
              />
            </div>
            <div>
              <label className="text-sm font-medium">Método de pago</label>
              <select
                value={paymentMethod}
                onChange={(e) => setPaymentMethod(e.target.value)}
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm"
              >
                <option value="transferencia">Transferencia</option>
                <option value="efectivo">Efectivo</option>
                <option value="tarjeta">Tarjeta</option>
                <option value="cheque">Cheque</option>
                <option value="otro">Otro</option>
              </select>
            </div>
            <div>
              <label className="text-sm font-medium">
                Referencia (opcional)
              </label>
              <Input
                value={paymentReference}
                onChange={(e) => setPaymentReference(e.target.value)}
                placeholder="p. ej. REF-12345"
              />
            </div>
            <div>
              <label className="text-sm font-medium">Notas (opcional)</label>
              <Input
                value={paymentNotes}
                onChange={(e) => setPaymentNotes(e.target.value)}
                placeholder="Notas adicionales"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setPaymentDialogOpen(false)}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              disabled={paymentSaving || !paymentAmount || !paymentPeriod}
              onClick={async () => {
                if (!billingDialogAgent) return;
                setPaymentSaving(true);
                try {
                  const r = await createPaymentRecord(billingDialogAgent.id, {
                    amount: Number(paymentAmount),
                    period: paymentPeriod,
                    paymentMethod,
                    reference: paymentReference || undefined,
                    notes: paymentNotes || undefined,
                  });
                  if (r.ok) {
                    toast.success("Pago registrado");
                    setPaymentDialogOpen(false);
                    const res = await fetchAgentBilling(billingDialogAgent.id);
                    setExpandedPayments(res?.payments ?? []);
                    void fetchAgents();
                  } else {
                    toast.error(r.error);
                  }
                } finally {
                  setPaymentSaving(false);
                }
              }}
            >
              Registrar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog
        open={defaultModeDialogOpen}
        onOpenChange={setDefaultModeDialogOpen}
      >
        <DialogContent showClose>
          <DialogHeader>
            <DialogTitle>Modo por defecto para crear agente</DialogTitle>
            <DialogDescription>
              Elige el modo que se abrirá por defecto al hacer clic en
              &quot;Crear nuevo agente&quot;.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="flex items-center space-x-2">
              <input
                type="radio"
                id="mode-form"
                name="builder-mode"
                checked={defaultBuilderMode === "form"}
                onChange={() => setDefaultBuilderMode("form")}
                className="h-4 w-4"
              />
              <label
                htmlFor="mode-form"
                className="text-sm font-medium cursor-pointer"
              >
                Formulario
              </label>
            </div>
            <div className="flex items-center space-x-2">
              <input
                type="radio"
                id="mode-conversational"
                name="builder-mode"
                checked={defaultBuilderMode === "conversational"}
                onChange={() => setDefaultBuilderMode("conversational")}
                className="h-4 w-4"
              />
              <label
                htmlFor="mode-conversational"
                className="text-sm font-medium cursor-pointer"
              >
                Conversacional
              </label>
            </div>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setDefaultModeDialogOpen(false)}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              onClick={() => {
                localStorage.setItem(
                  "agent-builder-default-mode",
                  defaultBuilderMode,
                );
                toast.success("Modo por defecto guardado");
                setDefaultModeDialogOpen(false);
              }}
            >
              Guardar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
