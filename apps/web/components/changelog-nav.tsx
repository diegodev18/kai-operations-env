"use client";

import Link from "next/link";
import { LayoutDashboardIcon, LayoutGridIcon, PanelLeftCloseIcon, BotIcon, WrenchIcon } from "lucide-react";

const PROJECTS = [
  { id: "atlas", name: "Atlas", href: "/changelog/atlas", Icon: LayoutDashboardIcon },
  { id: "panel", name: "Panel Web", href: "/changelog/panel", Icon: PanelLeftCloseIcon },
  { id: "agents", name: "kAI Agents", href: "/changelog/agents", Icon: BotIcon },
  { id: "tools", name: "Tools MCP", href: "/changelog/tools", Icon: WrenchIcon },
];

export function ChangelogNavItem({
  onClick,
}: {
  onClick?: () => void;
}) {
  return (
    <div className="relative">
      <Link
        href="/changelog"
        className="flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-foreground hover:bg-muted"
        onClick={onClick}
      >
        <LayoutGridIcon className="size-4" />
        Changelog
      </Link>
      <div className="mt-1 ml-4 space-y-1 border-l border-border pl-4">
        {PROJECTS.map((p) => (
          <Link
            key={p.id}
            href={p.href}
            className="flex items-center gap-2 rounded-md px-3 py-2 text-sm text-foreground hover:bg-muted"
            onClick={onClick}
          >
            <p.Icon className="size-4 text-muted-foreground" />
            {p.name}
          </Link>
        ))}
      </div>
    </div>
  );
}

export function ChangelogDesktopNav() {
  return (
    <div className="group relative inline-block">
      <Link
        href="/changelog"
        className="flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-foreground hover:bg-muted"
      >
        <LayoutGridIcon className="size-4" />
        Changelog
      </Link>
      <div className="absolute left-0 top-full mt-1 hidden group-hover:block z-50 rounded-md border border-border bg-background shadow-lg p-1 min-w-[180px]">
        {PROJECTS.map((p) => (
          <Link
            key={p.id}
            href={p.href}
            className="flex items-center gap-2 rounded-md px-3 py-2 text-sm text-foreground hover:bg-muted"
          >
            <p.Icon className="size-4 text-muted-foreground" />
            {p.name}
          </Link>
        ))}
      </div>
    </div>
  );
}