"use client";

import Link from "next/link";
import { useParams, usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { CheckCircleIcon, Home, PowerIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { UserMenu } from "@/components/user-menu";
import { useAuth } from "@/hooks/auth";
import { cn } from "@/lib/utils";
import { fetchAgentById } from "@/lib/agents-api";

const SECTIONS = [
  { suffix: "prompt-design", label: "Diseño de prompt" },
  { suffix: "tools", label: "Tools" },
  { suffix: "simulator", label: "Simulador" },
  { suffix: "tasks", label: "Tareas" },
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

function AgentEnabledBadge({ enabled }: { enabled: boolean | null }) {
  if (enabled === null) {
    return (
      <span
        className="inline-flex h-6 min-w-[4.5rem] animate-pulse rounded-full bg-muted"
        aria-hidden
      />
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
  const [deploymentInfo, setDeploymentInfo] = useState<{
    inCommercial: boolean;
    inProduction: boolean;
  } | null>(null);

  useEffect(() => {
    if (!agentId) return;
    let cancelled = false;
    const load = async () => {
      const a = await fetchAgentById(agentId);
      if (cancelled) return;
      if (!a) {
        setHeaderNames({ agentName: "", businessName: "" });
        setEnabled(false);
        setDeploymentInfo(null);
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
      setDeploymentInfo({
        inCommercial: Boolean(a.inCommercial),
        inProduction: Boolean(a.inProduction),
      });
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [agentId]);

  useEffect(() => {
    if (!agentId) return;
    const onDeploymentChange = () => {
      void (async () => {
        const a = await fetchAgentById(agentId);
        if (!a) {
          setDeploymentInfo(null);
          return;
        }
        setDeploymentInfo({
          inCommercial: Boolean(a.inCommercial),
          inProduction: Boolean(a.inProduction),
        });
      })();
    };
    window.addEventListener("kai-agent-deployment-changed", onDeploymentChange);
    return () => {
      window.removeEventListener(
        "kai-agent-deployment-changed",
        onDeploymentChange,
      );
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
          <AgentEnabledBadge enabled={enabled} />
          {deploymentInfo?.inCommercial ? (
            <Badge variant="outline" className="shrink-0 font-normal">
              Testing (comercial)
            </Badge>
          ) : null}
          {deploymentInfo?.inProduction ? (
            <Badge variant="secondary" className="shrink-0 font-normal">
              Producción (kai)
            </Badge>
          ) : null}
          {deploymentInfo?.inProduction && !deploymentInfo?.inCommercial ? (
            <Badge variant="destructive" className="shrink-0 font-normal">
              Solo en producción
            </Badge>
          ) : null}
          {!authPending && session?.user ? (
            <UserMenu
              userName={session.user.name}
              userEmail={session.user.email}
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
