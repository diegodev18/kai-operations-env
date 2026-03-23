"use client";

import Link from "next/link";
import { useParams, usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Home } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { fetchAgentById } from "@/lib/agents-api";

const SECTIONS = [
  { suffix: "configuration", label: "Configuración" },
  { suffix: "tools", label: "Tools" },
  { suffix: "prompt-design", label: "Diseño de prompt" },
  { suffix: "simulator", label: "Simulador" },
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

export default function AgentDetailLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const params = useParams();
  const pathname = usePathname();
  const agentId = typeof params.agentId === "string" ? params.agentId : "";
  const [headerNames, setHeaderNames] = useState<{
    agentName: string;
    businessName: string;
  } | null>(null);

  useEffect(() => {
    if (!agentId) return;
    let cancelled = false;
    (async () => {
      const a = await fetchAgentById(agentId);
      if (cancelled) return;
      if (!a) {
        setHeaderNames({ agentName: "", businessName: "" });
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
    })();
    return () => {
      cancelled = true;
    };
  }, [agentId]);

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-background">
      <header className="flex shrink-0 flex-wrap items-center gap-3 border-b px-4 py-3">
        <Button variant="ghost" size="icon" asChild>
          <Link href="/" aria-label="Volver al dashboard">
            <Home className="size-5" />
          </Link>
        </Button>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-lg leading-tight">
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
        <nav className="flex flex-wrap items-center gap-1 sm:ml-auto">
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
                  "rounded-md px-3 py-1.5 text-sm transition-colors",
                  active
                    ? "bg-muted font-medium"
                    : "text-muted-foreground hover:bg-muted/50",
                )}
              >
                {s.label}
              </Link>
            );
          })}
        </nav>
      </header>
      <main className="min-h-0 flex-1 overflow-auto p-4">{children}</main>
    </div>
  );
}
