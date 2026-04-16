import type { Context } from "hono";
import { Hono } from "hono";
import admin from "firebase-admin";
import { getFirestore, FieldValue, Timestamp } from "@/lib/firestore";
import { auth } from "@/lib/auth";
import { resolveSessionUserRole } from "@/utils/sessionUser";
import { FIREBASE_APP_NAME } from "@/config";
import { nanoid } from "nanoid";

const blogRouter = new Hono();

const LESSONS_COLLECTION = "backOffice/blog/lessons";
const ACTUALITY_COLLECTION = "backOffice/blog/actuality";
const STORAGE_BUCKET = "kai-project-26879.appspot.com";

interface BlogPost {
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

type PostType = "lessons" | "actuality";

function normalizePostType(value: string | undefined): PostType {
  return value === "actuality" ? "actuality" : "lessons";
}

function collectionForType(type: PostType): string {
  return type === "actuality" ? ACTUALITY_COLLECTION : LESSONS_COLLECTION;
}

async function findPostDocById(db: FirebaseFirestore.Firestore, id: string) {
  const lessonsRef = db.collection(LESSONS_COLLECTION).doc(id);
  const actualityRef = db.collection(ACTUALITY_COLLECTION).doc(id);

  const [lessonsDoc, actualityDoc] = await Promise.all([
    lessonsRef.get(),
    actualityRef.get(),
  ]);

  if (lessonsDoc.exists) {
    return {
      doc: lessonsDoc,
      ref: lessonsRef,
      type: "lessons" as const,
      collection: LESSONS_COLLECTION,
    };
  }
  if (actualityDoc.exists) {
    return {
      doc: actualityDoc,
      ref: actualityRef,
      type: "actuality" as const,
      collection: ACTUALITY_COLLECTION,
    };
  }
  return null;
}

function toTimestamp(value: unknown): number {
  if (!value) return Date.now();
  if (typeof value === "number") return value;
  const ts = value as { toMillis?: () => number };
  return ts.toMillis?.() ?? Date.now();
}

async function getSessionUser(c: Context) {
  const session = await auth.api.getSession({ headers: c.req.raw.headers });
  if (!session?.user) {
    return null;
  }
  const u = session.user as {
    id?: string;
    role?: string | null;
    email?: string | null;
    name?: string | null;
  };
  const role = await resolveSessionUserRole(u);
  return {
    id: u.id ?? "",
    email: u.email ?? "",
    name: u.name ?? "",
    role: role ?? "member",
  };
}

function parseMentions(content: string): string[] {
  const mentionRegex = /@(\w+)/g;
  const mentions: string[] = [];
  let match;
  while ((match = mentionRegex.exec(content)) !== null) {
    if (!mentions.includes(match[1])) {
      mentions.push(match[1]);
    }
  }
  return mentions;
}

blogRouter.get("/", async (c) => {
  const user = await getSessionUser(c);
  if (!user?.id) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const type = normalizePostType(c.req.query("type"));
  const db = getFirestore();

  const query = db
    .collection(collectionForType(type))
    .orderBy("createdAt", "desc")
    .limit(100);

  let snapshot;
  try {
    snapshot = await query.get();
  } catch (error: any) {
    console.error("Error fetching blog posts:", error);
    return c.json(
      {
        error: "Error al cargar los posts",
        details: error.message,
        code: error.code,
      },
      500,
    );
  }

  const posts = snapshot.docs
    .map((doc) => {
      const data = doc.data() as any;
      return {
        id: doc.id,
        title: data.title,
        content: data.content,
        authorId: data.authorId,
        authorName: data.authorName,
        authorMention: data.authorMention,
        tags: data.tags ?? [],
        images: data.images ?? [],
        mentions: data.mentions ?? [],
        isHidden: Boolean(data.isHidden),
        type: normalizePostType(data.type),
        createdAt: toTimestamp(data.createdAt),
        updatedAt: toTimestamp(data.updatedAt),
      };
    })
    .filter((post) => !post.isHidden)
    .slice(0, 50);

  return c.json({ posts });
});

blogRouter.get("/search", async (c) => {
  const user = await getSessionUser(c);
  if (!user?.id) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const q = c.req.query("q")?.toLowerCase() ?? "";
  const type = normalizePostType(c.req.query("type"));
  if (!q) {
    return c.json({ posts: [] });
  }

  const db = getFirestore();
  let snapshot;
  try {
    snapshot = await db
      .collection(collectionForType(type))
      .where("isHidden", "==", false)
      .get();
  } catch (error: any) {
    console.error("Error searching blog posts:", error);
    return c.json(
      {
        error: "Error en la búsqueda",
        details: error.message,
        code: error.code,
      },
      500,
    );
  }

  const posts: BlogPost[] = [];
  for (const doc of snapshot.docs) {
    const data = doc.data() as any;

    const titleMatch = data.title?.toLowerCase().includes(q);
    const contentMatch = data.content?.toLowerCase().includes(q);
    const tagMatch = data.tags?.some((t: string) =>
      t.toLowerCase().includes(q),
    );
    const authorMatch =
      data.authorName?.toLowerCase().includes(q) ||
      data.authorMention?.toLowerCase().includes(q);

    if (titleMatch || contentMatch || tagMatch || authorMatch) {
      posts.push({
        id: doc.id,
        title: data.title,
        content: data.content,
        authorId: data.authorId,
        authorName: data.authorName,
        authorMention: data.authorMention,
        tags: data.tags ?? [],
        images: data.images ?? [],
        mentions: data.mentions ?? [],
        isHidden: data.isHidden,
        type,
        createdAt: toTimestamp(data.createdAt),
        updatedAt: toTimestamp(data.updatedAt),
      });
    }
  }

  posts.sort((a, b) => b.createdAt - a.createdAt);
  return c.json({ posts: posts.slice(0, 50) });
});

blogRouter.get("/:id", async (c) => {
  const user = await getSessionUser(c);
  if (!user?.id) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const id = c.req.param("id");
  const db = getFirestore();
  const found = await findPostDocById(db, id);

  if (!found) {
    return c.json({ error: "Post no encontrado" }, 404);
  }

  const doc = found.doc;
  const data = doc.data() as BlogPost;
  if (data.isHidden && user.role !== "admin") {
    return c.json({ error: "Post no encontrado" }, 404);
  }

  return c.json({
    post: {
      id: doc.id,
      title: data.title,
      content: data.content,
      authorId: data.authorId,
      authorName: data.authorName,
      authorMention: data.authorMention,
      tags: data.tags ?? [],
      images: data.images ?? [],
      mentions: data.mentions ?? [],
      isHidden: data.isHidden,
      type: found.type,
      createdAt: toTimestamp(data.createdAt),
      updatedAt: toTimestamp(data.updatedAt),
    },
  });
});

blogRouter.post("/", async (c) => {
  const user = await getSessionUser(c);
  if (!user?.id) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  let body: {
    title?: string;
    content?: string;
    tags?: string[];
    images?: string[];
    type?: string;
  };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Cuerpo inválido" }, 400);
  }

  const title = body.title?.trim() ?? "";
  const content = body.content ?? "";
  const tags = Array.isArray(body.tags)
    ? body.tags.filter((t): t is string => typeof t === "string")
    : [];
  const images = Array.isArray(body.images)
    ? body.images.filter((i): i is string => typeof i === "string")
    : [];
  const type = normalizePostType(body.type);

  if (!title) {
    return c.json({ error: "El título es obligatorio" }, 400);
  }

  const mentions = parseMentions(content);
  const authorMention = user.email.split("@")[0];

  const db = getFirestore();
  const docRef = db.collection(collectionForType(type)).doc();
  const now = Timestamp.now();

  await docRef.set({
    id: docRef.id,
    title,
    content,
    authorId: user.id,
    authorName: user.name ?? user.email,
    authorMention,
    tags,
    images,
    mentions,
    isHidden: false,
    type,
    createdAt: now,
    updatedAt: now,
  });

  return c.json(
    {
      post: {
        id: docRef.id,
        title,
        content,
        authorId: user.id,
        authorName: user.name ?? user.email,
        authorMention,
        tags,
        images,
        mentions,
        isHidden: false,
        type,
        createdAt: now.toMillis(),
        updatedAt: now.toMillis(),
      },
    },
    201,
  );
});

