"use client";

import { Suspense } from "react";

import { AgentBuilderChatDiagram } from "@/components/agent-builder-chat-diagram";
import { LoginPage } from "@/components/login-page";
import { useAuth } from "@/hooks/auth";

function NewAgentPageInner() {
  const { session, isPending } = useAuth();

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

  return <AgentBuilderChatDiagram />;
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
