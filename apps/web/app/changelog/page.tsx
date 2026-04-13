"use client";

import Link from "next/link";
import { PROJECTS, getProjectById } from "./changelog-data";
import { Button } from "@/components/ui/button";
import { ArrowLeftIcon, HomeIcon, LayoutDashboardIcon, PanelLeftCloseIcon, BotIcon, WrenchIcon } from "lucide-react";

const PROJECT_ICONS = {
  atlas: LayoutDashboardIcon,
  panel: PanelLeftCloseIcon,
  agents: BotIcon,
  tools: WrenchIcon,
};

export default function ChangelogPage() {
  return (
    <div className="min-h-screen bg-background p-8">
      <div className="mx-auto max-w-4xl">
        <header className="mb-12 flex items-center justify-between">
          <div>
            <h1 className="font-heading text-4xl font-bold tracking-tight text-foreground">
              Changelog
            </h1>
            <p className="mt-2 text-muted-foreground">
              Registro de cambios, mejoras y nuevas funcionalidades.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => window.history.back()}>
              <ArrowLeftIcon className="size-4 mr-2" />
              Back
            </Button>
            <Button variant="outline" size="sm" asChild>
              <Link href="/" className="flex items-center gap-2">
                <HomeIcon className="size-4" />
                Home
              </Link>
            </Button>
          </div>
        </header>

        <div className="grid gap-4 sm:grid-cols-2">
          {PROJECTS.map((project) => {
            const Icon = PROJECT_ICONS[project.id];
            const isAtlas = project.id === "atlas";
            return (
              <Link
                key={project.id}
                href={`/changelog/${project.id}`}
                className="group relative flex flex-col rounded-lg border border-border bg-card p-6 transition-colors hover:bg-muted/50"
              >
                <div className="flex items-center gap-3">
                  <div className="flex size-10 items-center justify-center rounded-md bg-primary/10 text-primary">
                    <Icon className="size-5" />
                  </div>
                  <div>
                    <h2 className="font-semibold text-foreground">
                      {project.name}
                    </h2>
                    <p className="text-sm text-muted-foreground">
                      {project.description}
                    </p>
                  </div>
                </div>
                <div className="mt-4 flex items-center gap-2 text-sm text-muted-foreground">
                  {isAtlas ? (
                    <span className="text-xs">Hardcoded</span>
                  ) : (
                    <span className="text-xs">Firebase</span>
                  )}
                  <span className="text-xs opacity-50">→</span>
                </div>
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}