"use client";

import { Loader2Icon } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth, useUserRole } from "@/hooks";
import { authClient } from "@/lib/auth-client";
import {
  buildGithubAvatarUrl,
  isValidGithubLogin,
  parseGithubLoginFromImageUrl,
} from "@/lib/github-avatar";

function roleLabel(role: string): string {
  if (role === "admin") return "Administrador";
  if (role === "member") return "Miembro";
  return role;
}

export default function ProfilePage() {
  const router = useRouter();
  const { session, isPending, refetch } = useAuth();
  const { role } = useUserRole();

  const [name, setName] = useState("");
  const [githubLogin, setGithubLogin] = useState("");
  /** URL de vista previa que falló al cargar (se reintenta si cambia el login). */
  const [previewFailedUrl, setPreviewFailedUrl] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const sessionName = (session?.user as { name?: string | null })?.name;
  const sessionImage = (session?.user as { image?: string | null })?.image;

  useEffect(() => {
    if (!session?.user) return;
    setName(sessionName ?? "");
    setGithubLogin(parseGithubLoginFromImageUrl(sessionImage));
  }, [session?.user, sessionName, sessionImage]);

  const previewUrl =
    githubLogin.trim() && isValidGithubLogin(githubLogin)
      ? buildGithubAvatarUrl(githubLogin)
      : null;

  const previewLoadsOk =
    previewUrl != null && previewFailedUrl !== previewUrl;

  useEffect(() => {
    if (isPending && !session?.user) return;
    if (!session?.user) {
      router.replace("/");
    }
  }, [isPending, session?.user, router]);

  const handleSave = useCallback(async () => {
    const trimmedName = name.trim();
    if (!trimmedName) {
      toast.error("El nombre no puede estar vacío");
      return;
    }

    const gh = githubLogin.trim().replace(/^@+/, "");
    if (gh && !isValidGithubLogin(gh)) {
      toast.error(
        "Usuario de GitHub no válido (1–39 caracteres, solo letras, números y guiones; sin guión al inicio o al final).",
      );
      return;
    }

    if (gh && previewUrl && previewFailedUrl === previewUrl) {
      toast.error(
        "No se pudo cargar el avatar de GitHub. Revisa el usuario o inténtalo más tarde.",
      );
      return;
    }

    setSaving(true);
    try {
      const imagePayload = gh ? buildGithubAvatarUrl(gh) : null;
      const { error } = await authClient.updateUser({
        name: trimmedName,
        ...(imagePayload !== null
          ? { image: imagePayload }
          : { image: null }),
      });

      if (error) {
        toast.error(error.message ?? "No se pudo guardar el perfil");
        return;
      }

      toast.success("Perfil actualizado");
      await refetch();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error al guardar");
    } finally {
      setSaving(false);
    }
  }, [name, githubLogin, previewUrl, previewFailedUrl, refetch]);

  if (isPending && !session?.user) {
    return (
      <div className="flex flex-1 items-center justify-center p-8 text-muted-foreground">
        Cargando…
      </div>
    );
  }

  if (!session?.user) {
    return null;
  }

  return (
    <div className="mx-auto flex w-full max-w-lg flex-1 flex-col gap-8 p-6">
      <div>
        <h1 className="text-xl font-semibold text-foreground">Tu perfil</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Nombre, foto vía{" "}
          <code className="rounded bg-muted px-1 py-0.5 text-xs">
            github.com/usuario.png
          </code>{" "}
          y tu rol en la organización.
        </p>
      </div>

      <div className="flex flex-col gap-6 rounded-lg border border-border bg-card p-6">
        <div className="space-y-2">
          <Label htmlFor="profile-name">Nombre</Label>
          <Input
            id="profile-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoComplete="name"
            placeholder="Tu nombre"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="profile-github">Usuario de GitHub</Label>
          <Input
            id="profile-github"
            value={githubLogin}
            onChange={(e) => setGithubLogin(e.target.value)}
            placeholder="octocat"
            autoComplete="username"
          />
          <p className="text-xs text-muted-foreground">
            Opcional. La foto se obtiene de la URL pública{" "}
            <span className="whitespace-nowrap">
              https://github.com/tu-usuario.png
            </span>
            . Déjalo vacío para quitar la foto de perfil.
          </p>
        </div>

        <div className="space-y-2">
          <span className="text-sm font-medium leading-none">Vista previa</span>
          <div className="flex items-center gap-4">
            <div className="relative flex size-20 shrink-0 items-center justify-center overflow-hidden rounded-full border border-border bg-muted text-sm font-medium text-muted-foreground">
              {previewLoadsOk ? (
                // eslint-disable-next-line @next/next/no-img-element -- URL externa de GitHub
                <img
                  src={previewUrl!}
                  alt=""
                  className="size-full object-cover"
                  onError={() => setPreviewFailedUrl(previewUrl!)}
                />
              ) : (
                <span aria-hidden>?</span>
              )}
            </div>
            {previewUrl ? (
              <p className="min-w-0 break-all text-xs text-muted-foreground">
                {previewUrl}
              </p>
            ) : (
              <p className="text-xs text-muted-foreground">
                Escribe un usuario válido para previsualizar.
              </p>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-medium">Rol</span>
          <Badge variant="secondary">{roleLabel(role)}</Badge>
          <span className="text-xs text-muted-foreground">(solo lectura)</span>
        </div>

        <div className="flex flex-wrap gap-3">
          <Button
            type="button"
            onClick={() => void handleSave()}
            disabled={saving}
          >
            {saving ? (
              <>
                <Loader2Icon className="mr-2 size-4 animate-spin" />
                Guardando…
              </>
            ) : (
              "Guardar cambios"
            )}
          </Button>
          <Button type="button" variant="outline" asChild>
            <Link href="/">Volver al inicio</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
