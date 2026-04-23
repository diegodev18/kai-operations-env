import type { Context } from "hono";
import { nanoid } from "nanoid";

import type { AgentsInfoAuthContext } from "@/types/agents-types";
import type { ChangelogPayload } from "@/types/changelog-types";
import { getFirestore, FieldValue } from "@/lib/firestore";
import { isOperationsAdmin } from "@/utils/operations-access";
import { compareChangelogEntriesVersionThenRegisterDateDesc } from "@/utils/semver-compare";

const ALLOWED_PROJECTS = ["panel", "agents", "tools"] as const;
const STORAGE_BUCKET = "kai-project-26879.appspot.com";

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

function isChangelogCreator(
  data: Record<string, unknown>,
  authCtx: AgentsInfoAuthContext,
): boolean {
  const uid = authCtx.userId?.trim();
  const storedUid = typeof data.createdByUserId === "string" ? data.createdByUserId.trim() : "";
  if (uid && storedUid && uid === storedUid) return true;
  const email = authCtx.userEmail?.trim().toLowerCase();
  const author = data.author as { email?: string } | undefined;
  const authorEmail = author?.email?.trim().toLowerCase();
  if (email && authorEmail && email === authorEmail) return true;
  return false;
}

function mapEntryDoc(id: string, data: Record<string, unknown>) {
  return {
    id,
    projectId: data.projectId,
    registerDate: data.registerDate,
    implementationDate: data.implementationDate,
    version: data.version,
    author: data.author,
    collaborators: data.collaborators ?? [],
    description: data.description,
    changes: data.changes ?? {},
    attachments: data.attachments ?? [],
    ticketUrl: data.ticketUrl,
    createTicket: data.createTicket,
    tags: data.tags,
    status: data.status,
    internalNotes: data.internalNotes,
    createdAt: data.createdAt,
    updatedAt: data.updatedAt,
    createdByUserId: data.createdByUserId,
    hidden: Boolean(data.hidden),
    hiddenAt: data.hiddenAt,
    hiddenByUserId: data.hiddenByUserId,
  };
}

export async function listChangelogProjects() {
  return ALLOWED_PROJECTS;
}

export async function getChangelogEntries(
  c: Context,
  authCtx: AgentsInfoAuthContext,
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

  const snapshot = await ref.get();
  const admin = isOperationsAdmin(authCtx.userRole);
  let entries = snapshot.docs.map((doc) => {
    const data = doc.data() as Record<string, unknown>;
    return mapEntryDoc(doc.id, data);
  });

  if (!admin) {
    entries = entries.filter((e) => !e.hidden);
  }

  entries.sort(compareChangelogEntriesVersionThenRegisterDateDesc);

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

export async function getChangelogEntry(
  c: Context,
  authCtx: AgentsInfoAuthContext,
  project: string,
  version: string,
) {
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
  const data = doc.data() as Record<string, unknown>;
  if (data.hidden && !isOperationsAdmin(authCtx.userRole)) {
    return c.json({ error: "Entrada no encontrada" }, 404);
  }

  return c.json({ entry: mapEntryDoc(doc.id, data) });
}

export async function getChangelogEntryById(
  c: Context,
  authCtx: AgentsInfoAuthContext,
  project: string,
  entryId: string,
) {
  const validProject = isValidProject(project);
  if (!validProject) {
    return c.json({ error: "Proyecto inválido" }, 400);
  }

  const db = getFirestore();
  const ref = db
    .collection("changelogs")
    .doc(validProject)
    .collection("entries")
    .doc(entryId);
  const snap = await ref.get();
  if (!snap.exists) {
    return c.json({ error: "Entrada no encontrada" }, 404);
  }
  const data = snap.data() as Record<string, unknown>;
  if (data.hidden && !isOperationsAdmin(authCtx.userRole)) {
    return c.json({ error: "Entrada no encontrada" }, 404);
  }

  return c.json({ entry: mapEntryDoc(snap.id, data) });
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
        createdByUserId: authCtx.userId?.trim() || undefined,
        hidden: false,
        createdAt: now,
        updatedAt: now,
      }),
    );

  return c.json({ id, ...payload, createdByUserId: authCtx.userId?.trim() || undefined, hidden: false }, 201);
}

