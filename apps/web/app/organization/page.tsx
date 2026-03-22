"use client";

import {
  ArrowLeftIcon,
  Building2Icon,
  Loader2Icon,
  ShieldOffIcon,
  ShieldPlusIcon,
  Trash2Icon,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/hooks/auth";
import {
  createOrganizationInvitation,
  deleteOrganizationUser,
  fetchOrganizationInvitations,
  fetchOrganizationMe,
  fetchOrganizationUsers,
  updateOrganizationUserRole,
  type OrganizationInvitation,
  type OrganizationUser,
} from "@/lib/organization-api";

export default function OrganizationPage() {
  const router = useRouter();
  const { session, isPending } = useAuth();
  const [users, setUsers] = useState<OrganizationUser[]>([]);
  const [invitations, setInvitations] = useState<OrganizationInvitation[]>(
    [],
  );
  const [role, setRole] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviting, setInviting] = useState(false);
  const [rowActionId, setRowActionId] = useState<string | null>(null);

  const isAdmin = role === "admin";
  const currentUserId = session?.user?.id as string | undefined;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [me, usersRes] = await Promise.all([
        fetchOrganizationMe(),
        fetchOrganizationUsers(),
      ]);
      if (!me || !usersRes) {
        toast.error("No se pudo cargar la organización");
        setUsers([]);
        setRole(null);
        return;
      }
      setRole(me.role);
      setUsers(usersRes.users);
      if (me.role === "admin") {
        const invRes = await fetchOrganizationInvitations();
        setInvitations(invRes?.invitations ?? []);
      } else {
        setInvitations([]);
      }
    } catch {
      toast.error("No se pudo cargar la organización");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isPending) return;
    if (!session?.user) {
      router.replace("/");
      return;
    }
    void load();
  }, [session?.user, isPending, router, load]);

  async function onCreateInvite(e: React.FormEvent) {
    e.preventDefault();
    if (!inviteEmail.trim()) return;
    setInviting(true);
    try {
      const result = await createOrganizationInvitation(inviteEmail.trim());
      if (result.error) {
        toast.error(result.error);
        return;
      }
      if (result.inviteUrl) {
        try {
          await navigator.clipboard.writeText(result.inviteUrl);
          toast.success("Invitación creada", {
            description: "Enlace copiado al portapapeles.",
          });
        } catch {
          toast.success("Invitación creada", {
            description: result.inviteUrl,
          });
        }
      }
      setInviteEmail("");
      const invRes = await fetchOrganizationInvitations();
      setInvitations(invRes?.invitations ?? []);
    } finally {
      setInviting(false);
    }
  }

  async function onChangeRole(u: OrganizationUser, newRole: "admin" | "member") {
    setRowActionId(u.id);
    try {
      const result = await updateOrganizationUserRole(u.id, newRole);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(
        newRole === "admin"
          ? `${u.name} es ahora administrador`
          : "Rol actualizado a miembro",
      );
      await load();
    } finally {
      setRowActionId(null);
    }
  }

  async function onDeleteUser(u: OrganizationUser) {
    if (
      !globalThis.confirm(
        `¿Eliminar a ${u.name} (${u.email})? Esta acción no se puede deshacer.`,
      )
    ) {
      return;
    }
    setRowActionId(u.id);
    try {
      const result = await deleteOrganizationUser(u.id);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success("Usuario eliminado");
      await load();
    } finally {
      setRowActionId(null);
    }
  }

  if (isPending || (!session?.user && loading)) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background text-muted-foreground">
        <Loader2Icon className="size-8 animate-spin" />
      </div>
    );
  }

  if (!session?.user) {
    return null;
  }

  const admins = users.filter((u) => u.role === "admin");

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <header className="flex h-14 shrink-0 items-center gap-4 border-b px-4">
        <Button variant="ghost" size="sm" className="gap-2" asChild>
          <Link href="/">
            <ArrowLeftIcon className="size-4" />
            Volver
          </Link>
        </Button>
        <div className="flex items-center gap-2 font-semibold">
          <Building2Icon className="size-5" />
          Organización
        </div>
      </header>

      <main className="mx-auto w-full max-w-4xl flex-1 space-y-10 p-6">
        {loading ? (
          <div className="flex justify-center py-12 text-muted-foreground">
            <Loader2Icon className="size-8 animate-spin" />
          </div>
        ) : (
          <>
            <section className="space-y-3">
              <h2 className="text-lg font-semibold">Administradores</h2>
              {admins.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No hay usuarios con rol admin.
                </p>
              ) : (
                <ul className="flex flex-wrap gap-2">
                  {admins.map((u) => (
                    <li key={u.id}>
                      <Badge variant="default">{u.name}</Badge>
                      <span className="ml-2 text-sm text-muted-foreground">
                        {u.email}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className="space-y-3">
              <h2 className="text-lg font-semibold">Usuarios</h2>
              <div className="overflow-x-auto rounded-lg border">
                <table className="w-full text-left text-sm">
                  <thead className="border-b bg-muted/50">
                    <tr>
                      <th className="px-3 py-2 font-medium">Nombre</th>
                      <th className="px-3 py-2 font-medium">Correo</th>
                      <th className="px-3 py-2 font-medium">Rol</th>
                      {isAdmin ? (
                        <th className="px-3 py-2 font-medium text-right">
                          Acciones
                        </th>
                      ) : null}
                    </tr>
                  </thead>
                  <tbody>
                    {users.map((u) => {
                      const isSelf = Boolean(
                        currentUserId && u.id === currentUserId,
                      );
                      const canDemoteAdmin =
                        u.role === "admin" && admins.length >= 2;
                      const busy = rowActionId === u.id;
                      return (
                        <tr key={u.id} className="border-b border-border/60">
                          <td className="px-3 py-2">{u.name}</td>
                          <td className="px-3 py-2 text-muted-foreground">
                            {u.email}
                          </td>
                          <td className="px-3 py-2">
                            <Badge
                              variant={
                                u.role === "admin" ? "default" : "secondary"
                              }
                            >
                              {u.role}
                            </Badge>
                          </td>
                          {isAdmin ? (
                            <td className="px-3 py-2 text-right">
                              {isSelf ? (
                                u.role === "admin" && canDemoteAdmin ? (
                                  <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    className="gap-1"
                                    disabled={busy}
                                    onClick={() => {
                                      void onChangeRole(u, "member");
                                    }}
                                  >
                                    {busy ? (
                                      <Loader2Icon className="size-3.5 animate-spin" />
                                    ) : (
                                      <ShieldOffIcon className="size-3.5" />
                                    )}
                                    Quitar mi rol admin
                                  </Button>
                                ) : (
                                  <span className="text-xs text-muted-foreground">
                                    —
                                  </span>
                                )
                              ) : (
                                <div className="flex flex-wrap items-center justify-end gap-2">
                                  {u.role === "member" ? (
                                    <Button
                                      type="button"
                                      variant="outline"
                                      size="sm"
                                      className="gap-1"
                                      disabled={busy}
                                      onClick={() => {
                                        void onChangeRole(u, "admin");
                                      }}
                                    >
                                      {busy ? (
                                        <Loader2Icon className="size-3.5 animate-spin" />
                                      ) : (
                                        <ShieldPlusIcon className="size-3.5" />
                                      )}
                                      Hacer admin
                                    </Button>
                                  ) : canDemoteAdmin ? (
                                    <Button
                                      type="button"
                                      variant="outline"
                                      size="sm"
                                      className="gap-1"
                                      disabled={busy}
                                      onClick={() => {
                                        void onChangeRole(u, "member");
                                      }}
                                    >
                                      {busy ? (
                                        <Loader2Icon className="size-3.5 animate-spin" />
                                      ) : (
                                        <ShieldOffIcon className="size-3.5" />
                                      )}
                                      Quitar admin
                                    </Button>
                                  ) : null}
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    className="gap-1 text-destructive hover:text-destructive"
                                    disabled={busy}
                                    onClick={() => {
                                      void onDeleteUser(u);
                                    }}
                                  >
                                    {busy ? (
                                      <Loader2Icon className="size-3.5 animate-spin" />
                                    ) : (
                                      <Trash2Icon className="size-3.5" />
                                    )}
                                    Eliminar
                                  </Button>
                                </div>
                              )}
                            </td>
                          ) : null}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>

            {isAdmin ? (
              <section className="space-y-4">
                <h2 className="text-lg font-semibold">Invitaciones</h2>
                <form
                  onSubmit={(e) => {
                    void onCreateInvite(e);
                  }}
                  className="flex max-w-md flex-col gap-3 sm:flex-row sm:items-end"
                >
                  <div className="flex-1 space-y-2">
                    <Label htmlFor="invite-email">Correo del invitado</Label>
                    <Input
                      id="invite-email"
                      type="email"
                      required
                      value={inviteEmail}
                      onChange={(e) => setInviteEmail(e.target.value)}
                      placeholder="nuevo@empresa.com"
                      autoComplete="off"
                    />
                  </div>
                  <Button type="submit" disabled={inviting} className="shrink-0">
                    {inviting ? (
                      <Loader2Icon className="size-4 animate-spin" />
                    ) : (
                      "Generar enlace"
                    )}
                  </Button>
                </form>

                <div>
                  <h3 className="mb-2 text-sm font-medium text-muted-foreground">
                    Pendientes
                  </h3>
                  {invitations.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      No hay invitaciones pendientes.
                    </p>
                  ) : (
                    <ul className="space-y-2 text-sm">
                      {invitations.map((inv) => (
                        <li
                          key={inv.id}
                          className="flex flex-wrap items-center gap-2 rounded-md border px-3 py-2"
                        >
                          <span>{inv.email}</span>
                          <span className="text-muted-foreground">
                            expira{" "}
                            {new Date(inv.expiresAt).toLocaleString("es", {
                              dateStyle: "short",
                              timeStyle: "short",
                            })}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </section>
            ) : null}
          </>
        )}
      </main>
    </div>
  );
}
