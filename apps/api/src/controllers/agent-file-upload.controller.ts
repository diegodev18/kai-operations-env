import type { Context } from "hono";
import admin from "firebase-admin";

import type { AgentsInfoAuthContext } from "@/types/agents";
import { resolveAgentWriteDatabase, userCanAccessAgent } from "@/utils/agents";
import { FIREBASE_APP_NAME } from "@/config";

const STORAGE_BUCKET = "kai-project-26879.appspot.com";

const ALLOWED_IMAGE_TYPES = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/gif",
  "image/webp",
]);

const ALLOWED_DOCUMENT_TYPES = new Set([
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
]);

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

function isImage(mimeType: string): boolean {
  return ALLOWED_IMAGE_TYPES.has(mimeType);
}

function isDocument(mimeType: string): boolean {
  return ALLOWED_DOCUMENT_TYPES.has(mimeType);
}

function getStorageBucket() {
  const app = admin.app(FIREBASE_APP_NAME);
  return app.storage().bucket(STORAGE_BUCKET);
}

async function requireAgentAccess(
  c: Context,
  authCtx: AgentsInfoAuthContext,
  agentId: string,
): Promise<Response | null> {
  try {
    const ok = await userCanAccessAgent(authCtx, agentId);
    if (!ok) {
      return c.json({ error: "No autorizado para este agente" }, 403);
    }
    return null;
  } catch {
    return c.json({ error: "Error al verificar acceso al agente" }, 500);
  }
}

export async function uploadAgentFile(
  c: Context,
  authCtx: AgentsInfoAuthContext,
  agentId: string,
) {
  const denied = await requireAgentAccess(c, authCtx, agentId);
  if (denied) return denied;

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

  const taskId = formData.get("taskId") as string | null;
  if (!taskId) {
    return c.json({ error: "taskId es obligatorio" }, 400);
  }

  if (file.size > MAX_FILE_SIZE) {
    return c.json({ error: "El archivo supera el tamaño máximo de 10MB" }, 400);
  }

  const mimeType = file.type;
  const isImageType = isImage(mimeType);
  const isDocumentType = isDocument(mimeType);

  if (!isImageType && !isDocumentType) {
    return c.json(
      {
        error:
          "Tipo de archivo no permitido. Permitidos: PDF, DOC, DOCX, JPG, PNG, GIF, WEBP",
      },
      400,
    );
  }

  const folderType = isImageType ? "images" : "documents";
  const ext = file.name.includes(".") ? file.name.split(".").pop() : "bin";
  const timestamp = Date.now();
  const safeName = `${timestamp}-${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
  const storagePath = `kaiAgents/${agentId}/${folderType}/tasks/${taskId}/${safeName}`;

  try {
    const bucket = getStorageBucket();
    const fileRef = bucket.file(storagePath);

    const buffer = Buffer.from(await file.arrayBuffer());

    await fileRef.save(buffer, {
      metadata: {
        contentType: mimeType,
        metadata: {
          agentId,
          taskId,
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
          uploadedAt: new Date().toISOString(),
          type: folderType,
          size: file.size,
        },
      },
      201,
    );
  } catch (error) {
    console.error("[file upload] Error:", error);
    return c.json({ error: "Error al subir el archivo" }, 500);
  }
}
