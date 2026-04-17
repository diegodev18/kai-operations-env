"use client";

import { useMemo } from "react";

import {
  OperationsShell,
  type BreadcrumbSegment,
} from "@/components/operations-shell";

const profileBreadcrumb: BreadcrumbSegment[] = [
  { label: "Operaciones", href: "/" },
  { label: "Perfil" },
];

export function ProfileLayoutClient({
  children,
}: {
  children: React.ReactNode;
}) {
  const breadcrumb = useMemo(() => profileBreadcrumb, []);

  return (
    <OperationsShell breadcrumb={breadcrumb}>{children}</OperationsShell>
  );
}
