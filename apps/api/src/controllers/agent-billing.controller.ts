import type { Context } from "hono";
import { FieldValue } from "firebase-admin/firestore";
import { z } from "zod";

import { getFirestore } from "@/lib/firestore";
import type { AgentsInfoAuthContext } from "@/types/agents";
import { isOperationsAdmin, isOperationsCommercial } from "@/utils/operations-access";
import { parseBillingDoc, parsePaymentRecordDoc } from "@/utils/agents";

function serverTimestampField() {
  return FieldValue.serverTimestamp();
}

const patchBillingConfigSchema = z.object({
  domiciliated: z.boolean().optional(),
  defaultPaymentAmount: z.number().min(0).optional(),
  paymentDueDate: z.string().nullable().optional(),
});

const createPaymentSchema = z.object({
  amount: z.number().min(0),
  period: z.string().trim().min(1),
  paymentMethod: z.string().trim().min(1),
  reference: z.string().trim().optional(),
  notes: z.string().trim().optional(),
  receiptUrl: z.string().trim().optional(),
});

export async function getAgentBilling(
  c: Context,
  authCtx: AgentsInfoAuthContext,
  agentId: string,
) {
  if (!isOperationsAdmin(authCtx.userRole) && !isOperationsCommercial(authCtx.userRole)) {
    return c.json({ error: "No autorizado" }, 403);
  }

  const db = getFirestore();
  const billingRef = db
    .collection("agent_configurations")
    .doc(agentId)
    .collection("billing")
    .doc("main");

  const [billingSnap, paymentsSnap] = await Promise.all([
    billingRef.get(),
    billingRef.collection("payments").orderBy("paidAt", "desc").get(),
  ]);

  const billing = parseBillingDoc(billingSnap);
  const payments = paymentsSnap.docs.map(parsePaymentRecordDoc);

  return c.json({ billing, payments });
}

export async function patchAgentBillingConfig(
  c: Context,
  authCtx: AgentsInfoAuthContext,
  agentId: string,
) {
  if (!isOperationsAdmin(authCtx.userRole) && !isOperationsCommercial(authCtx.userRole)) {
    return c.json({ error: "No autorizado" }, 403);
  }

  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Body inválido" }, 400);
  }

  const parsed = patchBillingConfigSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: parsed.error.issues[0]?.message ?? "Datos inválidos" }, 400);
  }

  const db = getFirestore();
  const billingRef = db
    .collection("agent_configurations")
    .doc(agentId)
    .collection("billing")
    .doc("main");

  const snap = await billingRef.get();
  const existing = snap.exists ? snap.data() ?? {} : {};

  const updates: Record<string, unknown> = {};
  if (parsed.data.domiciliated !== undefined) {
    updates.domiciliated = parsed.data.domiciliated;
  }
  if (parsed.data.defaultPaymentAmount !== undefined) {
    updates.defaultPaymentAmount = parsed.data.defaultPaymentAmount;
  }
  if (parsed.data.paymentDueDate !== undefined) {
    if (parsed.data.paymentDueDate === null) {
      updates.paymentDueDate = null;
    } else {
      const dueDate = new Date(parsed.data.paymentDueDate);
      if (isNaN(dueDate.getTime())) {
        return c.json({ error: "Fecha de pago inválida" }, 400);
      }
      updates.paymentDueDate = dueDate;
    }
  }

  if (Object.keys(updates).length === 0) {
    return c.json({ error: "No hay cambios para aplicar" }, 400);
  }

  const ts = serverTimestampField();
  await billingRef.set(
    { ...existing, ...updates, updated_at: ts },
    { merge: true },
  );

  return c.json({ ok: true });
}

export async function createPaymentRecord(
  c: Context,
  authCtx: AgentsInfoAuthContext,
  agentId: string,
) {
  if (!isOperationsAdmin(authCtx.userRole) && !isOperationsCommercial(authCtx.userRole)) {
    return c.json({ error: "No autorizado" }, 403);
  }

  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Body inválido" }, 400);
  }

  const parsed = createPaymentSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: parsed.error.issues[0]?.message ?? "Datos inválidos" }, 400);
  }

  const db = getFirestore();
  const billingRef = db
    .collection("agent_configurations")
    .doc(agentId)
    .collection("billing")
    .doc("main");

  const userEmail = authCtx.userEmail ?? "unknown";

  const now = new Date();
  const paymentData = {
    amount: parsed.data.amount,
    period: parsed.data.period,
    paymentMethod: parsed.data.paymentMethod,
    reference: parsed.data.reference ?? null,
    notes: parsed.data.notes ?? null,
    receiptUrl: parsed.data.receiptUrl ?? null,
    paidAt: now,
    markedBy: userEmail,
    createdAt: serverTimestampField(),
  };

  const paymentDocRef = await billingRef.collection("payments").add(paymentData);

  await billingRef.set(
    {
      lastPaymentDate: now,
      lastMarkedBy: userEmail,
      lastMarkedAt: serverTimestampField(),
    },
    { merge: true },
  );

  return c.json({ ok: true, paymentId: paymentDocRef.id });
}

export async function deletePaymentRecord(
  c: Context,
  authCtx: AgentsInfoAuthContext,
  agentId: string,
  paymentId: string,
) {
  if (!isOperationsAdmin(authCtx.userRole) && !isOperationsCommercial(authCtx.userRole)) {
    return c.json({ error: "No autorizado" }, 403);
  }

  if (!paymentId) {
    return c.json({ error: "ID de pago requerido" }, 400);
  }

  const db = getFirestore();
  const paymentRef = db
    .collection("agent_configurations")
    .doc(agentId)
    .collection("billing")
    .doc("main")
    .collection("payments")
    .doc(paymentId);

  const snap = await paymentRef.get();
  if (!snap.exists) {
    return c.json({ error: "Pago no encontrado" }, 404);
  }

  await paymentRef.delete();

  return c.json({ ok: true });
}
