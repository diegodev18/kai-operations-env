import { Suspense } from "react";

import { RegisterWithInvitation } from "./register-form";

export default function RegisterPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-background text-muted-foreground">
          Cargando…
        </div>
      }
    >
      <RegisterWithInvitation />
    </Suspense>
  );
}
