"use client";

import Link from "next/link";
import { useParams, usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { fetchAgentById } from "@/lib/agents-api";

const SECTIONS = [
  { suffix: "configuration", label: "Configuración" },
  { suffix: "tools", label: "Tools" },
  { suffix: "prompt-design", label: "Diseño de prompt" },
  { suffix: "simulator", label: "Simulador" },
] as const;

export default function AgentDetailLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const params = useParams();
  const pathname = usePathname();
  const agentId = typeof params.agentId === "string" ? params.agentId : "";
  const [agentName, setAgentName] = useState<string | null>(null);

  useEffect(() => {
    if (!agentId) return;
    let cancelled = false;
    (async () => {
      const a = await fetchAgentById(agentId);
      if (!cancelled && a?.name) setAgentName(a.name);
    })();
    return () => {
      cancelled = true;
    };
  }, [agentId]);

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-background">
      <header className="flex shrink-0 flex-wrap items-center gap-3 border-b px-4 py-3">
        <Link
          href="/"
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          ← Dashboard
        </Link>
        <div className="min-w-0">
          <h1 className="truncate text-lg font-semibold">
            {agentName || "Agente"}
          </h1>
          <p className="truncate font-mono text-xs text-muted-foreground">
            {agentId || "—"}
          </p>
        </div>
        <nav className="ml-auto flex flex-wrap items-center gap-1">
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
