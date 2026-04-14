import type { Context } from "hono";
import { nanoid } from "nanoid";

import type { AgentsInfoAuthContext } from "@/types/agents";
import { getFirestore, FieldValue } from "@/lib/firestore";

const ALLOWED_PROJECTS = ["panel", "agents", "tools"] as const;
const STORAGE_BUCKET = "kai-project-26879.appspot.com";

interface ChangelogPayload {
  projectId: string;
  registerDate: string;
  implementationDate: string;
  version: string;
  author: { name: string; email: string };
  collaborators: { name: string; email: string }[];
  description: string;
  changes: {
    added?: string[];
    changed?: string[];
    fixed?: string[];
    removed?: string[];
    improved?: string[];
  };
  attachments: { name: string; url: string; type: string }[];
  ticketUrl?: string;
  createTicket: boolean;
  tags?: string[];
  status: "draft" | "published";
  internalNotes?: string;
}

/** Firestore rejects `undefined`; strip top-level optional fields before `.set()`. */
function firestoreDocData(data: Record<string, unknown>) {
  return Object.fromEntries(
    Object.entries(data).filter(([, v]) => v !== undefined),
  );
}

function isValidProject(project: string): typeof ALLOWED_PROJECTS[number] | null {
  if (ALLOWED_PROJECTS.includes(project as typeof ALLOWED_PROJECTS[number])) {
    return project as typeof ALLOWED_PROJECTS[number];
  }
  return null;
}

export async function listChangelogProjects() {
  return ALLOWED_PROJECTS;
}

export async function getChangelogEntries(
  c: Context,
  project: string,
  search?: string,
  status?: string,
) {
  const validProject = isValidProject(project);
  if (!validProject) {
    return c.json({ error: "Proyecto inválido" }, 400);
  }

  const db = getFirestore();
  let ref = db.collection("changelogs").doc(validProject).collection("entries");

  if (status && (status === "draft" || status === "published")) {
    ref = ref.where("status", "==", status) as typeof ref;
  }

  const snapshot = await ref.orderBy("registerDate", "desc").get();
  const entries = snapshot.docs.map((doc) => {
    const data = doc.data();
    return {
      id: doc.id,
      projectId: data.projectId,
      registerDate: data.registerDate,
      implementationDate: data.implementationDate,
      version: data.version,
      author: data.author,
      collaborators: data.collaborators,
      description: data.description,
      changes: data.changes,
      attachments: data.attachments,
      ticketUrl: data.ticketUrl,
      createTicket: data.createTicket,
      tags: data.tags,
      status: data.status,
      internalNotes: data.internalNotes,
      createdAt: data.createdAt,
      updatedAt: data.updatedAt,
    };
  });

  let filtered = entries;
  if (search) {
    const query = search.toLowerCase();
    filtered = entries.filter((e) => {
      const version = String(e.version || "");
      const description = String(e.description || "");
      const changes = e.changes as Record<string, string[]> | undefined;
      const allChanges = [
        ...(changes?.added || []),
        ...(changes?.changed || []),
        ...(changes?.fixed || []),
        ...(changes?.removed || []),
        ...(changes?.improved || []),
      ];
      return (
        version.toLowerCase().includes(query) ||
        description.toLowerCase().includes(query) ||
        allChanges.some((s) => s.toLowerCase().includes(query))
      );
    });
  }

  return c.json({ entries: filtered });
}

export async function getChangelogEntry(c: Context, project: string, version: string) {
  const validProject = isValidProject(project);
  if (!validProject) {
    return c.json({ error: "Proyecto inválido" }, 400);
  }

  const db = getFirestore();
  const snapshot = await db
    .collection("changelogs")
    .doc(validProject)
    .collection("entries")
    .where("version", "==", version)
    .limit(1)
    .get();

  if (snapshot.empty) {
    return c.json({ error: "Entrada no encontrada" }, 404);
  }

  const doc = snapshot.docs[0];
  return c.json({ entry: { id: doc.id, ...doc.data() } });
}

