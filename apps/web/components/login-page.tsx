"use client";

import { ImageIcon, Loader2 } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { authClient } from "@/lib/auth-client";

export function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const result = await authClient.signIn.email({
        email,
        password,
      });
      if (result.error) {
        setError(result.error.message ?? "No se pudo iniciar sesión.");
      }
    } catch {
      setError("No se pudo iniciar sesión.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-screen w-full">
      <div className="flex w-full flex-col bg-black text-white md:w-1/2">
        <header className="flex items-center gap-2 p-6 md:p-8">
          <div className="flex size-9 items-center justify-center rounded-lg bg-white/10">
            <span className="text-sm font-semibold tracking-tight">K</span>
          </div>
          <span className="text-sm font-medium">KAI Operations</span>
        </header>

        <div className="flex flex-1 flex-col justify-center px-6 pb-16 md:px-12 lg:px-16">
          <div className="mx-auto w-full max-w-sm">
            <h1 className="text-2xl font-semibold tracking-tight">
              Inicia sesión
            </h1>
            <p className="mt-2 text-sm text-zinc-400">
              Introduce tu correo y contraseña para acceder.
            </p>

            <form className="mt-10 space-y-6" onSubmit={onSubmit}>
              <div className="space-y-2">
                <Label htmlFor="email" className="text-white">
                  Correo
                </Label>
                <Input
                  id="email"
                  type="email"
                  autoComplete="email"
                  placeholder="tu@empresa.com"
                  value={email}
                  onChange={(ev) => setEmail(ev.target.value)}
                  required
                  className="h-11 border-zinc-800 bg-zinc-950/80 text-white placeholder:text-zinc-500"
                />
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <Label htmlFor="password" className="text-white">
                    Contraseña
                  </Label>
                </div>
                <Input
                  id="password"
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(ev) => setPassword(ev.target.value)}
                  required
                  className="h-11 border-zinc-800 bg-zinc-950/80 text-white"
                />
              </div>

              {error ? (
                <p className="text-sm text-red-400" role="alert">
                  {error}
                </p>
              ) : null}

              <Button
                type="submit"
                disabled={submitting}
                className="h-11 w-full gap-2 rounded-lg bg-white text-black hover:bg-zinc-200"
              >
                {submitting ? (
                  <>
                    <Loader2 className="size-4 animate-spin" />
                    Entrando…
                  </>
                ) : (
                  "Entrar"
                )}
              </Button>
            </form>
          </div>
        </div>
      </div>

      <div className="relative hidden w-1/2 bg-zinc-950 md:flex md:items-center md:justify-center">
        <div className="flex size-40 items-center justify-center rounded-3xl border border-zinc-800/80 bg-zinc-900/50">
          <div className="rounded-full border border-dashed border-zinc-600 p-8">
            <ImageIcon className="size-14 text-zinc-500" strokeWidth={1.25} />
          </div>
        </div>
      </div>
    </div>
  );
}
