import type { Context } from "hono";
import { Hono } from "hono";
import { z } from "zod";
import { nanoid } from "nanoid";

import { getFirestore, Timestamp } from "@/lib/firestore";
import { resolveAgentsAuthContext } from "@/routes/agents-auth";
import { isOperationsAdmin, isOperationsCommercial } from "@/utils/operations-access";
import {
  extractFirestoreIndexUrl,
  firestoreFailureHint,
  isFirebaseConfigError,
} from "@/utils/firestore/errors";

const BACKOFFICE = "backOffice";
const CRM_DOC = "crm";

function companiesCol() {
  return getFirestore()
    .collection(BACKOFFICE)
    .doc(CRM_DOC)
    .collection("companies");
}

function opportunitiesCol() {
  return getFirestore()
    .collection(BACKOFFICE)
    .doc(CRM_DOC)
    .collection("opportunities");
}

const COMPANY_STATUSES = [
  "prospecto",
  "domiciliado",
  "tramites",
  "negociando",
  "perdido",
] as const;

const OPPORTUNITY_STAGES = [
  "prospecto",
  "cotizacion_enviada",
  "negociando",
  "esperando_firma",
  "construyendo",
  "activo",
  "esperando_domicilio",
  "perdido",
] as const;

const crmCompanySchema = z.object({
  name: z.string().trim().min(1),
  industry: z.string().trim().default(""),
  status: z.enum(COMPANY_STATUSES).default("prospecto"),
  mrr: z.number().optional(),
  country: z.string().trim().optional(),
  description: z.string().trim().optional(),
  targetAudience: z.string().trim().optional(),
  agentDescription: z.string().trim().optional(),
  escalationRules: z.string().trim().optional(),
  businessTimezone: z.string().trim().optional(),
  brandValues: z.array(z.string().trim()).optional(),
  policies: z.string().trim().optional(),
  ownerName: z.string().trim().optional(),
  growerName: z.string().trim().optional(),
  notes: z.string().trim().optional(),
});

const crmOpportunitySchema = z.object({
  name: z.string().trim().min(1),
  companyId: z.string().trim().min(1),
  companyName: z.string().trim().min(1),
  contactName: z.string().trim().optional(),
  contactPhone: z.string().trim().optional(),
  stage: z.enum(OPPORTUNITY_STAGES).default("prospecto"),
  mrr: z.number().optional(),
  implementerName: z.string().trim().optional(),
  featuresToImplement: z.array(z.string().trim()).optional(),
  agentId: z.string().trim().optional(),
  notes: z.string().trim().optional(),
});

