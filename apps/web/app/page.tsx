"use client";

import { OperationsDashboard } from "@/components/operations-dashboard";
import { LoginPage } from "@/components/login-page";
import { useAuth } from "@/hooks/auth";

export default function Home() {
  const { session, isPending, signOut } = useAuth();

  if (isPending) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background text-muted-foreground">
        Cargando…
      </div>
    );
  }

  if (!session?.user) {
    return <LoginPage />;
  }

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-background">
      <OperationsDashboard
        userName={session.user.name}
        userEmail={session.user.email}
        onSignOut={() => {
          void signOut();
        }}
      />
    </div>
  );
}
