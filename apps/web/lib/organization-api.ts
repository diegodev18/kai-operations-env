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
