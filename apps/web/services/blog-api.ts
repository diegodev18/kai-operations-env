export interface BlogPost {
  id: string;
  title: string;
  content: string;
  authorId: string;
  authorName: string;
  authorMention: string;
  tags: string[];
  images: string[];
  mentions: string[];
  isHidden: boolean;
  type?: string;
  createdAt: number;
  updatedAt: number;
}

export async function fetchBlogPosts(
  type: "lessons" | "actuality" = "lessons",
  options?: { includeHidden?: boolean },
): Promise<BlogPost[] | null> {
  const includeHidden = options?.includeHidden === true;
  const res = await fetch(
    `/api/blog?type=${type}${includeHidden ? "&includeHidden=true" : ""}`,
    { credentials: "include" },
  );
  if (!res.ok) return null;
  const data = await res.json();
  return data.posts ?? [];
}

export async function searchBlogPosts(
  query: string,
  type: "lessons" | "actuality" = "lessons",
  options?: { includeHidden?: boolean },
): Promise<BlogPost[] | null> {
  const includeHidden = options?.includeHidden === true;
  const res = await fetch(
    `/api/blog/search?q=${encodeURIComponent(query)}&type=${type}${includeHidden ? "&includeHidden=true" : ""}`,
    { credentials: "include" },
  );
  if (!res.ok) return null;
  const data = await res.json();
  return data.posts ?? [];
}

export async function fetchBlogPost(
  id: string,
): Promise<BlogPost | null> {
  const res = await fetch(`/api/blog/${encodeURIComponent(id)}`, {
    credentials: "include",
  });
  if (!res.ok) return null;
  const data = await res.json();
  return data.post ?? null;
}

export async function createBlogPost(post: {
  title: string;
  content: string;
  tags: string[];
  type?: string;
}): Promise<{ ok: boolean; post?: BlogPost; error?: string }> {
  const res = await fetch("/api/blog", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(post),
  });
  
  let data;
  try {
    data = await res.json();
  } catch {
    return { ok: false, error: `Error de red o servidor (${res.status})` };
  }

  if (!res.ok) {
    return { ok: false, error: data.error ?? "Error al crear el post" };
  }
  return { ok: true, post: data.post };
}

export async function updateBlogPost(
  id: string,
  post: {
    title: string;
    content: string;
    tags: string[];
    type?: string;
  },
): Promise<{ ok: boolean; post?: BlogPost; error?: string }> {
  const res = await fetch(`/api/blog/${encodeURIComponent(id)}`, {
    method: "PUT",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(post),
  });

  let data;
  try {
    data = await res.json();
  } catch {
    return { ok: false, error: `Error de red o servidor (${res.status})` };
  }

  if (!res.ok) {
    return { ok: false, error: data.error ?? "Error al actualizar el post" };
  }
  return { ok: true, post: data.post };
}

export async function deleteBlogPost(
  id: string,
): Promise<{ ok: boolean; error?: string }> {
  const res = await fetch(`/api/blog/${encodeURIComponent(id)}`, {
    method: "DELETE",
    credentials: "include",
  });

  let data;
  try {
    data = await res.json();
  } catch {
    return { ok: false, error: `Error de red o servidor (${res.status})` };
  }

  if (!res.ok) {
    return { ok: false, error: data.error ?? "Error al eliminar el post" };
  }
  return { ok: true };
}

export async function hideBlogPost(
  id: string,
  hidden: boolean,
): Promise<{ ok: boolean; error?: string }> {
  const res = await fetch(`/api/blog/${encodeURIComponent(id)}/hide`, {
    method: "PATCH",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ hidden }),
  });
  const data = await res.json();
  if (!res.ok) {
    return { ok: false, error: data.error ?? "Error al ocultar el post" };
  }
  return { ok: true };
}

export async function uploadBlogImage(
  file: File,
): Promise<{ ok: boolean; url?: string; error?: string }> {
  const formData = new FormData();
  formData.append("file", file);

  const res = await fetch("/api/blog/upload", {
    method: "POST",
    credentials: "include",
    body: formData,
  });
  const data = await res.json();
  if (!res.ok) {
    return { ok: false, error: data.error ?? "Error al subir la imagen" };
  }
  return { ok: true, url: data.url };
}