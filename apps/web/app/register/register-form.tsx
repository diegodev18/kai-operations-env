"use client";

import { Loader2Icon } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { authClient } from "@/lib/auth/auth-client";
import { fetchInvitationPreview } from "@/services/organization-api";
import {
  buildWhatsappApiPhone,
  DEFAULT_WHATSAPP_LADA,
  WHATSAPP_LADA_OPTIONS,
} from "@/lib/phone/whatsapp-phone-format";

export function RegisterWithInvitation() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token")?.trim() ?? "";

  const [email, setEmail] = useState<string | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(true);
  const [name, setName] = useState("");
  const [phoneLada, setPhoneLada] = useState(DEFAULT_WHATSAPP_LADA);
  const [phoneNational, setPhoneNational] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) {
      setPreviewError(
        "Falta el enlace de invitación. Pide a un administrador una invitación.",
      );
      setPreviewLoading(false);
      return;
    }
    let cancelled = false;
    void (async () => {
      setPreviewLoading(true);
      setPreviewError(null);
      const data = await fetchInvitationPreview(token);
      if (cancelled) return;
      if (!data) {
        setPreviewError(
          "Invitación no válida o expirada. Solicita una nueva.",
        );
        setEmail(null);
      } else {
        setEmail(data.email);
      }
      setPreviewLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!token || !email) return;
    setFormError(null);
    setSubmitting(true);
    try {
      const nationalDigits = phoneNational.replace(/\D/g, "");
      const phoneForApi =
        nationalDigits.length > 0
          ? buildWhatsappApiPhone(phoneLada, phoneNational)
          : undefined;

      const result = await authClient.signUp.email({
        email,
        password,
        name: name.trim() || email.split("@")[0] || "Usuario",
        phone: phoneForApi,
        invitationToken: token,
      } as {
        email: string;
        password: string;
        name: string;
        phone?: string;
        invitationToken: string;
      });
      if (result.error) {
        setFormError(
          result.error.message ?? "No se pudo completar el registro.",
        );
        return;
      }
      router.replace("/");
      router.refresh();
    } catch {
      setFormError("No se pudo completar el registro.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-screen w-full flex-col bg-background text-foreground">
      <header className="flex items-center gap-2 border-b p-6">
        <span className="text-sm font-medium">KAI Operations</span>
      </header>
      <div className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center px-6 py-12">
        <h1 className="text-2xl font-semibold tracking-tight">
          Crear cuenta
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Solo con invitación. El correo debe ser el de la invitación.
        </p>

        {previewLoading ? (
          <div className="mt-10 flex justify-center text-muted-foreground">
            <Loader2Icon className="size-8 animate-spin" />
          </div>
        ) : previewError ? (
          <p className="mt-8 text-sm text-destructive" role="alert">
            {previewError}
          </p>
        ) : email ? (
          <form className="mt-10 space-y-6" onSubmit={onSubmit}>
            <div className="space-y-2">
              <Label htmlFor="reg-email">Correo</Label>
              <Input
                id="reg-email"
                type="email"
                value={email}
                readOnly
                className="bg-muted"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="reg-name">Nombre</Label>
              <Input
                id="reg-name"
                type="text"
                autoComplete="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Tu nombre"
              />
            </div>
            <div className="space-y-2">
              <Label>Teléfono (opcional)</Label>
              <p className="text-xs text-muted-foreground">
                Se guarda en formato API de WhatsApp (igual que en Organización).
              </p>
              <div className="space-y-2">
                <Label htmlFor="reg-phone-lada" className="text-muted-foreground">
                  Lada
                </Label>
                <Select value={phoneLada} onValueChange={setPhoneLada}>
                  <SelectTrigger id="reg-phone-lada">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {WHATSAPP_LADA_OPTIONS.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="reg-phone" className="text-muted-foreground">
                  Número
                </Label>
                <Input
                  id="reg-phone"
                  type="tel"
                  autoComplete="tel-national"
                  value={phoneNational}
                  onChange={(e) => setPhoneNational(e.target.value)}
                  placeholder="9932639212"
                />
              </div>
              {phoneNational.replace(/\D/g, "").length > 0 ? (
                <div className="rounded-md bg-muted px-3 py-2 text-sm">
                  <span className="text-muted-foreground">Formato final: </span>
                  <code className="font-mono">
                    {buildWhatsappApiPhone(phoneLada, phoneNational)}
                  </code>
                </div>
              ) : null}
            </div>
            <div className="space-y-2">
              <Label htmlFor="reg-password">Contraseña</Label>
              <Input
                id="reg-password"
                type="password"
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={8}
              />
            </div>
            {formError ? (
              <p className="text-sm text-destructive" role="alert">
                {formError}
              </p>
            ) : null}
            <Button type="submit" className="w-full" disabled={submitting}>
              {submitting ? (
                <>
                  <Loader2Icon className="mr-2 size-4 animate-spin" />
                  Registrando…
                </>
              ) : (
                "Registrarse"
              )}
            </Button>
          </form>
        ) : null}

        <p className="mt-8 text-center text-sm text-muted-foreground">
          ¿Ya tienes cuenta?{" "}
          <Link href="/" className="text-foreground underline underline-offset-4">
            Inicia sesión
          </Link>
        </p>
      </div>
    </div>
  );
}
