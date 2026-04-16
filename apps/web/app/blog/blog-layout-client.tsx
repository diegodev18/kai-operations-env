"use client";

import { useMemo } from "react";
import { usePathname } from "next/navigation";

import {
  OperationsShell,
  type BreadcrumbSegment,
} from "@/components/operations-shell";

function buildBlogBreadcrumb(pathname: string | null): BreadcrumbSegment[] {
  const base: BreadcrumbSegment[] = [
    { label: "Operaciones", href: "/" },
    { label: "Lecciones", href: "/blog" },
  ];
  if (!pathname || pathname === "/blog") {
    return [{ label: "Operaciones", href: "/" }, { label: "Lecciones" }];
  }
  if (pathname === "/blog/new") {
    return [
      { label: "Operaciones", href: "/" },
      { label: "Lecciones", href: "/blog" },
      { label: "Nueva lección" },
    ];
  }
  if (pathname.endsWith("/edit")) {
    return [
      { label: "Operaciones", href: "/" },
      { label: "Lecciones", href: "/blog" },
      { label: "Editar" },
    ];
  }
  if (/^\/blog\/[^/]+$/.test(pathname)) {
    return [
      { label: "Operaciones", href: "/" },
      { label: "Lecciones", href: "/blog" },
      { label: "Entrada" },
    ];
  }
  return base;
}

export function BlogLayoutClient({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const breadcrumb = useMemo(() => buildBlogBreadcrumb(pathname), [pathname]);

  return (
    <OperationsShell breadcrumb={breadcrumb}>{children}</OperationsShell>
  );
}
