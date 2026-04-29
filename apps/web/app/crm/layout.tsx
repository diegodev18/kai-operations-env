"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useUserRole } from "@/hooks";

export default function CrmLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const { role, isAdmin } = useUserRole();
  const isCommercial = role === "commercial";

  useEffect(() => {
    if (!isAdmin && !isCommercial) {
      router.replace("/");
    }
  }, [isAdmin, isCommercial, router]);

  if (!isAdmin && !isCommercial) {
    return null;
  }

  return <>{children}</>;
}