function tsToIso(value: unknown): string | null {
  if (value instanceof Timestamp) return value.toDate().toISOString();
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

function firestoreErr(c: Context, error: unknown, prefix: string) {
  if (isFirebaseConfigError(error)) {
    return c.json({ error: "Firebase no configurado." }, 503);
  }
  const hint = firestoreFailureHint(error);
  const msg = error instanceof Error ? error.message : String(error);
  const createIndexUrl = extractFirestoreIndexUrl(msg);
  console.error(`${prefix} Firestore:`, msg);
  if (hint) {
    return c.json(
      { error: hint, ...(createIndexUrl ? { createIndexUrl } : {}) },
      503,
    );
  }
  return c.json({ error: "Error al acceder a Firestore." }, 500);
}

function serializeDoc(id: string, d: Record<string, unknown>) {
  return {
    id,
    ...d,
    createdAt: tsToIso(d.createdAt),
    updatedAt: tsToIso(d.updatedAt),
  };
}

async function requireCrmAccess(c: Context) {
  const result = await resolveAgentsAuthContext(c);
  if (!result.ok) return { ok: false as const, response: result.response };
  const { userRole } = result.authCtx;
  if (!isOperationsAdmin(userRole) && !isOperationsCommercial(userRole)) {
    return {
      ok: false as const,
      response: c.json({ error: "Sin permiso" }, 403),
    };
  }
  return { ok: true as const, authCtx: result.authCtx };
}

export const crmRouter = new Hono();

// ─── Companies ──────────────────────────────────────────────────────────────

crmRouter.get("/companies", async (c) => {
  const auth = await requireCrmAccess(c);
  if (!auth.ok) return auth.response;

  try {
    const snap = await companiesCol().get();
    const companies = snap.docs
      .map((doc) => serializeDoc(doc.id, doc.data() as Record<string, unknown>))
      .sort((a, b) =>
        ((b.updatedAt ?? "") as string).localeCompare(
          (a.updatedAt ?? "") as string,
        ),
      );
    return c.json({ companies });
  } catch (error) {
    return firestoreErr(c, error, "[crm/companies GET]");
  }
});

crmRouter.post("/companies", async (c) => {
  const auth = await requireCrmAccess(c);
  if (!auth.ok) return auth.response;
  const { userEmail, userId } = auth.authCtx;

  let raw: unknown;
  try {
    raw = await c.req.json();
  } catch {
    return c.json({ error: "JSON inválido" }, 400);
  }

  const parsed = crmCompanySchema.safeParse(raw);
  if (!parsed.success) {
    const msg = parsed.error.issues
      .map((i) => i.path.join(".") + ": " + i.message)
      .join("; ");
    return c.json({ error: msg }, 400);
  }

  try {
    const id = nanoid();
    const now = Timestamp.now();
    const data = {
      ...parsed.data,
      createdAt: now,
      updatedAt: now,
      createdByEmail: userEmail ?? "",
      createdByUserId: userId ?? "",
    };
    await companiesCol().doc(id).set(data);
    return c.json(serializeDoc(id, data as Record<string, unknown>), 201);
  } catch (error) {
    return firestoreErr(c, error, "[crm/companies POST]");
  }
});

crmRouter.get("/companies/:id", async (c) => {
  const auth = await requireCrmAccess(c);
  if (!auth.ok) return auth.response;

  const id = c.req.param("id").trim();
  if (!id) return c.json({ error: "ID inválido" }, 400);

  try {
    const [docSnap, opSnap] = await Promise.all([
      companiesCol().doc(id).get(),
      opportunitiesCol().where("companyId", "==", id).get(),
    ]);
    if (!docSnap.exists) return c.json({ error: "Empresa no encontrada" }, 404);
    const d = docSnap.data() as Record<string, unknown>;
    const opportunities = opSnap.docs.map((op) =>
      serializeDoc(op.id, op.data() as Record<string, unknown>),
    );
    return c.json({ ...serializeDoc(id, d), opportunities });
  } catch (error) {
    return firestoreErr(c, error, "[crm/companies/:id GET]");
  }
});

crmRouter.patch("/companies/:id", async (c) => {
  const auth = await requireCrmAccess(c);
  if (!auth.ok) return auth.response;

  const id = c.req.param("id").trim();
  if (!id) return c.json({ error: "ID inválido" }, 400);

  let raw: unknown;
  try {
    raw = await c.req.json();
  } catch {
    return c.json({ error: "JSON inválido" }, 400);
  }

  const parsed = crmCompanySchema.partial().safeParse(raw);
  if (!parsed.success) {
    const msg = parsed.error.issues
      .map((i) => i.path.join(".") + ": " + i.message)
      .join("; ");
    return c.json({ error: msg }, 400);
  }

  try {
    const ref = companiesCol().doc(id);
    const snap = await ref.get();
    if (!snap.exists) return c.json({ error: "Empresa no encontrada" }, 404);
    await ref.update({ ...parsed.data, updatedAt: Timestamp.now() });
    return c.json({ ok: true, id });
  } catch (error) {
    return firestoreErr(c, error, "[crm/companies/:id PATCH]");
  }
});

crmRouter.delete("/companies/:id", async (c) => {
  const auth = await requireCrmAccess(c);
  if (!auth.ok) return auth.response;

  const id = c.req.param("id").trim();
  if (!id) return c.json({ error: "ID inválido" }, 400);

  try {
    const ref = companiesCol().doc(id);
    const snap = await ref.get();
    if (!snap.exists) return c.json({ error: "Empresa no encontrada" }, 404);
    await ref.delete();
    return c.json({ ok: true });
  } catch (error) {
    return firestoreErr(c, error, "[crm/companies/:id DELETE]");
  }
});

// ─── Opportunities ───────────────────────────────────────────────────────────

crmRouter.get("/opportunities", async (c) => {
  const auth = await requireCrmAccess(c);
  if (!auth.ok) return auth.response;

  const companyId = c.req.query("companyId");

  try {
    const col = opportunitiesCol();
    const snap = await (companyId
      ? col.where("companyId", "==", companyId).get()
      : col.get());
    const opportunities = snap.docs
      .map((doc) => serializeDoc(doc.id, doc.data() as Record<string, unknown>))
      .sort((a, b) =>
        ((b.updatedAt ?? "") as string).localeCompare(
          (a.updatedAt ?? "") as string,
        ),
      );
    return c.json({ opportunities });
  } catch (error) {
    return firestoreErr(c, error, "[crm/opportunities GET]");
  }
});

crmRouter.post("/opportunities", async (c) => {
  const auth = await requireCrmAccess(c);
  if (!auth.ok) return auth.response;
  const { userEmail, userId } = auth.authCtx;

  let raw: unknown;
  try {
    raw = await c.req.json();
  } catch {
    return c.json({ error: "JSON inválido" }, 400);
  }

  const parsed = crmOpportunitySchema.safeParse(raw);
  if (!parsed.success) {
    const msg = parsed.error.issues
      .map((i) => i.path.join(".") + ": " + i.message)
      .join("; ");
    return c.json({ error: msg }, 400);
  }

  try {
    const id = nanoid();
    const now = Timestamp.now();
    const data = {
      ...parsed.data,
      createdAt: now,
      updatedAt: now,
      createdByEmail: userEmail ?? "",
      createdByUserId: userId ?? "",
    };
    await opportunitiesCol().doc(id).set(data);
    return c.json(serializeDoc(id, data as Record<string, unknown>), 201);
  } catch (error) {
    return firestoreErr(c, error, "[crm/opportunities POST]");
  }
});

crmRouter.get("/opportunities/:id", async (c) => {
  const auth = await requireCrmAccess(c);
  if (!auth.ok) return auth.response;

  const id = c.req.param("id").trim();
  if (!id) return c.json({ error: "ID inválido" }, 400);

  try {
    const snap = await opportunitiesCol().doc(id).get();
    if (!snap.exists) {
      return c.json({ error: "Oportunidad no encontrada" }, 404);
    }
    return c.json(
      serializeDoc(id, snap.data() as Record<string, unknown>),
    );
  } catch (error) {
    return firestoreErr(c, error, "[crm/opportunities/:id GET]");
  }
});

crmRouter.patch("/opportunities/:id", async (c) => {
  const auth = await requireCrmAccess(c);
  if (!auth.ok) return auth.response;

  const id = c.req.param("id").trim();
  if (!id) return c.json({ error: "ID inválido" }, 400);

  let raw: unknown;
  try {
    raw = await c.req.json();
  } catch {
    return c.json({ error: "JSON inválido" }, 400);
  }

  const parsed = crmOpportunitySchema.partial().safeParse(raw);
  if (!parsed.success) {
    const msg = parsed.error.issues
      .map((i) => i.path.join(".") + ": " + i.message)
      .join("; ");
    return c.json({ error: msg }, 400);
  }

  try {
    const ref = opportunitiesCol().doc(id);
    const snap = await ref.get();
    if (!snap.exists) {
      return c.json({ error: "Oportunidad no encontrada" }, 404);
    }
    await ref.update({ ...parsed.data, updatedAt: Timestamp.now() });
    return c.json({ ok: true, id });
  } catch (error) {
    return firestoreErr(c, error, "[crm/opportunities/:id PATCH]");
  }
});

crmRouter.delete("/opportunities/:id", async (c) => {
  const auth = await requireCrmAccess(c);
  if (!auth.ok) return auth.response;

  const id = c.req.param("id").trim();
  if (!id) return c.json({ error: "ID inválido" }, 400);

  try {
    const ref = opportunitiesCol().doc(id);
    const snap = await ref.get();
    if (!snap.exists) {
      return c.json({ error: "Oportunidad no encontrada" }, 404);
    }
    await ref.delete();
    return c.json({ ok: true });
  } catch (error) {
    return firestoreErr(c, error, "[crm/opportunities/:id DELETE]");
  }
});
