"use client";

import {
  ArrowLeftIcon,
  Building2Icon,
  CopyIcon,
  Loader2Icon,
  PencilIcon,
  PhoneIcon,
  Trash2Icon,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAuth } from "@/hooks";
import {
  copyOrganizationInvitationLink,
  createOrganizationInvitation,
  deleteOrganizationInvitation,
  deleteOrganizationUser,
  fetchOrganizationInvitations,
  fetchOrganizationMe,
  fetchOrganizationUsers,
  resetUserPassword,
  updateOrganizationUserRole,
  updateUserPhone,
  type OrganizationInvitation,
  type OrganizationUser,
} from "@/services/organization-api";
import {
  buildWhatsappApiPhone,
  DEFAULT_WHATSAPP_LADA,
  parseStoredPhoneForEditor,
  WHATSAPP_LADA_OPTIONS,
} from "@/lib/whatsapp-phone-format";

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
  const [copyInviteId, setCopyInviteId] = useState<string | null>(null);
  const [removeInviteId, setRemoveInviteId] = useState<string | null>(null);
  const [phoneDialogOpen, setPhoneDialogOpen] = useState(false);
  const [phoneDialogUser, setPhoneDialogUser] = useState<OrganizationUser | null>(null);
  const [phoneLada, setPhoneLada] = useState(DEFAULT_WHATSAPP_LADA);
  const [phoneNumber, setPhoneNumber] = useState("");
  const [savingPhone, setSavingPhone] = useState(false);
  const [editUserDialogOpen, setEditUserDialogOpen] = useState(false);
  const [editUserDialogUser, setEditUserDialogUser] = useState<OrganizationUser | null>(null);
  const [confirmDeleteEmail, setConfirmDeleteEmail] = useState("");
  const [confirmDeleteLoading, setConfirmDeleteLoading] = useState(false);
  const [resetPasswordLoading, setResetPasswordLoading] = useState(false);

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
    // Esperar solo la carga inicial de sesión; no bloquear si hay usuario y la sesión se está refrescando.
    if (isPending && !session?.user) return;
    if (!session?.user) {
      router.replace("/");
      return;
    }
    void load();
  }, [session?.user, isPending, router, load]);

  async function onCopyInviteLink(inv: OrganizationInvitation) {
    setCopyInviteId(inv.id);
    try {
      const result = await copyOrganizationInvitationLink(inv.id);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      if (result.inviteUrl) {
        try {
          await navigator.clipboard.writeText(result.inviteUrl);
          toast.success("Enlace copiado", {
            description:
              "Se generó un enlace nuevo y la fecha de expiración se renovó. Cualquier enlace anterior deja de funcionar.",
          });
        } catch {
          toast.success("Enlace generado", {
            description: result.inviteUrl,
          });
        }
      }
      const invRes = await fetchOrganizationInvitations();
      setInvitations(invRes?.invitations ?? []);
    } finally {
      setCopyInviteId(null);
    }
  }

  async function onRemoveInvite(inv: OrganizationInvitation) {
    if (
      !globalThis.confirm(
        `¿Revocar la invitación a ${inv.email}? El enlace dejará de funcionar.`,
      )
    ) {
      return;
    }
    setRemoveInviteId(inv.id);
    try {
      const result = await deleteOrganizationInvitation(inv.id);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success("Invitación eliminada");
      const invRes = await fetchOrganizationInvitations();
      setInvitations(invRes?.invitations ?? []);
    } finally {
      setRemoveInviteId(null);
    }
  }

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

  function openPhoneDialog(u: OrganizationUser) {
    setPhoneDialogUser(u);
    const { lada, nationalNumber } = parseStoredPhoneForEditor(u.phone);
    setPhoneLada(lada);
    setPhoneNumber(nationalNumber);
    setPhoneDialogOpen(true);
  }

  function closePhoneDialog() {
    setPhoneDialogOpen(false);
    setPhoneDialogUser(null);
    setPhoneNumber("");
  }

  async function confirmSavePhone() {
    if (!phoneDialogUser) return;
    setSavingPhone(true);
    try {
      const finalPhone = buildWhatsappApiPhone(phoneLada, phoneNumber);
      const result = await updateUserPhone(phoneDialogUser.id, finalPhone);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success("Teléfono actualizado");
      await load();
      closePhoneDialog();
    } finally {
      setSavingPhone(false);
    }
  }

  function openEditUserDialog(u: OrganizationUser) {
    setEditUserDialogUser(u);
    setConfirmDeleteEmail("");
    setEditUserDialogOpen(true);
  }

  function closeEditUserDialog() {
    setEditUserDialogOpen(false);
    setEditUserDialogUser(null);
    setConfirmDeleteEmail("");
  }

  async function onChangeRoleFromDialog(newRole: "admin" | "member" | "commercial") {
    if (!editUserDialogUser) return;
    setRowActionId(editUserDialogUser.id);
    try {
      const result = await updateOrganizationUserRole(editUserDialogUser.id, newRole);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(
        newRole === "admin"
          ? `${editUserDialogUser.name} es ahora administrador`
          : newRole === "commercial"
          ? "Rol actualizado a comercial"
          : "Rol actualizado a miembro",
      );
      await load();
      if (editUserDialogUser) {
        const updatedUser = users.find(user => user.id === editUserDialogUser.id);
        if (updatedUser) {
          setEditUserDialogUser({ ...updatedUser, role: newRole });
        }
      }
    } finally {
      setRowActionId(null);
    }
  }

  async function onResetPassword() {
    if (!editUserDialogUser) return;
    setResetPasswordLoading(true);
    try {
      const result = await resetUserPassword(editUserDialogUser.id);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success("Contraseña temporal generada", {
        description: `Nueva contraseña: ${result.tempPassword}`,
        duration: 20000,
      });
    } finally {
      setResetPasswordLoading(false);
    }
  }

  async function onDeleteUserFromDialog() {
    if (!editUserDialogUser) return;
    const userEmail = editUserDialogUser.email.toLowerCase().trim();
    const confirmEmail = confirmDeleteEmail.toLowerCase().trim();
    if (userEmail !== confirmEmail) {
      toast.error("El correo no coincide");
      return;
    }
    setConfirmDeleteLoading(true);
    try {
      const result = await deleteOrganizationUser(editUserDialogUser.id);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success("Usuario eliminado");
      closeEditUserDialog();
      await load();
    } finally {
      setConfirmDeleteLoading(false);
    }
  }

  if ((isPending && !session?.user) || (!session?.user && loading)) {
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
                      <th className="px-3 py-2 font-medium">Teléfono</th>
                      <th className="px-3 py-2 font-medium">Rol</th>
                      {isAdmin ? (
                        <th className="px-3 py-2 font-medium w-10">
                         
                        </th>
                      ) : null}
                    </tr>
                  </thead>
                  <tbody>
                    {users.map((u) => {
                      const busy = rowActionId === u.id;
                      return (
                        <tr key={u.id} className="border-b border-border/60">
                          <td className="px-3 py-2">{u.name}</td>
                          <td className="px-3 py-2 text-muted-foreground">
                            {u.email}
                          </td>
                          <td className="px-3 py-2">
                            {isAdmin ? (
                              <span
                                className="inline-flex cursor-pointer items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
                                onClick={() => openPhoneDialog(u)}
                              >
                                <PhoneIcon className="size-3.5" />
                                {u.phone || "—"}
                              </span>
                            ) : (
                              <span className="text-sm text-muted-foreground">
                                {u.phone || "—"}
                              </span>
                            )}
                          </td>
                          <td className="px-3 py-2">
                            <Badge
                              variant={
                                u.role === "admin"
                                  ? "default"
                                  : u.role === "commercial"
                                  ? "outline"
                                  : "secondary"
                              }
                            >
                              {u.role}
                            </Badge>
                          </td>
{isAdmin ? (
                            <td className="px-3 py-2 text-right">
                              {currentUserId && u.id === currentUserId ? (
                                <span className="text-xs text-muted-foreground">—</span>
                              ) : (
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  disabled={busy}
                                  onClick={() => openEditUserDialog(u)}
                                >
                                  <PencilIcon className="size-4" />
                                </Button>
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
                  <p className="mb-3 text-xs text-muted-foreground">
                    Para volver a copiar un enlace se genera uno nuevo (el
                    anterior deja de ser válido).
                  </p>
                  {invitations.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      No hay invitaciones pendientes.
                    </p>
                  ) : (
                    <ul className="space-y-2 text-sm">
                      {invitations.map((inv) => (
                        <li
                          key={inv.id}
                          className="flex flex-wrap items-center justify-between gap-2 rounded-md border px-3 py-2"
                        >
                          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
                            <span className="truncate">{inv.email}</span>
                            <span className="text-muted-foreground">
                              expira{" "}
                              {new Date(inv.expiresAt).toLocaleString("es", {
                                dateStyle: "short",
                                timeStyle: "short",
                              })}
                            </span>
                          </div>
                          <div className="flex shrink-0 flex-wrap items-center gap-2">
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="gap-1"
                              disabled={
                                copyInviteId === inv.id ||
                                removeInviteId === inv.id
                              }
                              onClick={() => {
                                void onCopyInviteLink(inv);
                              }}
                            >
                              {copyInviteId === inv.id ? (
                                <Loader2Icon className="size-3.5 animate-spin" />
                              ) : (
                                <CopyIcon className="size-3.5" />
                              )}
                              Copiar enlace
                            </Button>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="gap-1 text-destructive hover:text-destructive"
                              disabled={
                                removeInviteId === inv.id ||
                                copyInviteId === inv.id
                              }
                              onClick={() => {
                                void onRemoveInvite(inv);
                              }}
                            >
                              {removeInviteId === inv.id ? (
                                <Loader2Icon className="size-3.5 animate-spin" />
                              ) : (
                                <Trash2Icon className="size-3.5" />
                              )}
                              Quitar
                            </Button>
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </section>
            ) : null}
          </>
        )}

        <Dialog open={phoneDialogOpen} onOpenChange={(open) => {
          if (!open) closePhoneDialog();
        }}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Editar teléfono</DialogTitle>
              <DialogDescription>
                El teléfono se guardará en formato API de WhatsApp.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Lada</Label>
                <Select value={phoneLada} onValueChange={setPhoneLada}>
                  <SelectTrigger>
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
                <Label>Número</Label>
                <Input
                  type="tel"
                  value={phoneNumber}
                  onChange={(e) => setPhoneNumber(e.target.value)}
                  placeholder="9932639212"
                />
              </div>
              <div className="rounded-md bg-muted px-3 py-2 text-sm">
                <span className="text-muted-foreground">Formato final: </span>
                <code className="font-mono">
                  {buildWhatsappApiPhone(phoneLada, phoneNumber)}
                </code>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={closePhoneDialog}>
                Cancelar
              </Button>
              <Button onClick={confirmSavePhone} disabled={savingPhone || !phoneNumber.trim()}>
                {savingPhone ? <Loader2Icon className="size-4 animate-spin mr-2" /> : null}
                Guardar
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={editUserDialogOpen} onOpenChange={(open) => {
          if (!open) closeEditUserDialog();
        }}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Editar usuario</DialogTitle>
              <DialogDescription>
                {editUserDialogUser?.name} ({editUserDialogUser?.email})
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Rol</Label>
                <Select
                  value={editUserDialogUser?.role ?? "member"}
                  onValueChange={(value) => {
                    void onChangeRoleFromDialog(value as "admin" | "member" | "commercial");
                  }}
                  disabled={rowActionId !== null}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="admin">Administrador</SelectItem>
                    <SelectItem value="commercial">Comercial</SelectItem>
                    <SelectItem value="member">Miembro</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {editUserDialogUser && editUserDialogUser.id !== currentUserId && (
                <div className="space-y-2">
                  <Button
                    variant="outline"
                    className="w-full"
                    onClick={() => void onResetPassword()}
                    disabled={resetPasswordLoading}
                  >
                    {resetPasswordLoading ? (
                      <Loader2Icon className="size-4 animate-spin mr-2" />
                    ) : null}
                    Generar contraseña temporal
                  </Button>
                </div>
              )}

              {editUserDialogUser && editUserDialogUser.id !== currentUserId && (
                <div className="space-y-2">
                  <Label>Expulsar usuario</Label>
                  <p className="text-xs text-muted-foreground">
                    Escribe el correo del usuario para confirmar.
                  </p>
                  <Input
                    value={confirmDeleteEmail}
                    onChange={(e) => setConfirmDeleteEmail(e.target.value)}
                    placeholder={editUserDialogUser?.email ?? ""}
                    autoComplete="off"
                  />
                  <Button
                    variant="destructive"
                    className="w-full"
                    onClick={() => void onDeleteUserFromDialog()}
                    disabled={
                      confirmDeleteEmail.toLowerCase().trim() !==
                        editUserDialogUser?.email.toLowerCase().trim() ||
                      confirmDeleteLoading
                    }
                  >
                    {confirmDeleteLoading ? (
                      <Loader2Icon className="size-4 animate-spin mr-2" />
                    ) : (
                      <Trash2Icon className="size-4 mr-2" />
                    )}
                    Eliminar usuario
                  </Button>
                </div>
              )}
            </div>
          </DialogContent>
        </Dialog>
      </main>
    </div>
  );
}