blogRouter.put("/:id", async (c) => {
  const user = await getSessionUser(c);
  if (!user?.id) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const id = c.req.param("id");
  const db = getFirestore();
  const found = await findPostDocById(db, id);

  if (!found) {
    return c.json({ error: "Post no encontrado" }, 404);
  }

  const docRef = found.ref;
  const doc = found.doc;
  const data = doc.data() as BlogPost;
  if (data.authorId !== user.id && user.role !== "admin") {
    return c.json({ error: "No autorizado para editar este post" }, 403);
  }

  let body: {
    title?: string;
    content?: string;
    tags?: string[];
    images?: string[];
  };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Cuerpo inválido" }, 400);
  }

  const title = body.title?.trim() ?? data.title;
  const content = body.content ?? data.content;
  const tags = Array.isArray(body.tags)
    ? body.tags.filter((t): t is string => typeof t === "string")
    : data.tags;
  const images = Array.isArray(body.images)
    ? body.images.filter((i): i is string => typeof i === "string")
    : data.images;

  if (!title) {
    return c.json({ error: "El título es obligatorio" }, 400);
  }

  const mentions = parseMentions(content);
  const now = Timestamp.now();

  await docRef.update({
    title,
    content,
    tags,
    images,
    mentions,
    updatedAt: now,
  });

  return c.json({
    post: {
      id,
      title,
      content,
      authorId: data.authorId,
      authorName: data.authorName,
      authorMention: data.authorMention,
      tags,
      images,
      mentions,
      isHidden: data.isHidden,
      type: found.type,
      createdAt: toTimestamp(data.createdAt),
      updatedAt: now.toMillis(),
    },
  });
});

