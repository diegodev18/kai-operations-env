"use client";

import Link from "next/link";
import { useParams, usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import {
  CheckCircleIcon,
  Home,
  PowerIcon,
  Loader2Icon,
  StarIcon,
  FlaskConicalIcon,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { UserMenu } from "@/components/user-menu";
import { AgentActivitySheet } from "@/components/agent-activity-sheet";
import { useAuth } from "@/hooks";
import { cn } from "@/lib/utils";
import {
  assignAgentToUser,
  fetchAgentById,
  fetchAssignedAgentForUser,
  fetchFavorites,
  toggleFavorite,
} from "@/services/agents-api";

const SECTIONS = [
  { suffix: "tasks", label: "Tareas" },
  { suffix: "simulator", label: "Simulador" },
  { suffix: "tools", label: "Tools" },
  { suffix: "prompt-design", label: "Diseño de prompt" },
  { suffix: "form", label: "Formulario" },
  { suffix: "testing-data", label: "Testing" },
  { suffix: "configuration", label: "Configuración" },
] as const;

/** Título: nombre del agente (énfasis) · nombre del negocio (secundario), como en el diseño de referencia. */
function AgentHeaderTitle({
  agentName,
  businessName,
}: {
  agentName: string;
  businessName: string;
}) {
  const a = agentName.trim();
  const b = businessName.trim();

  if (!a && !b) {
    return <span className="text-muted-foreground">Agente</span>;
  }

  if (a && !b) {
    return <span className="font-semibold text-foreground">{a}</span>;
  }

  if (!a && b) {
    return <span className="font-semibold text-foreground">{b}</span>;
  }

  if (a === b) {
    return <span className="font-semibold text-foreground">{a}</span>;
  }

  return (
    <span className="flex min-w-0 flex-wrap items-baseline gap-x-1.5 gap-y-0.5">
      <span className="shrink-0 font-semibold text-foreground">{a}</span>
      <span className="shrink-0 text-muted-foreground" aria-hidden>
        ·
      </span>
      <span className="min-w-0 truncate font-normal text-muted-foreground">
        {b}
      </span>
    </span>
  );
}

function AgentEnabledBadge({
  enabled,
  status,
}: {
  enabled: boolean | null;
  status: "active" | "archived" | null;
}) {
  if (enabled === null || status === null) {
    return (
      <span
        className="inline-flex h-6 min-w-[4.5rem] animate-pulse rounded-full bg-muted"
        aria-hidden
      />
    );
  }
  if (status === "archived") {
    return (
      <Badge variant="outline" className="gap-1 font-medium">
        Archivado
      </Badge>
    );
  }
  if (enabled) {
    return (
      <Badge variant="default" className="gap-1 font-medium">
        <CheckCircleIcon className="size-3.5" />
        Activo
      </Badge>
    );
  }
  return (
    <Badge variant="secondary" className="gap-1 font-medium">
      <PowerIcon className="size-3.5" />
      Apagado
    </Badge>
  );
}

export default function AgentDetailLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const params = useParams();
  const pathname = usePathname();
  const agentId = typeof params.agentId === "string" ? params.agentId : "";
  const { session, isPending: authPending, signOut } = useAuth();

  const [headerNames, setHeaderNames] = useState<{
    agentName: string;
    businessName: string;
  } | null>(null);
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [status, setStatus] = useState<"active" | "archived" | null>(null);
  const [favoriteAgentIds, setFavoriteAgentIds] = useState<Set<string>>(new Set());
  const [togglingFavorite, setTogglingFavorite] = useState<string | null>(null);
  const [assigningAgentId, setAssigningAgentId] = useState<string | null>(null);
  const [assignedAgentId, setAssignedAgentId] = useState<string | null>(null);

  useEffect(() => {
    if (!agentId) return;
    let cancelled = false;
    const load = async () => {
      const a = await fetchAgentById(agentId);
      if (cancelled) return;
      if (!a) {
        setHeaderNames({ agentName: "", businessName: "" });
        setEnabled(false);
        setStatus("active");
        return;
      }
      const business =
        typeof a.businessName === "string" && a.businessName.trim() !== ""
          ? a.businessName
          : (a.name ?? "");
      const agent =
        typeof a.agentName === "string" && a.agentName.trim() !== ""
          ? a.agentName
          : "";
      setHeaderNames({ agentName: agent, businessName: business });
      setEnabled(typeof a.enabled === "boolean" ? a.enabled : true);
      setStatus(a.status === "archived" ? "archived" : "active");
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [agentId]);

  useEffect(() => {
    if (!agentId) return;
    let cancelled = false;
    const loadAssignedAgent = async () => {
      const currentAssigned = await fetchAssignedAgentForUser();
      if (cancelled) return;
      setAssignedAgentId(currentAssigned);
    };
    void loadAssignedAgent();
    return () => {
      cancelled = true;
    };
  }, [agentId]);

  useEffect(() => {
    if (!agentId) return;
    let cancelled = false;
    const loadFavorites = async () => {
      try {
        const data = await fetchFavorites();
        if (!cancelled && data) {
          setFavoriteAgentIds(new Set(data.favorites ?? []));
        }
      } catch {
        // ignore
      }
    };
    void loadFavorites();
    return () => {
      cancelled = true;
    };
  }, [agentId]);

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-background">
      <header className="grid min-h-11 shrink-0 grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2 border-b px-3 py-1.5 sm:px-4 sm:py-2">
        <div className="flex min-w-0 items-center gap-1.5 sm:gap-2">
          <Button variant="ghost" size="icon" asChild>
            <Link href="/" aria-label="Volver al dashboard">
              <Home className="size-4" />
            </Link>
          </Button>
          <h1 className="min-w-0 truncate text-sm leading-tight sm:text-base">
            {headerNames ? (
              <AgentHeaderTitle
                agentName={headerNames.agentName}
                businessName={headerNames.businessName}
              />
            ) : (
              <span className="text-muted-foreground">Cargando…</span>
            )}
          </h1>
        </div>

        <nav
          className="flex max-w-[100vw] flex-wrap items-center justify-center gap-0.5 px-1 sm:gap-1"
          aria-label="Secciones del agente"
        >
          {SECTIONS.map((s) => {
            const href = `/agents/${encodeURIComponent(agentId)}/${s.suffix}`;
            const active =
              pathname === href ||
              pathname.endsWith(`/${s.suffix}`) ||
              pathname.endsWith(`/${s.suffix}/`);
            return (
              <Link
                key={s.suffix}
                href={href}
                className={cn(
                  "whitespace-nowrap rounded-md px-2 py-1.5 text-xs font-semibold transition-colors sm:px-3 sm:text-sm",
                  active
                    ? "bg-muted"
                    : "text-muted-foreground hover:bg-muted/50",
                )}
              >
                {s.label}
              </Link>
            );
          })}
        </nav>

        <div className="flex min-w-0 flex-wrap items-center justify-end gap-1.5 sm:gap-2">
          <AgentEnabledBadge enabled={enabled} status={status} />
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant={assignedAgentId === agentId ? "secondary" : "outline"}
                  size="icon"
                  className="size-7 shrink-0"
                  disabled={assigningAgentId === agentId}
                  onClick={async () => {
                    if (assigningAgentId === agentId) return;
                    setAssigningAgentId(agentId);
                    try {
                      const result = await assignAgentToUser(agentId);
                      if (result.ok) {
                        setAssignedAgentId(agentId);
                        toast.success("Agente asignado a testing");
                      } else {
                        toast.error(result.error);
                      }
                    } catch {
                      toast.error("Error al asignar agente a testing");
                    } finally {
                      setAssigningAgentId(null);
                    }
                  }}
                >
                  {assigningAgentId === agentId ? (
                    <Loader2Icon className="size-3.5 animate-spin" />
                  ) : assignedAgentId === agentId ? (
                    <CheckCircleIcon className="size-3.5 text-emerald-600" />
                  ) : (
                    <FlaskConicalIcon className="size-3.5 text-muted-foreground" />
                  )}
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>
                  {assignedAgentId === agentId
                    ? "Asignado a tu número de testing"
                    : "Asignar a número de testing"}
                </p>
              </TooltipContent>
            </Tooltip>
              <AgentActivitySheet agentId={agentId} />
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="outline"
                    size="icon"
                    className="size-7 shrink-0"
                    disabled={togglingFavorite !== null}
                    onClick={async () => {
                      const isFavorite = favoriteAgentIds.has(agentId);
                      setTogglingFavorite(agentId);
                      try {
                        const method = isFavorite ? "DELETE" : "POST";
                        const result = await toggleFavorite(agentId, method);
                        if (result.ok) {
                          setFavoriteAgentIds((prev) => {
                            const next = new Set(prev);
                            if (isFavorite) {
                              next.delete(agentId);
                            } else {
                              next.add(agentId);
                            }
                            return next;
                          });
                          toast.success(
                            isFavorite
                              ? "Eliminado de favoritos"
                              : "Añadido a favoritos",
                          );
                        } else {
                          toast.error(result.error ?? "Error al actualizar favoritos");
                        }
                      } finally {
                        setTogglingFavorite(null);
                      }
                    }}
                  >
                    {togglingFavorite !== null ? (
                      <Loader2Icon className="size-3.5 animate-spin" />
                    ) : favoriteAgentIds.has(agentId) ? (
                      <StarIcon className="size-3.5 fill-yellow-400 text-yellow-400" />
                    ) : (
                      <StarIcon className="size-3.5 text-muted-foreground" />
                    )}
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>
                    {favoriteAgentIds.has(agentId)
                      ? "Quitar de favoritos"
                      : "Añadir a favoritos"}
                  </p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          {!authPending && session?.user ? (
            <UserMenu
              userName={session.user.name}
              userEmail={session.user.email}
              userImage={(session.user as { image?: string | null }).image}
              onSignOut={() => {
                void signOut();
              }}
            />
          ) : authPending && !session?.user ? (
            <div
              className="size-7 shrink-0 animate-pulse rounded-full bg-muted"
              aria-hidden
            />
          ) : null}
        </div>
      </header>
      <main className="flex min-h-0 flex-1 flex-col overflow-hidden p-4">
        {children}
      </main>
    </div>
  );
}