export async function patchChangelogEntry(
  c: Context,
  authCtx: AgentsInfoAuthContext,
  project: string,
  entryId: string,
) {
  const validProject = isValidProject(project);
  if (!validProject) {
    return c.json({ error: "Proyecto inválido" }, 400);
  }

  const db = getFirestore();
  const ref = db
    .collection("changelogs")
    .doc(validProject)
    .collection("entries")
    .doc(entryId);
  const snap = await ref.get();
  if (!snap.exists) {
    return c.json({ error: "Entrada no encontrada" }, 404);
  }

  const existing = snap.data() as Record<string, unknown>;
  const body = (await c.req.json()) as Record<string, unknown>;
  const admin = isOperationsAdmin(authCtx.userRole);
  const now = new Date().toISOString();

  if (typeof body.hidden === "boolean") {
    if (!admin) {
      return c.json(
        { error: "Solo administradores pueden ocultar o mostrar entradas" },
        403,
      );
    }
    await ref.update({
      hidden: body.hidden,
      hiddenAt: body.hidden ? now : FieldValue.delete(),
      hiddenByUserId: body.hidden ? (authCtx.userId ?? null) : FieldValue.delete(),
      updatedAt: now,
    });
  }

  const ALLOW_PATCH_FIELDS = new Set([
    "registerDate",
    "implementationDate",
    "version",
    "description",
    "collaborators",
    "changes",
    "attachments",
    "ticketUrl",
    "createTicket",
    "tags",
    "status",
    "internalNotes",
  ]);
  const contentKeys = Object.keys(body).filter(
    (k) => k !== "hidden" && ALLOW_PATCH_FIELDS.has(k),
  );
  if (contentKeys.length > 0) {
    if (!isChangelogCreator(existing, authCtx)) {
      return c.json(
        { error: "Solo el creador puede editar el contenido de esta entrada" },
        403,
      );
    }

    const updates: Record<string, unknown> = { updatedAt: now };

    if (typeof body.registerDate === "string") {
      updates.registerDate = body.registerDate;
    }
    if (typeof body.implementationDate === "string") {
      updates.implementationDate = body.implementationDate;
    }
    if (typeof body.version === "string") {
      updates.version = body.version;
    }
    if (typeof body.description === "string") {
      updates.description = body.description;
    }
    if (Array.isArray(body.collaborators)) {
      updates.collaborators = body.collaborators;
    }
    if (body.changes !== undefined && typeof body.changes === "object") {
      updates.changes = body.changes;
    }
    if (Array.isArray(body.attachments)) {
      updates.attachments = body.attachments;
    }
    if ("ticketUrl" in body) {
      if (
        body.ticketUrl === null ||
        (typeof body.ticketUrl === "string" && body.ticketUrl.trim() === "")
      ) {
        updates.ticketUrl = FieldValue.delete();
      } else if (typeof body.ticketUrl === "string") {
        updates.ticketUrl = body.ticketUrl;
      }
    }
    if (typeof body.createTicket === "boolean") {
      updates.createTicket = body.createTicket;
    }
    if ("tags" in body) {
      if (body.tags === null || (Array.isArray(body.tags) && body.tags.length === 0)) {
        updates.tags = FieldValue.delete();
      } else if (Array.isArray(body.tags)) {
        updates.tags = body.tags;
      }
    }
    if (body.status === "draft" || body.status === "published") {
      updates.status = body.status;
    }
    if ("internalNotes" in body) {
      if (
        body.internalNotes === null ||
        (typeof body.internalNotes === "string" &&
          body.internalNotes.trim() === "")
      ) {
        updates.internalNotes = FieldValue.delete();
      } else if (typeof body.internalNotes === "string") {
        updates.internalNotes = body.internalNotes;
      }
    }

    const cleaned = firestoreDocData(updates);
    const substantiveKeys = Object.keys(cleaned).filter((k) => k !== "updatedAt");
    if (substantiveKeys.length > 0) {
      await ref.update(cleaned as never);
    }
  }

  const freshSnap = await ref.get();
  const freshData = freshSnap.data() as Record<string, unknown>;
  return c.json({ entry: mapEntryDoc(freshSnap.id, freshData) });
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
  const ref = db
    .collection("changelogs")
    .doc(validProject)
    .collection("entries")
    .doc(id);
  const snap = await ref.get();
  if (!snap.exists) {
    return c.json({ error: "Entrada no encontrada" }, 404);
  }
  const data = snap.data() as Record<string, unknown>;
  const admin = isOperationsAdmin(authCtx.userRole);
  if (!isChangelogCreator(data, authCtx) && !admin) {
    return c.json({ error: "No autorizado" }, 403);
  }

  await ref.delete();

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