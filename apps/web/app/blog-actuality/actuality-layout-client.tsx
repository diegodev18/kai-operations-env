"use client";

import { useMemo } from "react";
import { usePathname } from "next/navigation";

import {
  OperationsShell,
  type BreadcrumbSegment,
} from "@/components/operations";

function buildActualityBreadcrumb(pathname: string | null): BreadcrumbSegment[] {
  if (!pathname || pathname === "/blog-actuality") {
    return [{ label: "Operaciones", href: "/" }, { label: "Actualidad" }];
  }
  if (pathname === "/blog-actuality/new") {
    return [
      { label: "Operaciones", href: "/" },
      { label: "Actualidad", href: "/blog-actuality" },
      { label: "Nueva entrada" },
    ];
  }
  if (pathname.endsWith("/edit")) {
    return [
      { label: "Operaciones", href: "/" },
      { label: "Actualidad", href: "/blog-actuality" },
      { label: "Editar" },
    ];
  }
  if (/^\/blog-actuality\/[^/]+$/.test(pathname)) {
    return [
      { label: "Operaciones", href: "/" },
      { label: "Actualidad", href: "/blog-actuality" },
      { label: "Entrada" },
    ];
  }
  return [
    { label: "Operaciones", href: "/" },
    { label: "Actualidad", href: "/blog-actuality" },
  ];
}

export function ActualityLayoutClient({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const breadcrumb = useMemo(
    () => buildActualityBreadcrumb(pathname),
    [pathname],
  );

  return (
    <OperationsShell breadcrumb={breadcrumb}>{children}</OperationsShell>
  );
}
