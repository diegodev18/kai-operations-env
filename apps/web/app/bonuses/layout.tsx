"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/hooks";

export default function BonusesLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { session, isPending } = useAuth();

  useEffect(() => {
    if (!isPending && !session?.user) {
      router.replace("/");
    }
  }, [isPending, session?.user, router]);

  if (isPending || !session?.user) {
    return null;
  }

  return <>{children}</>;
}
