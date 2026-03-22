"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertCircleIcon,
  CheckCircleIcon,
  LayoutDashboardIcon,
  LayoutGridIcon,
  Loader2Icon,
  LogOutIcon,
  PauseCircleIcon,
  PlusIcon,
  PowerIcon,
  SearchIcon,
} from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { AgentOperationalStatus, AgentWithOperations } from "@/lib/agent";
import { AGENTS_PAGE_SIZE, fetchAgentsPage } from "@/lib/agents-api";

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

function initialsFromUser(name: string | null | undefined, email: string | null | undefined): string {
  if (name?.trim()) {
    const parts = name.trim().split(/\s+/).filter(Boolean);
    if (parts.length >= 2) {
      return (parts[0]![0]! + parts[parts.length - 1]![0]!).toUpperCase();
    }
    return name.slice(0, 2).toUpperCase();
  }
  if (email?.trim()) return email.slice(0, 2).toUpperCase();
  return "?";
}

export function OperationsDashboard(props: {
  userName: string | null | undefined;
  userEmail: string | null | undefined;
  onSignOut: () => void;
}) {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [billingAlertOnly, setBillingAlertOnly] = useState(false);
  const [agents, setAgents] = useState<AgentWithOperations[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [isLoadingAll, setIsLoadingAll] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | null | undefined>(undefined);

  const fetchPage = useCallback(
    async (cursor: string | undefined) => {
      return fetchAgentsPage({
        light: true,
        paginated: true,
        pageSize: AGENTS_PAGE_SIZE,
        cursor,
      });
    },
    [],
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

  const filteredAgents = useMemo(() => {
    let list = agents;
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
    if (statusFilter !== "all") {
      list = list.filter((a) => a.operationalStatus === statusFilter);
    }
    if (billingAlertOnly) {
      list = list.filter((a) => a.billing.paymentAlert);
    }
    return list;
  }, [agents, search, statusFilter, billingAlertOnly]);

  const hasMore = nextCursor != null && nextCursor !== undefined;
  const avatarLabel = initialsFromUser(props.userName, props.userEmail);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex h-14 shrink-0 items-center justify-between border-b px-4">
        <div className="flex items-center gap-2 font-semibold text-foreground">
          <LayoutDashboardIcon className="size-5" />
          Operaciones
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="flex size-9 shrink-0 items-center justify-center rounded-full border border-border bg-muted text-xs font-medium text-foreground outline-none transition-colors hover:bg-muted/80 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
              aria-label="Menú de usuario"
            >
              {avatarLabel}
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="min-w-48">
            <DropdownMenuLabel className="font-normal">
              <div className="flex flex-col gap-0.5">
                {props.userName ? (
                  <span className="text-sm font-medium text-foreground">
                    {props.userName}
                  </span>
                ) : null}
                {props.userEmail ? (
                  <span className="text-xs text-muted-foreground">
                    {props.userEmail}
                  </span>
                ) : (
                  <span className="text-sm text-muted-foreground">Usuario</span>
                )}
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              variant="destructive"
              onSelect={() => {
                props.onSignOut();
              }}
            >
              <LogOutIcon className="size-4" />
              Cerrar sesión
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </header>

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <div className="shrink-0 flex flex-col gap-4 border-b p-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <h1 className="text-2xl font-semibold tracking-tight">
              Dashboard de Operaciones
            </h1>
            <Button type="button" className="gap-2">
              <PlusIcon className="size-4" />
              Crear nuevo agente
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
              />
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
                      <th className="p-3 text-left font-medium">Industria</th>
                      <th className="p-3 text-left font-medium">Estatus</th>
                      <th className="p-3 text-left font-medium">Growers</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredAgents.map((agent) => (
                      <tr
                        key={agent.id}
                        className="border-b border-border transition-colors hover:bg-muted/50"
                      >
                        <td className="p-3 font-medium">{agent.name}</td>
                        <td className="p-3 text-muted-foreground">
                          {agent.industry ?? "—"}
                        </td>
                        <td className="p-3">
                          <Badge variant={STATUS_BADGE_VARIANT[agent.operationalStatus]}>
                            {STATUS_LABELS[agent.operationalStatus]}
                          </Badge>
                        </td>
                        <td className="p-3 text-muted-foreground">
                          {agent.growers && agent.growers.length > 0 ? (
                            <span className="flex flex-wrap items-center gap-x-1 gap-y-0.5">
                              {agent.growers.map((g, i) => (
                                <span key={`${g.email}-${i}`} className="inline-flex items-center">
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
                            "—"
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {filteredAgents.length === 0 ? (
                <p className="py-8 text-center text-muted-foreground">
                  {agents.length === 0
                    ? "No hay agentes."
                    : "Ningún agente coincide con los filtros."}
                </p>
              ) : null}
              {hasMore && !isLoading ? (
                <div className="mt-4 flex gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={isLoadingMore}
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
                    disabled={isLoadingAll}
                    onClick={() => void loadAll()}
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
    </div>
  );
}
