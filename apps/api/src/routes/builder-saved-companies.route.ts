import type { Context } from "hono";
import { Hono } from "hono";
import { z } from "zod";
import { eq } from "drizzle-orm";

import { BUILDER_COMPANIES_COLLECTION } from "@/constants/builder-companies";
import { serverTimestampField } from "@/constants/agentPropertyDefaults";
import { db } from "@/db/client";
import { user as userTable } from "@/db/schema/auth";
import { getFirestore, Timestamp } from "@/lib/firestore";
import { auth } from "@/lib/auth";
import { resolveSessionUserRole } from "@/utils/sessionUser";
import {
  extractFirestoreIndexUrl,
  firestoreFailureHint,
  isFirebaseConfigError,
} from "@/utils/firestore/errors";
import { nanoid } from "nanoid";

const builderCompanyPayloadSchema = z.object({
  businessName: z.string().trim().min(1),
  industry: z.string().trim().min(1),
  customIndustry: z.string().trim().optional(),
  description: z.string().trim().min(1),
  targetAudience: z.string().trim().min(1),
  agentDescription: z.string().trim().min(1),
  escalationRules: z.string().trim().min(1),
  country: z.string().trim().min(1),
  businessTimezone: z.string().trim().optional(),
  brandValues: z.array(z.string().trim()).optional(),
  policies: z.string().trim().optional(),
});

const postBodySchema = z.object({
  name: z.string().trim().optional(),
  payload: builderCompanyPayloadSchema,
});

const router = new Hono();

async function getSessionUser(c: Context) {
  const session = await auth.api.getSession({ headers: c.req.raw.headers });
  if (!session?.user) return null;
  const u = session.user as {
    id?: string;
    role?: string | null;
    email?: string | null;
    name?: string | null;
  };
  const role = await resolveSessionUserRole(u);
  return { ...u, role };
}

/** ID del doc en `usersBuilders`: mismo valor que `phoneNumber` / doc id al crear (ver agent-drafts POST). */
async function resolveUsersBuildersId(
  userId: string,
): Promise<
  | { ok: true; usersBuildersId: string }
  | { ok: false; status: 400; error: string }
> {
  const rows = await db
    .select({ phone: userTable.phone })
    .from(userTable)
    .where(eq(userTable.id, userId))
    .limit(1);

  const phone = rows[0]?.phone?.trim();
  if (!phone) {
    return {
      ok: false,
      status: 400,
      error:
        "Tu cuenta necesita un número de teléfono configurado para guardar empresas (mismo criterio que crear un agente).",
    };
  }

  return { ok: true, usersBuildersId: phone };
}

function firestoreJsonError(c: Context, error: unknown, logPrefix: string) {
  if (isFirebaseConfigError(error)) {
    return c.json(
      {
        error:
          "Firebase no configurado. Define credenciales de servicio (env o tokens).",
      },
      503,
    );
  }
  const hint = firestoreFailureHint(error);
  const msg = error instanceof Error ? error.message : String(error);
  const createIndexUrl = extractFirestoreIndexUrl(msg);
  console.error(`${logPrefix} Firestore:`, msg);
  if (hint) {
    return c.json(
      { error: hint, ...(createIndexUrl ? { createIndexUrl } : {}) },
      503,
    );
  }
  return c.json({ error: "Error al acceder a Firestore." }, 500);
}

function timestampToIso(value: unknown): string | null {
  if (value instanceof Timestamp) {
    return value.toDate().toISOString();
  }
  if (
    value != null &&
    typeof value === "object" &&
    "toDate" in value &&
    typeof (value as { toDate?: () => Date }).toDate === "function"
  ) {
    return (value as { toDate: () => Date }).toDate().toISOString();
  }
  return null;
}

