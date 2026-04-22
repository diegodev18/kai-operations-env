"use client";

import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { type ReactNode } from "react";

export function IconButtonWithTooltip({
  icon,
  tooltip,
  onClick,
  variant = "ghost",
  size = "icon-sm",
  active = false,
  disabled = false,
  className,
}: {
  icon: ReactNode;
  tooltip: string;
  onClick?: () => void;
  variant?:
    | "default"
    | "destructive"
    | "outline"
    | "secondary"
    | "ghost"
    | "link";
  size?: "default" | "sm" | "lg" | "icon" | "icon-sm";
  active?: boolean;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          variant={active ? "secondary" : variant}
          size={size}
          onClick={onClick}
          disabled={disabled}
          className={className}
        >
          {icon}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{tooltip}</TooltipContent>
    </Tooltip>
  );
}
