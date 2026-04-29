"use client";

import { PencilIcon, Trash2Icon } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { AgentTool } from "@/types";

import { toolTypeBadgeVariant } from "./helpers";

export function ToolCard({
  tool,
  togglingToolId,
  onToggleEnabled,
  onEdit,
  onDelete,
}: {
  tool: AgentTool;
  togglingToolId: string | null;
  onToggleEnabled: (tool: AgentTool, enabled: boolean) => void;
  onEdit: (tool: AgentTool) => void;
  onDelete: (tool: AgentTool) => void;
}) {
  const isEnabled = tool.enabled !== false;
  const displayName = tool.displayName ?? tool.name;
  const isToggling = togglingToolId === tool.id;

  return (
    <Card
      data-disabled={!isEnabled}
      className="group relative flex h-full flex-col gap-4 py-5 transition-all hover:border-foreground/20 hover:shadow-md data-[disabled=true]:opacity-60"
    >
      <CardHeader className="px-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1 space-y-1.5">
            <div className="flex flex-wrap items-center gap-1.5">
              <Badge
                variant={toolTypeBadgeVariant(tool.type)}
                className="font-mono"
              >
                {tool.type}
              </Badge>
              {!isEnabled ? (
                <Badge variant="outline" className="text-muted-foreground">
                  Deshabilitada
                </Badge>
              ) : null}
            </div>
            <CardTitle className="text-base leading-snug">
              {displayName}
            </CardTitle>
            {displayName !== tool.name ? (
              <code className="block truncate font-mono text-xs text-muted-foreground">
                {tool.name}
              </code>
            ) : null}
          </div>
          <TooltipProvider delayDuration={150}>
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="inline-flex shrink-0">
                  <Switch
                    checked={isEnabled}
                    disabled={isToggling}
                    onCheckedChange={(checked) =>
                      onToggleEnabled(tool, checked)
                    }
                    aria-label={
                      isEnabled ? "Deshabilitar tool" : "Habilitar tool"
                    }
                  />
                </span>
              </TooltipTrigger>
              <TooltipContent side="top">
                {isEnabled ? "Habilitada" : "Deshabilitada"}
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
      </CardHeader>

      <CardContent className="flex flex-1 flex-col gap-4 px-5">
        <p className="line-clamp-3 flex-1 text-sm whitespace-pre-wrap break-words text-muted-foreground">
          {tool.description}
        </p>
        <div className="-mx-5 mt-auto flex items-center justify-end gap-1 border-t px-3 pt-2">
          <TooltipProvider delayDuration={150}>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => onEdit(tool)}
                  aria-label="Editar tool"
                >
                  <PencilIcon className="size-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="top">Editar</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => onDelete(tool)}
                  aria-label="Eliminar tool"
                  className="text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                >
                  <Trash2Icon className="size-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="top">Eliminar</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
      </CardContent>
    </Card>
  );
}
