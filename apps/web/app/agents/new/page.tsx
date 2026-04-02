"use client";

import { Suspense, useEffect, useState } from "react";

import { AgentBuilderChatDiagram } from "@/components/agent-builder-chat-diagram";
import { LoginPage } from "@/components/login-page";
import { useAuth } from "@/hooks/auth";

function NewAgentPageInner() {
  const { session, isPending } = useAuth();
  const [initialMode, setInitialMode] = useState<"form" | "conversational">("form");
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const urlMode = params.get("mode");
    if (urlMode === "form" || urlMode === "conversational") {
      setInitialMode(urlMode);
    } else {
      const stored = localStorage.getItem("agent-builder-default-mode");
      if (stored === "form" || stored === "conversational") {
        setInitialMode(stored);
      }
    }
    setIsLoading(false);
  }, []);

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

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center text-muted-foreground">
        Cargando...
      </div>
    );
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