router.get("/", async (c) => {
  const sessionUser = await getSessionUser(c);
  if (!sessionUser?.id) {
    return c.json({ error: "No autorizado" }, 401);
  }

  const resolved = await resolveUsersBuildersId(sessionUser.id);
  if (!resolved.ok) {
    return c.json({ error: resolved.error }, 400);
  }

  try {
    const fs = getFirestore();
    const snap = await fs
      .collection(BUILDER_COMPANIES_COLLECTION)
      .where("usersBuildersId", "==", resolved.usersBuildersId)
      .get();

    const items = snap.docs.map((doc) => {
      const d = doc.data() as Record<string, unknown>;
      return {
        id: doc.id,
        name: typeof d.name === "string" ? d.name : "",
        payload: d.payload ?? {},
        createdAt: timestampToIso(d.createdAt),
        updatedAt: timestampToIso(d.updatedAt),
      };
    });

    items.sort((a, b) => {
      const ta = a.createdAt ?? "";
      const tb = b.createdAt ?? "";
      return tb.localeCompare(ta);
    });

    return c.json({ companies: items });
  } catch (error) {
    const r = firestoreJsonError(c, error, "[builder/saved-companies GET]");
    return r ?? c.json({ error: "Error al listar empresas." }, 500);
  }
});

router.post("/", async (c) => {
  const sessionUser = await getSessionUser(c);
  if (!sessionUser?.id) {
    return c.json({ error: "No autorizado" }, 401);
  }

  const resolved = await resolveUsersBuildersId(sessionUser.id);
  if (!resolved.ok) {
    return c.json({ error: resolved.error }, 400);
  }

  let raw: unknown;
  try {
    raw = await c.req.json();
  } catch {
    return c.json({ error: "JSON inválido" }, 400);
  }

  const parsed = postBodySchema.safeParse(raw);
  if (!parsed.success) {
    const msg = parsed.error.issues
      .map((i) => i.path.join(".") + ": " + i.message)
      .join("; ");
    return c.json({ error: msg }, 400);
  }

  const { payload } = parsed.data;
  const name =
    parsed.data.name && parsed.data.name.length > 0
      ? parsed.data.name
      : payload.businessName;

  try {
    const fs = getFirestore();
    const ts = serverTimestampField();
    const id = nanoid();
    const ref = fs.collection(BUILDER_COMPANIES_COLLECTION).doc(id);

    await ref.set({
      usersBuildersId: resolved.usersBuildersId,
      name,
      payload,
      createdAt: ts,
      updatedAt: ts,
    });

    return c.json({
      ok: true,
      id,
      name,
      payload,
    });
  } catch (error) {
    const r = firestoreJsonError(c, error, "[builder/saved-companies POST]");
    return r ?? c.json({ error: "Error al guardar empresa." }, 500);
  }
});

router.patch("/:id", async (c) => {
  const sessionUser = await getSessionUser(c);
  if (!sessionUser?.id) {
    return c.json({ error: "No autorizado" }, 401);
  }

  const resolved = await resolveUsersBuildersId(sessionUser.id);
  if (!resolved.ok) {
    return c.json({ error: resolved.error }, 400);
  }

  const docId = c.req.param("id")?.trim();
  if (!docId) {
    return c.json({ error: "ID inválido" }, 400);
  }

  let raw: unknown;
  try {
    raw = await c.req.json();
  } catch {
    return c.json({ error: "JSON inválido" }, 400);
  }

  const parsed = postBodySchema.safeParse(raw);
  if (!parsed.success) {
    const msg = parsed.error.issues
      .map((i) => i.path.join(".") + ": " + i.message)
      .join("; ");
    return c.json({ error: msg }, 400);
  }

  const { payload } = parsed.data;
  const name =
    parsed.data.name && parsed.data.name.length > 0
      ? parsed.data.name
      : payload.businessName;

  try {
    const fs = getFirestore();
    const ref = fs.collection(BUILDER_COMPANIES_COLLECTION).doc(docId);
    const snap = await ref.get();
    if (!snap.exists) {
      return c.json({ error: "Empresa no encontrada" }, 404);
    }
    const d = snap.data() as Record<string, unknown>;
    if (d.usersBuildersId !== resolved.usersBuildersId) {
      return c.json({ error: "No autorizado" }, 403);
    }

    await ref.update({
      name,
      payload,
      updatedAt: serverTimestampField(),
    });

    return c.json({
      ok: true,
      id: docId,
      name,
      payload,
    });
  } catch (error) {
    const r = firestoreJsonError(c, error, "[builder/saved-companies PATCH]");
    return r ?? c.json({ error: "Error al actualizar empresa." }, 500);
  }
});

export default router;
