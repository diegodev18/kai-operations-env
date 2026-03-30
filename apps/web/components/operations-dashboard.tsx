"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertCircleIcon,
  CheckCircleIcon,
  CloudDownloadIcon,
  LayoutDashboardIcon,
  LayoutGridIcon,
  Loader2Icon,
  PauseCircleIcon,
  PlusIcon,
  PowerIcon,
  SearchIcon,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
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
import { Input } from "@/components/ui/input";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { AgentOperationalStatus, AgentWithOperations } from "@/lib/agent";
import {
  AGENTS_PAGE_SIZE,
  type AgentGrowerRow,
  deleteAgentGrower,
  fetchAgentGrowers,
  fetchAgentsPage,
  postAgentGrower,
  postAgentSyncFromProduction,
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
  const [search, setSearch] = useState("");
  /** Texto de búsqueda aplicado al API (debounce 300 ms; vacío al limpiar al instante). */
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [billingAlertOnly, setBillingAlertOnly] = useState(false);
  const [agents, setAgents] = useState<AgentWithOperations[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [isLoadingAll, setIsLoadingAll] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | null | undefined>(undefined);
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
  const [syncingAgentId, setSyncingAgentId] = useState<string | null>(null);

  useEffect(() => {
    const trimmed = search.trim();
    if (trimmed === "" || trimmed.length < 3) {
      setDebouncedSearch("");
      return;
    }
    const t = window.setTimeout(() => setDebouncedSearch(trimmed), 300);
    return () => window.clearTimeout(t);
  }, [search]);

  const fetchPage = useCallback(
    async (cursor: string | undefined) => {
      const q = debouncedSearch.trim() || undefined;
      return fetchAgentsPage({
        light: true,
        paginated: true,
        pageSize: AGENTS_PAGE_SIZE,
        cursor,
        ...(q ? { q } : {}),
      });
    },
    [debouncedSearch],
  );

  const fetchAgents = useCallback(async () => {
    setNextCursor(undefined);
    setAgents([]);
    setIsLoading(true);
    try {
      const result = await fetchPage(undefined);
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
    }
  }, [fetchPage]);

  useEffect(() => {
    void fetchAgents();
  }, [fetchAgents]);

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
      return mergedGrowersList.some(
        (g) => g.name.trim().toLowerCase() === un,
      );
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
            if (growers.some((g) => g.email.trim().toLowerCase() === emailNorm)) {
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

  const serverSearchActive = debouncedSearch.trim().length > 0;
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
            a.owner.toLowerCase().includes(q) ||
            (a.industry ?? "").toLowerCase().includes(q)
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
    }
    if (statusFilter !== "all") {
      list = list.filter((a) => a.operationalStatus === statusFilter);
    }
    if (billingAlertOnly) {
      list = list.filter((a) => a.billing.paymentAlert);
    }
    return list;
  }, [
    agents,
    search,
    serverSearchActive,
    statusFilter,
    billingAlertOnly,
  ]);

  const hasMore = nextCursor != null && nextCursor !== undefined;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex h-14 shrink-0 items-center justify-between border-b px-4">
        <div className="flex items-center gap-2 font-semibold text-foreground">
          <LayoutDashboardIcon className="size-5" />
          Operaciones
        </div>
        <UserMenu
          userName={props.userName}
          userEmail={props.userEmail}
          onSignOut={props.onSignOut}
        />
      </header>

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <div className="shrink-0 flex flex-col gap-4 border-b p-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <h1 className="text-2xl font-semibold tracking-tight">
              Dashboard de Operaciones
            </h1>
            <Button type="button" className="gap-2" asChild>
              <Link href="/agents/new">
                <PlusIcon className="size-4" />
                Crear nuevo agente
              </Link>
            </Button>
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
                  isSearchDebouncing ||
                  (Boolean(search.trim()) && isLoading)
                }
              />
              {(isSearchDebouncing ||
                (Boolean(search.trim()) && isLoading)) ? (
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
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-auto p-6">
          {isLoading ? (
            <div className="flex items-center justify-center gap-2 py-12 text-muted-foreground">
              <Loader2Icon className="size-5 animate-spin" />
              <span>Cargando agentes…</span>
            </div>
          ) : (
            <>
              <div className="overflow-x-auto rounded-md border border-border">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border bg-muted/50">
                      <th className="p-3 text-left font-medium">Agente</th>
                      <th className="p-3 text-left font-medium">Entornos</th>
                      <th className="p-3 text-left font-medium">Industria</th>
                      <th className="p-3 text-left font-medium">Estatus</th>
                      <th className="p-3 text-left font-medium">Growers</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredAgents.map((agent) => (
                      <tr
                        key={agent.id}
                        className="border-b border-border transition-colors hover:bg-muted/50 cursor-pointer"
                        onClick={() =>
                          router.push(
                            `/agents/${encodeURIComponent(agent.id)}/configuration`,
                          )
                        }
                      >
                        <td className="p-3 font-medium">
                          <Link
                            href={`/agents/${encodeURIComponent(agent.id)}/configuration`}
                            className="text-primary hover:underline"
                            onClick={(e) => e.stopPropagation()}
                          >
                            {agent.name}
                          </Link>
                        </td>
                        <td className="p-3 align-middle">
                          <div className="flex flex-wrap items-center gap-1.5">
                            {agent.inCommercial ? (
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Badge variant="outline" className="font-normal">
                                    Testing
                                  </Badge>
                                </TooltipTrigger>
                                <TooltipContent>
                                  Existe en asistente comercial (entorno de prueba)
                                </TooltipContent>
                              </Tooltip>
                            ) : null}
                            {agent.inProduction ? (
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Badge variant="secondary" className="font-normal">
                                    Producción
                                  </Badge>
                                </TooltipTrigger>
                                <TooltipContent>
                                  Existe en proyecto kai (producción)
                                </TooltipContent>
                              </Tooltip>
                            ) : null}
                            {!agent.inCommercial && !agent.inProduction ? (
                              <span className="text-muted-foreground">—</span>
                            ) : null}
                            {agent.inProduction && !agent.inCommercial ? (
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Badge variant="destructive" className="font-normal">
                                    Solo producción
                                  </Badge>
                                </TooltipTrigger>
                                <TooltipContent>
                                  Aún no hay copia en asistente comercial; puedes
                                  bajar los datos desde kai
                                </TooltipContent>
                              </Tooltip>
                            ) : null}
                            {agent.inProduction ? (
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button
                                    type="button"
                                    variant="outline"
                                    size="icon-sm"
                                    className="size-8 shrink-0"
                                    aria-label={
                                      agent.inCommercial
                                        ? "Refrescar desde producción al entorno comercial"
                                        : "Crear copia en testing desde producción"
                                    }
                                    disabled={syncingAgentId === agent.id}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      void (async () => {
                                        setSyncingAgentId(agent.id);
                                        const r = await postAgentSyncFromProduction(
                                          agent.id,
                                        );
                                        setSyncingAgentId(null);
                                        if (r.ok) {
                                          toast.success(
                                            "Sincronizado desde producción al entorno comercial",
                                          );
                                          void fetchAgents();
                                        } else {
                                          toast.error(r.error);
                                        }
                                      })();
                                    }}
                                  >
                                    {syncingAgentId === agent.id ? (
                                      <Loader2Icon
                                        className="size-4 animate-spin"
                                        aria-hidden
                                      />
                                    ) : (
                                      <CloudDownloadIcon
                                        className="size-4"
                                        aria-hidden
                                      />
                                    )}
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent className="max-w-xs">
                                  {agent.inCommercial
                                    ? "Refrescar desde producción: vuelve a copiar el agente desde kai al asistente comercial (sobrescribe la copia de testing)."
                                    : "Bajar a testing: crea la copia en asistente comercial desde kai (doc y subcolecciones)."}
                                </TooltipContent>
                              </Tooltip>
                            ) : null}
                          </div>
                        </td>
                        <td className="p-3 text-muted-foreground">
                          {agent.industry ?? "—"}
                        </td>
                        <td className="p-3">
                          <Badge variant={STATUS_BADGE_VARIANT[agent.operationalStatus]}>
                            {STATUS_LABELS[agent.operationalStatus]}
                          </Badge>
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
                                        <TooltipContent>{g.email}</TooltipContent>
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
                              <TooltipContent>Gestionar growers</TooltipContent>
                            </Tooltip>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {filteredAgents.length === 0 ? (
                <p className="py-8 text-center text-muted-foreground">
                  {agents.length === 0
                    ? serverSearchActive
                      ? "No hay agentes que coincidan con la búsqueda."
                      : "No hay agentes."
                    : "Ningún agente coincide con los filtros."}
                </p>
              ) : null}
              {hasMore && !isLoading ? (
                <div className="mt-4 flex gap-2">
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
                      isLoadingAll || isSearchDebouncing || Boolean(debouncedSearch.trim())
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
            </>
          )}
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
                          disabled={busy || growerPickerLoading || !growerTarget}
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
    </div>
  );
}
