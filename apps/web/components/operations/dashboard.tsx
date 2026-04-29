"use client";

import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertCircleIcon,
  ArchiveIcon,
  ArchiveRestoreIcon,
  BanknoteIcon,
  BookOpenIcon,
  BriefcaseIcon,
  Building2Icon,
  BuildingIcon,
  CalendarIcon,
  CheckCircleIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  CloudDownloadIcon,
  CopyIcon,
  DatabaseIcon,
  FlaskConicalIcon,
  FolderOpenIcon,
  HelpCircleIcon,
  LayoutDashboardIcon,
  LayoutGridIcon,
  Loader2Icon,
  MegaphoneIcon,
  MenuIcon,
  PauseCircleIcon,
  PencilIcon,
  PlusIcon,
  PowerIcon,
  SearchIcon,
  Settings2Icon,
  StarIcon,
  Table2Icon,
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
import {
  BillingConfigDialog,
  ChangelogNavItem,
  IconButtonWithTooltip,
  OrgUserPickerDialog,
  RegisterPaymentDialog,
  UserMenu,
} from "@/components/shared";
import type { OrgUser } from "@/components/shared";
import { useUserRole } from "@/hooks";
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
import { COMMERCIAL_STATUS_LABELS_ES } from "@/consts/agent-lifecycle";
import type {
  AgentOperationalStatus,
  AgentWithOperations,
  PaymentRecord,
} from "@/lib/agents/agent";
import type { AgentCommercialStatus } from "@/types";
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
  postAgentOperationsArchive,
  assignAgentToUser,
  fetchAssignedAgentForUser,
  toggleFavorite,
} from "@/services/agents-api";
import {
  fetchOrganizationUsers,
  type OrganizationUser,
} from "@/services/organization-api";
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
  userImage?: string | null | undefined;
  onSignOut: () => void;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  /** Primitivos derivados: el objeto `searchParams` cambia de referencia en cada render. */
  const urlQ = searchParams.get("q") ?? "";
  const queryString = searchParams.toString();
  const { isAdmin, role } = useUserRole();
  const isCommercial = role === "commercial";
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

  type CobranzaFilter =
    | "all"
    | "domiciliated"
    | "non-domiciliated"
    | "unknown"
    | "overdue";
  const [cobranzaFilter, setCobranzaFilter] = useState<CobranzaFilter>("all");
  const [lastPaymentFrom, setLastPaymentFrom] = useState("");
  const [lastPaymentTo, setLastPaymentTo] = useState("");
  const [expandedAgentId, setExpandedAgentId] = useState<string | null>(null);
  const [expandedPayments, setExpandedPayments] = useState<PaymentRecord[]>([]);
  const [paymentsLoading, setPaymentsLoading] = useState(false);
  const [billingDialogAgent, setBillingDialogAgent] =
    useState<AgentWithOperations | null>(null);
  const [paymentDialogOpen, setPaymentDialogOpen] = useState(false);
  const [paymentTargetAgent, setPaymentTargetAgent] =
    useState<AgentWithOperations | null>(null);
  const [defaultModeDialogOpen, setDefaultModeDialogOpen] = useState(false);
  const [defaultBuilderMode, setDefaultBuilderMode] = useState<
    "form" | "conversational"
  >("form");
  const [menuOpen, setMenuOpen] = useState(false);
  type FavoritesFilter = "all" | "favorites";
  const [favoritesFilter, setFavoritesFilter] =
    useState<FavoritesFilter>("all");
  const [showOnlyArchived, setShowOnlyArchived] = useState(false);
  const [isTogglingFavorite, setIsTogglingFavorite] = useState<string | null>(
    null,
  );
  const [isAssigningAgentId, setIsAssigningAgentId] = useState<string | null>(
    null,
  );
  const [assignedAgentId, setAssignedAgentId] = useState<string | null>(null);
  const [archiveTarget, setArchiveTarget] = useState<AgentWithOperations | null>(null);
  const [archiveConfirmText, setArchiveConfirmText] = useState("");
  const [archiveSaving, setArchiveSaving] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem("agent-builder-default-mode");
    if (stored === "form" || stored === "conversational") {
      setDefaultBuilderMode(stored);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const currentAssigned = await fetchAssignedAgentForUser();
      if (cancelled) return;
      setAssignedAgentId(currentAssigned);
    })();
    return () => {
      cancelled = true;
    };
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
    if (q !== urlQ) {
      const params = new URLSearchParams(queryString);
      if (q) {
        params.set("q", q);
      } else {
        params.delete("q");
      }
      router.replace(`?${params.toString()}`, { scroll: false });
    }
  }, [search, urlQ, queryString, router]);

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
        } else if (cobranzaFilter === "unknown") {
          filters = { ...filters, domiciliated: "unknown" };
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
        ...(showOnlyArchived ? { archivedOnly: true } : {}),
      });
    },
    [
      debouncedSearch,
      statusFilter,
      billingAlertOnly,
      cobranzaFilter,
      favoritesFilter,
      showOnlyArchived,
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

  /** Actualiza cobranza de un agente en la lista sin vaciar paginación ni recargar todo. */
  const refreshAgentBillingInList = useCallback(async (agentId: string) => {
    const res = await fetchAgentBilling(agentId);
    if (!res?.billing) return;
    setAgents((prev) =>
      prev.map((a) =>
        a.id === agentId
          ? { ...a, billing: { ...a.billing, ...res.billing } }
          : a,
      ),
    );
  }, []);

  // Effect to load agents when URL q or debounced search changes (not on every render)
  useEffect(() => {
    // Skip initial load if there's a search query - debouncedSearch will trigger the fetch
    if (urlQ && !debouncedSearch) {
      return;
    }
    void fetchAgents();
  }, [fetchAgents, urlQ, debouncedSearch]);

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
        list = list.filter((a) => a.billing.domiciliated === true);
      }
      if (cobranzaFilter === "non-domiciliated") {
        list = list.filter((a) => a.billing.domiciliated === false);
      }
      if (cobranzaFilter === "unknown") {
        list = list.filter((a) => a.billing.domiciliated === null);
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
    if (showOnlyArchived) {
      list = list.filter((a) => a.status === "archived");
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
    showOnlyArchived,
  ]);
  const activeAgents = useMemo(
    () => filteredAgents.filter((a) => a.status !== "archived"),
    [filteredAgents],
  );
  const archivedAgents = useMemo(
    () => filteredAgents.filter((a) => a.status === "archived"),
    [filteredAgents],
  );
  const hasSearchTerm = search.trim().length > 0;
  const orderedAgents = useMemo(
    () =>
      showOnlyArchived
        ? archivedAgents
        : hasSearchTerm
        ? [...activeAgents, ...archivedAgents]
        : activeAgents,
    [activeAgents, archivedAgents, hasSearchTerm, showOnlyArchived],
  );
  const archivedStartIndex = activeAgents.length;

  const hasMore = nextCursor != null && nextCursor !== undefined;

  const submitArchiveStatusChange = useCallback(
    async (
      agentId: string,
      nextStatus: "active" | "archived",
      confirm?: string,
    ) => {
      const result = await postAgentOperationsArchive(agentId, {
        status: nextStatus,
        ...(confirm ? { confirm } : {}),
      });
      if (!result.ok) {
        toast.error(result.error);
        return false;
      }
      setAgents((prev) =>
        prev.map((a) =>
          a.id === agentId ? { ...a, status: result.status } : a,
        ),
      );
      toast.success(
        result.status === "archived"
          ? "Agente archivado"
          : "Agente desarchivado",
      );
      return true;
    },
    [],
  );

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
            userImage={props.userImage}
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
                <IconButtonWithTooltip
                  icon={<Settings2Icon className="size-4" />}
                  tooltip="Configurar modo por defecto"
                  onClick={() => setDefaultModeDialogOpen(true)}
                  variant="outline"
                  size="icon"
                />
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
                <IconButtonWithTooltip
                  icon={<LayoutGridIcon className="size-4" />}
                  tooltip="Todos los estatus"
                  onClick={() => setStatusFilter("all")}
                  active={statusFilter === "all"}
                  size="icon-sm"
                  className="size-8"
                />
                {(Object.keys(STATUS_LABELS) as AgentOperationalStatus[]).map(
                  (s) => {
                    const getStatusIcon = () => {
                      switch (s) {
                        case "active":
                          return <CheckCircleIcon className="size-4" />;
                        case "testing":
                          return <Loader2Icon className="size-4" />;
                        case "suspended":
                          return <PauseCircleIcon className="size-4" />;
                        case "off":
                          return <PowerIcon className="size-4" />;
                      }
                    };
                    return (
                      <IconButtonWithTooltip
                        key={s}
                        icon={getStatusIcon()}
                        tooltip={STATUS_LABELS[s]}
                        onClick={() => setStatusFilter(s)}
                        active={statusFilter === s}
                        size="icon-sm"
                        className="size-8"
                      />
                    );
                  },
                )}
              </div>
              <IconButtonWithTooltip
                icon={<AlertCircleIcon className="size-4" />}
                tooltip="Solo alerta de pago"
                onClick={() => setBillingAlertOnly((v) => !v)}
                active={billingAlertOnly}
                className="size-9 rounded-md border border-border"
              />
              <IconButtonWithTooltip
                icon={<StarIcon className="size-4" />}
                tooltip="Favoritos"
                onClick={() =>
                  setFavoritesFilter((v) =>
                    v === "all" ? "favorites" : "all",
                  )
                }
                active={favoritesFilter === "favorites"}
                className="size-9 rounded-md border border-border"
              />
              <IconButtonWithTooltip
                icon={<ArchiveIcon className="size-4" />}
                tooltip="Solo archivados"
                onClick={() => setShowOnlyArchived((v) => !v)}
                active={showOnlyArchived}
                className="size-9 rounded-md border border-border"
              />
              <div className="flex items-center gap-1 rounded-md border border-border bg-muted/30 p-1">
                <span className="px-2 py-1.5 text-xs text-muted-foreground">
                  Cobranza
                </span>
                <IconButtonWithTooltip
                  icon={<LayoutGridIcon className="size-4" />}
                  tooltip="Todos"
                  onClick={() => setCobranzaFilter("all")}
                  active={cobranzaFilter === "all"}
                  size="icon-sm"
                  className="size-8"
                />
                <IconButtonWithTooltip
                  icon={<Building2Icon className="size-4" />}
                  tooltip="Domiciliados"
                  onClick={() => setCobranzaFilter("domiciliated")}
                  active={cobranzaFilter === "domiciliated"}
                  size="icon-sm"
                  className="size-8"
                />
                <IconButtonWithTooltip
                  icon={<BanknoteIcon className="size-4" />}
                  tooltip="No domiciliados"
                  onClick={() => setCobranzaFilter("non-domiciliated")}
                  active={cobranzaFilter === "non-domiciliated"}
                  size="icon-sm"
                  className="size-8"
                />
                <IconButtonWithTooltip
                  icon={<HelpCircleIcon className="size-4" />}
                  tooltip="Sin información (domiciliación)"
                  onClick={() => setCobranzaFilter("unknown")}
                  active={cobranzaFilter === "unknown"}
                  size="icon-sm"
                  className="size-8"
                />
                <IconButtonWithTooltip
                  icon={<AlertCircleIcon className="size-4" />}
                  tooltip="Alerta de falta de pago"
                  onClick={() => setCobranzaFilter("overdue")}
                  active={cobranzaFilter === "overdue"}
                  size="icon-sm"
                  className="size-8"
                />
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
                    <th className="p-3 text-left font-medium min-w-[9rem]">
                      Implementación
                    </th>
                    <th className="p-3 text-left font-medium">Cobranza</th>
                    <th className="p-3 text-left font-medium">Growers</th>
                    {isAdmin ? (
                      <th className="p-3 text-left font-medium">Acciones</th>
                    ) : null}
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
                          <div className="h-5 w-28 bg-muted animate-pulse rounded" />
                        </td>
                        <td className="p-3">
                          <div className="h-5 w-20 bg-muted animate-pulse rounded" />
                        </td>
                        <td className="p-3">
                          <div className="h-5 w-12 bg-muted animate-pulse rounded" />
                        </td>
                      </tr>
                    ))
                  ) : !isLoading && orderedAgents.length === 0 ? (
                    <tr>
                      <td
                        colSpan={isAdmin ? 7 : 6}
                        className="p-12 text-center text-muted-foreground"
                      >
                        No hay agentes que mostrar
                      </td>
                    </tr>
                  ) : (
                    orderedAgents.map((agent, idx) => (
                      <Fragment key={agent.id}>
                        {!showOnlyArchived &&
                        hasSearchTerm &&
                        idx === archivedStartIndex &&
                        archivedAgents.length > 0 ? (
                          <tr className="bg-muted/30">
                            <td
                              colSpan={isAdmin ? 7 : 6}
                              className="px-3 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground"
                            >
                              Archivados ({archivedAgents.length})
                            </td>
                          </tr>
                        ) : null}
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
                                      const result = await toggleFavorite(agent.id, method);
                                      if (result.ok) {
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
                                        toast.error(result.error ?? "Error desconocido");
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
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button
                                    type="button"
                                    variant={
                                      assignedAgentId === agent.id
                                        ? "secondary"
                                        : "ghost"
                                    }
                                    size="icon-sm"
                                    className="size-7"
                                    disabled={isAssigningAgentId === agent.id}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      if (isAssigningAgentId === agent.id) return;
                                      void (async () => {
                                        setIsAssigningAgentId(agent.id);
                                        try {
                                          const result = await assignAgentToUser(
                                            agent.id,
                                          );
                                          if (result.ok) {
                                            setAssignedAgentId(agent.id);
                                            toast.success(
                                              "Agente asignado a testing",
                                            );
                                          } else {
                                            toast.error(result.error);
                                          }
                                        } catch {
                                          toast.error(
                                            "Error al asignar agente a testing",
                                          );
                                        } finally {
                                          setIsAssigningAgentId(null);
                                        }
                                      })();
                                    }}
                                  >
                                    {isAssigningAgentId === agent.id ? (
                                      <Loader2Icon className="size-4 animate-spin" />
                                    ) : assignedAgentId === agent.id ? (
                                      <CheckCircleIcon className="size-4 text-emerald-600" />
                                    ) : (
                                      <FlaskConicalIcon className="size-4 text-muted-foreground" />
                                    )}
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>
                                  {assignedAgentId === agent.id
                                    ? "Asignado a tu número de testing"
                                    : "Asignar a número de testing"}
                                </TooltipContent>
                              </Tooltip>
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
                            {agent.status === "archived" ? (
                              <Badge variant="outline">Archivado</Badge>
                            ) : (
                              <Badge
                                variant={
                                  STATUS_BADGE_VARIANT[agent.operationalStatus]
                                }
                              >
                                {STATUS_LABELS[agent.operationalStatus]}
                              </Badge>
                            )}
                          </td>
                          <td className="p-3 text-muted-foreground align-top">
                            {(() => {
                              const comm = (agent.lifecycleSummary
                                ?.commercialStatus ??
                                "building") as AgentCommercialStatus;
                              if (comm === "delivered") {
                                return null;
                              }
                              const est =
                                agent.lifecycleSummary?.estimatedDeliveryAt;
                              return (
                                <div className="flex flex-col gap-0.5 text-xs">
                                  <span className="font-medium text-foreground">
                                    {COMMERCIAL_STATUS_LABELS_ES[comm]}
                                  </span>
                                  {est ? (
                                    <span>
                                      Est.{" "}
                                      {new Date(est).toLocaleDateString(
                                        "es-MX",
                                        { dateStyle: "short" },
                                      )}
                                    </span>
                                  ) : (
                                    <span className="text-muted-foreground/80">
                                      Sin fecha estimada
                                    </span>
                                  )}
                                </div>
                              );
                            })()}
                          </td>
                          <td className="p-3">
                            <div className="flex items-center gap-2">
                              {agent.billing.domiciliated === true ? (
                                <Badge variant="outline" className="gap-1">
                                  <Building2Icon className="size-3" />
                                  Domiciliado
                                </Badge>
                              ) : agent.billing.domiciliated === false ? (
                                <Badge variant="secondary">
                                  No domiciliado
                                </Badge>
                              ) : (
                                <Badge variant="outline" className="gap-1">
                                  <HelpCircleIcon className="size-3" />
                                  Sin información
                                </Badge>
                              )}
                              {agent.billing.paymentAlert && (
                                <Badge variant="destructive" className="gap-1">
                                  <AlertCircleIcon className="size-3" />
                                  Falta de pago
                                </Badge>
                              )}
                              {agent.billing.domiciliated !== true &&
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
                              <IconButtonWithTooltip
                                icon={<PlusIcon className="size-4" />}
                                tooltip="Gestionar growers"
                                onClick={(e) => {
                                  e?.stopPropagation();
                                  setGrowerTarget({
                                    id: agent.id,
                                    name: agent.name,
                                  });
                                }}
                                variant="outline"
                                size="icon-sm"
                              />
                            </div>
                          </td>
                          {isAdmin ? (
                            <td className="p-3">
                              {agent.status === "archived" ? (
                                <IconButtonWithTooltip
                                  icon={<ArchiveRestoreIcon className="size-3.5" />}
                                  tooltip="Desarchivar"
                                  onClick={(e) => {
                                    e?.stopPropagation();
                                    void submitArchiveStatusChange(
                                      agent.id,
                                      "active",
                                    );
                                  }}
                                  variant="outline"
                                  size="icon-sm"
                                />
                              ) : (
                                <IconButtonWithTooltip
                                  icon={<ArchiveIcon className="size-3.5" />}
                                  tooltip="Archivar"
                                  onClick={(e) => {
                                    e?.stopPropagation();
                                    setArchiveTarget(agent);
                                    setArchiveConfirmText("");
                                  }}
                                  variant="outline"
                                  size="icon-sm"
                                />
                              )}
                            </td>
                          ) : null}
                        </tr>
                        {expandedAgentId === agent.id && (
                          <tr className="bg-muted/30">
                            <td colSpan={isAdmin ? 7 : 6} className="p-4">
                              {agent.billing.domiciliated === true ? (
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
                                        setPaymentTargetAgent(agent);
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
                {orderedAgents.length} agentes
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
        open={archiveTarget != null}
        onOpenChange={(open) => {
          if (!open) {
            setArchiveTarget(null);
            setArchiveConfirmText("");
          }
        }}
      >
        <DialogContent showClose>
          <DialogHeader>
            <DialogTitle>Archivar agente</DialogTitle>
            <DialogDescription>
              Para archivar{" "}
              <span className="font-medium text-foreground">
                {archiveTarget?.name}
              </span>{" "}
              escribe <span className="font-semibold text-foreground">CONFIRMAR</span>.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-2">
            <Input
              value={archiveConfirmText}
              onChange={(e) => setArchiveConfirmText(e.target.value)}
              placeholder='Escribe "CONFIRMAR"'
            />
            <p className="text-xs text-muted-foreground">
              El agente no se borra. Se moverá a la sección de archivados.
            </p>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setArchiveTarget(null);
                setArchiveConfirmText("");
              }}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={archiveSaving || archiveConfirmText !== "CONFIRMAR"}
              onClick={async () => {
                if (!archiveTarget) return;
                setArchiveSaving(true);
                try {
                  const ok = await submitArchiveStatusChange(
                    archiveTarget.id,
                    "archived",
                    archiveConfirmText,
                  );
                  if (ok) {
                    setArchiveTarget(null);
                    setArchiveConfirmText("");
                  }
                } finally {
                  setArchiveSaving(false);
                }
              }}
            >
              {archiveSaving ? (
                <Loader2Icon className="mr-2 size-4 animate-spin" />
              ) : null}
              Archivar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <OrgUserPickerDialog
        open={growerTarget != null}
        onOpenChange={(open) => {
          if (!open) setGrowerTarget(null);
        }}
        title="Gestionar growers"
        description={
          growerTarget
            ? `Agente: ${growerTarget.name}. Marca para añadir o desmarca para quitar growers.`
            : undefined
        }
        users={sortedOrgUsers}
        isLoading={growerPickerLoading}
        checkIsAssigned={checkIsGrower}
        onAdd={onCheckAddGrower}
        onRemove={onUncheckRemoveGrower}
        addingUserId={addingGrowerUserId}
        renderUserMeta={(u) => (u.role === "admin" ? "admin" : undefined)}
      />
      <BillingConfigDialog
        open={billingDialogAgent != null}
        onOpenChange={(open) => {
          if (!open) setBillingDialogAgent(null);
        }}
        agent={billingDialogAgent}
        onSaved={async (agent) => {
          await refreshAgentBillingInList(agent.id);
        }}
      />
      <RegisterPaymentDialog
        open={paymentDialogOpen}
        onOpenChange={(open) => {
          if (!open) {
            setPaymentDialogOpen(false);
            setPaymentTargetAgent(null);
          }
        }}
        agent={paymentTargetAgent}
        onPaymentCreated={async (agentId) => {
          const res = await fetchAgentBilling(agentId);
          setExpandedPayments(res?.payments ?? []);
          if (res?.billing) {
            setAgents((prev) =>
              prev.map((a) =>
                a.id === agentId
                  ? {
                      ...a,
                      billing: { ...a.billing, ...res.billing },
                    }
                  : a,
              ),
            );
          }
        }}
      />
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
