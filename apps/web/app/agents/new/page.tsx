"use client";

import { Suspense, useState } from "react";

import { AgentBuilderChatDiagram, AgentFormBuilder } from "@/components/agents";
import { LoginPage } from "@/components/shared";
import { useAuth } from "@/hooks";

function NewAgentPageInner() {
  const { session, isPending } = useAuth();
  const [initialMode] = useState<"form" | "conversational">(() => {
    if (typeof window === "undefined") return "form";
    const params = new URLSearchParams(window.location.search);
    const urlMode = params.get("mode");
    if (urlMode === "form" || urlMode === "conversational") return urlMode;
    const stored = localStorage.getItem("agent-builder-default-mode");
    if (stored === "form" || stored === "conversational") return stored;
    return "form";
  });

  if (isPending && !session?.user) {
    return (
      <div className="flex min-h-screen items-center justify-center text-muted-foreground">
        Cargando...
      </div>
    );
  }

  if (!session?.user) {
    return <LoginPage />;
  }

  if (initialMode === "form") {
    return <AgentFormBuilder />;
  }

  return <AgentBuilderChatDiagram initialMode={initialMode} />;
}

export default function NewAgentPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center text-muted-foreground">
          Cargando...
        </div>
      }
    >
      <NewAgentPageInner />
    </Suspense>
  );
}