export async function postChangelogEntry(
  c: Context,
  authCtx: AgentsInfoAuthContext,
  project: string,
) {
  const validProject = isValidProject(project);
  if (!validProject) {
    return c.json({ error: "Proyecto inválido" }, 400);
  }

  const body = await c.req.json();
  if (
    typeof body.registerDate !== "string" ||
    typeof body.implementationDate !== "string" ||
    typeof body.version !== "string" ||
    typeof body.description !== "string"
  ) {
    return c.json({ error: "Campos requeridos faltantes" }, 400);
  }

  const email = authCtx.userEmail?.trim();
  if (!email) {
    return c.json(
      { error: "No se pudo determinar el autor desde la sesión" },
      400,
    );
  }
  const authorName =
    authCtx.userName?.trim() && authCtx.userName.trim().length > 0
      ? authCtx.userName.trim()
      : (email.split("@")[0] || "Usuario");
  const author = { name: authorName, email };

  const payload: ChangelogPayload = {
    projectId: validProject,
    registerDate: body.registerDate,
    implementationDate: body.implementationDate,
    version: body.version,
    author,
    collaborators: body.collaborators || [],
    description: body.description,
    changes: body.changes || {},
    attachments: body.attachments || [],
    ticketUrl: body.ticketUrl || undefined,
    createTicket: body.createTicket || false,
    tags: body.tags || undefined,
    status: body.status || "draft",
    internalNotes: body.internalNotes || undefined,
  };

  const db = getFirestore();
  const id = nanoid(12);
  const now = new Date().toISOString();

  await db
    .collection("changelogs")
    .doc(validProject)
    .collection("entries")
    .doc(id)
    .set(
      firestoreDocData({
        ...payload,
        createdAt: now,
        updatedAt: now,
      }),
    );

  return c.json({ id, ...payload }, 201);
}

export async function deleteChangelogEntry(
  c: Context,
  authCtx: AgentsInfoAuthContext,
  project: string,
  id: string,
) {
  const validProject = isValidProject(project);
  if (!validProject) {
    return c.json({ error: "Proyecto inválido" }, 400);
  }

  const db = getFirestore();
  await db
    .collection("changelogs")
    .doc(validProject)
    .collection("entries")
    .doc(id)
    .delete();

  return c.json({ ok: true });
}

export async function postChangelogUpload(
  c: Context,
  authCtx: AgentsInfoAuthContext,
  project: string,
) {
  const validProject = isValidProject(project);
  if (!validProject) {
    return c.json({ error: "Proyecto inválido" }, 400);
  }

  const contentType = c.req.header("content-type") || "";
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

  const allowedTypes = new Set([
    "image/jpeg",
    "image/png",
    "image/gif",
    "image/webp",
    "application/pdf",
    "video/mp4",
    "video/webm",
  ]);
  const maxSize = 10 * 1024 * 1024; // 10MB

  if (!allowedTypes.has(file.type)) {
    return c.json({ error: "Tipo de archivo no permitido" }, 400);
  }
  if (file.size > maxSize) {
    return c.json({ error: "El archivo supera el tamaño máximo de 10MB" }, 400);
  }

  let type: "image" | "video" | "document" = "document";
  if (file.type.startsWith("image/")) type = "image";
  else if (file.type.startsWith("video/")) type = "video";

  const ext = file.name.includes(".") ? file.name.split(".").pop() : "bin";
  const timestamp = Date.now();
  const safeName = `${timestamp}-${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
  const storagePath = `changelogs/${validProject}/${safeName}`;

  try {
    const admin = await import("firebase-admin");
    const app = admin.app();
    const bucket = app.storage().bucket(STORAGE_BUCKET);
    const fileRef = bucket.file(storagePath);

    const buffer = Buffer.from(await file.arrayBuffer());
    await fileRef.save(buffer, {
      metadata: {
        contentType: file.type,
        metadata: {
          uploadedBy: authCtx.userEmail ?? "unknown",
          uploadedAt: new Date().toISOString(),
        },
      },
    });

    const [url] = await fileRef.getSignedUrl({
      action: "read",
      expires: Date.now() + 7 * 24 * 60 * 60 * 1000, // 7 días
    });

    return c.json(
      {
        file: {
          name: file.name,
          url,
          type,
          uploadedAt: new Date().toISOString(),
        },
      },
      201,
    );
  } catch (error) {
    console.error("[changelog upload] error:", error);
    return c.json({ error: "Error al subir el archivo" }, 500);
  }
}