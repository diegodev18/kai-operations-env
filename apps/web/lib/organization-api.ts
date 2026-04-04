export type OrganizationUser = {
  id: string;
  name: string;
  email: string;
  phone: string | null;
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

/** Extrae mensaje de error de respuestas API (Hono usa `message`, nosotros `error`). */
function errorMessageFromBody(
  data: unknown,
  fallback: string,
  status: number,
): string {
  if (data && typeof data === "object") {
    const o = data as { error?: unknown; message?: unknown };
    if (typeof o.error === "string" && o.error.trim()) return o.error;
    if (typeof o.message === "string" && o.message.trim()) return o.message;
  }
  return `${fallback} (HTTP ${status})`;
}

export async function fetchOrganizationMe(): Promise<{ role: string; email?: string | null } | null> {
  const res = await fetch("/api/organization/me", {
    credentials: "include",
  });
  return parseJson<{ role: string; email?: string | null }>(res);
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
    return {
      error: errorMessageFromBody(
        data,
        "No se pudo crear la invitación",
        res.status,
      ),
    };
  }
  return { inviteUrl: data.inviteUrl };
}

/** Genera un nuevo enlace (el token se rota en servidor; enlaces anteriores dejan de valer). */
export async function copyOrganizationInvitationLink(
  invitationId: string,
): Promise<{ inviteUrl?: string; error?: string }> {
  const res = await fetch("/api/organization/invitations/refresh-link", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ invitationId }),
  });
  let data: unknown;
  try {
    data = await res.json();
  } catch {
    data = null;
  }
  if (!res.ok) {
    return {
      error: errorMessageFromBody(
        data,
        "No se pudo obtener el enlace",
        res.status,
      ),
    };
  }
  const ok = data as { inviteUrl?: string };
  return { inviteUrl: ok.inviteUrl };
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
  role: "admin" | "member" | "commercial",
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

export async function updateUserPhone(
  userId: string,
  phone: string | null,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const res = await fetch(
    `/api/organization/users/${encodeURIComponent(userId)}/phone`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ phone }),
    },
  );
  if (res.ok) {
    return { ok: true };
  }
  let error = "No se pudo actualizar el teléfono";
  try {
    const data = (await res.json()) as { error?: string };
    if (data.error) error = data.error;
  } catch {
    /* empty */
  }
  return { ok: false, error };
}
