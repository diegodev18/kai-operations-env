export type OrganizationUser = {
  id: string;
  name: string;
  email: string;
  role: string;
  createdAt: string | null;
};

export type OrganizationInvitation = {
  id: string;
  email: string;
  expiresAt: string;
  createdAt: string;
};

async function parseJson<T>(res: Response): Promise<T | null> {
  if (!res.ok) return null;
  try {
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

export async function fetchOrganizationMe(): Promise<{ role: string } | null> {
  const res = await fetch("/api/organization/me", {
    credentials: "include",
  });
  return parseJson<{ role: string }>(res);
}

export async function fetchOrganizationUsers(): Promise<{
  users: OrganizationUser[];
} | null> {
  const res = await fetch("/api/organization/users", {
    credentials: "include",
  });
  return parseJson<{ users: OrganizationUser[] }>(res);
}

export async function fetchOrganizationInvitations(): Promise<{
  invitations: OrganizationInvitation[];
} | null> {
  const res = await fetch("/api/organization/invitations", {
    credentials: "include",
  });
  return parseJson<{ invitations: OrganizationInvitation[] }>(res);
}

export async function createOrganizationInvitation(
  email: string,
): Promise<{ inviteUrl?: string; error?: string }> {
  const res = await fetch("/api/organization/invitations", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ email }),
  });
  let data: { inviteUrl?: string; error?: string } = {};
  try {
    data = (await res.json()) as { inviteUrl?: string; error?: string };
  } catch {
    /* empty */
  }
  if (!res.ok) {
    return { error: data.error ?? "No se pudo crear la invitación" };
  }
  return { inviteUrl: data.inviteUrl };
}

/** Genera un nuevo enlace (el token se rota en servidor; enlaces anteriores dejan de valer). */
export async function copyOrganizationInvitationLink(
  invitationId: string,
): Promise<{ inviteUrl?: string; error?: string }> {
  const res = await fetch(
    `/api/organization/invitations/${encodeURIComponent(invitationId)}/link`,
    {
      method: "POST",
      credentials: "include",
    },
  );
  let data: { inviteUrl?: string; error?: string } = {};
  try {
    data = (await res.json()) as { inviteUrl?: string; error?: string };
  } catch {
    /* empty */
  }
  if (!res.ok) {
    return { error: data.error ?? "No se pudo obtener el enlace" };
  }
  return { inviteUrl: data.inviteUrl };
}

export async function deleteOrganizationInvitation(
  invitationId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const res = await fetch(
    `/api/organization/invitations/${encodeURIComponent(invitationId)}`,
    {
      method: "DELETE",
      credentials: "include",
    },
  );
  if (res.ok) {
    return { ok: true };
  }
  let error = "No se pudo eliminar la invitación";
  try {
    const data = (await res.json()) as { error?: string };
    if (data.error) error = data.error;
  } catch {
    /* empty */
  }
  return { ok: false, error };
}

export async function fetchInvitationPreview(
  token: string,
): Promise<{ email: string } | null> {
  const params = new URLSearchParams({ token });
  const res = await fetch(
    `/api/organization/invitation-preview?${params.toString()}`,
    { credentials: "omit" },
  );
  return parseJson<{ email: string }>(res);
}

export async function updateOrganizationUserRole(
  userId: string,
  role: "admin" | "member",
): Promise<{ ok: true } | { ok: false; error: string }> {
  const res = await fetch(
    `/api/organization/users/${encodeURIComponent(userId)}`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ role }),
    },
  );
  if (res.ok) {
    return { ok: true };
  }
  let error = "No se pudo actualizar el rol";
  try {
    const data = (await res.json()) as { error?: string };
    if (data.error) error = data.error;
  } catch {
    /* empty */
  }
  return { ok: false, error };
}

export async function deleteOrganizationUser(
  userId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const res = await fetch(
    `/api/organization/users/${encodeURIComponent(userId)}`,
    {
      method: "DELETE",
      credentials: "include",
    },
  );
  if (res.ok) {
    return { ok: true };
  }
  let error = "No se pudo eliminar el usuario";
  try {
    const data = (await res.json()) as { error?: string };
    if (data.error) error = data.error;
  } catch {
    /* empty */
  }
  return { ok: false, error };
}
