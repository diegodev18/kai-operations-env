"use client";

import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

export function DialogSection({
  title,
  description,
  children,
  className,
  isLast = false,
}: {
  title: string;
  description?: string;
  children: ReactNode;
  className?: string;
  isLast?: boolean;
}) {
  return (
    <section
      className={cn(
        "space-y-3 pb-5",
        !isLast && "border-b border-border/60",
        className,
      )}
    >
      <div className="space-y-0.5">
        <h3 className="text-sm font-semibold text-foreground">{title}</h3>
        {description ? (
          <p className="text-xs text-muted-foreground">{description}</p>
        ) : null}
      </div>
      <div className="space-y-3">{children}</div>
    </section>
  );
}
