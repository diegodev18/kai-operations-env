import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function SettingsSection({
  id,
  title,
  description,
  badge,
  children,
  className,
}: {
  id: string;
  title: string;
  description: string;
  badge?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      id={id}
      className={cn(
        "scroll-mt-24 rounded-2xl border bg-card/70 p-4 shadow-sm",
        className,
      )}
    >
      <div className="mb-4 flex items-start justify-between gap-4">
        <div className="min-w-0 space-y-1">
          <h3 className="text-sm font-semibold tracking-tight text-foreground">
            {title}
          </h3>
          <p className="text-xs leading-relaxed text-muted-foreground">
            {description}
          </p>
        </div>
        {badge}
      </div>
      <div className="space-y-3">{children}</div>
    </section>
  );
}
