"use client";

import { Button } from "@/components/ui/button";
import { LoginPage } from "@/components/login-page";
import { useAuth } from "@/hooks/auth";

export default function Home() {
  const { session, isPending, signOut } = useAuth();

  if (isPending) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-black text-zinc-400">
        Cargando…
      </div>
    );
  }

  if (!session?.user) {
    return <LoginPage />;
  }

  const displayName = session.user.name ?? session.user.email ?? "usuario";

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 bg-black px-4 text-center text-white">
      <p className="text-lg text-zinc-100">
        Hola, <span className="font-medium">{displayName}</span>.
      </p>
      <Button
        type="button"
        variant="outline"
        className="border-zinc-700 bg-transparent text-white hover:bg-zinc-900"
        onClick={() => {
          void signOut();
        }}
      >
        Cerrar sesión
      </Button>
    </div>
  );
}