blogRouter.delete("/:id", async (c) => {
  const user = await getSessionUser(c);
  if (!user?.id) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const id = c.req.param("id");
  const db = getFirestore();
  const found = await findPostDocById(db, id);

  if (!found) {
    return c.json({ error: "Post no encontrado" }, 404);
  }

  const docRef = found.ref;
  const doc = found.doc;
  const data = doc.data() as BlogPost;
  if (data.authorId !== user.id && user.role !== "admin") {
    return c.json({ error: "No autorizado para eliminar este post" }, 403);
  }

  await docRef.delete();
  return c.json({ ok: true });
});

blogRouter.patch("/:id/hide", async (c) => {
  const user = await getSessionUser(c);
  if (!user?.id) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  if (user.role !== "admin") {
    return c.json({ error: "Solo administradores pueden ocultar posts" }, 403);
  }

  const id = c.req.param("id");
  const db = getFirestore();
  const found = await findPostDocById(db, id);

  if (!found) {
    return c.json({ error: "Post no encontrado" }, 404);
  }

  const docRef = found.ref;
  let body: { hidden?: boolean };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Cuerpo inválido" }, 400);
  }

  const hidden = typeof body.hidden === "boolean" ? body.hidden : true;
  await docRef.update({ isHidden: hidden, updatedAt: Timestamp.now() });

  return c.json({ ok: true, isHidden: hidden });
});

const ALLOWED_IMAGE_TYPES = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/gif",
  "image/webp",
]);

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

function getStorageBucket() {
  const app = admin.app(FIREBASE_APP_NAME);
  return app.storage().bucket(STORAGE_BUCKET);
}

blogRouter.post("/upload", async (c) => {
  const user = await getSessionUser(c);
  if (!user?.id) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const contentType = c.req.header("content-type") ?? "";
  if (!contentType.includes("multipart/form-data")) {
    return c.json({ error: "Se requiere multipart/form-data" }, 400);
  }

  let formData: FormData;
  try {
    formData = await c.req.formData();
  } catch {
    return c.json({ error: "Error al procesar el formulario" }, 400);
  }

  const file = formData.get("file") as File | null;
  if (!file) {
    return c.json({ error: "No se recibió ningún archivo" }, 400);
  }

  if (file.size > MAX_FILE_SIZE) {
    return c.json({ error: "El archivo supera el tamaño máximo de 10MB" }, 400);
  }

  const mimeType = file.type;
  if (!ALLOWED_IMAGE_TYPES.has(mimeType)) {
    return c.json(
      {
        error: "Tipo de archivo no permitido. Permitidos: JPG, PNG, GIF, WEBP",
      },
      400,
    );
  }

  const ext = file.name.includes(".") ? file.name.split(".").pop() : "bin";
  const timestamp = Date.now();
  const safeName = `${timestamp}-${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
  const storagePath = `blog/images/${safeName}`;

  try {
    const bucket = getStorageBucket();
    const fileRef = bucket.file(storagePath);
    const buffer = Buffer.from(await file.arrayBuffer());

    await fileRef.save(buffer, {
      metadata: {
        contentType: mimeType,
        metadata: {
          uploadedBy: user.id,
          uploadedAt: new Date().toISOString(),
        },
      },
    });

    const [url] = await fileRef.getSignedUrl({
      action: "read",
      expires: Date.now() + 7 * 24 * 60 * 60 * 1000,
    });

    return c.json(
      {
        url,
        name: file.name,
        type: "image",
        size: file.size,
      },
      201,
    );
  } catch (error) {
    console.error("[blog upload] Error:", error);
    return c.json({ error: "Error al subir la imagen" }, 500);
  }
});

export default blogRouter;
