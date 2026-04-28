import type { DocumentSnapshot } from "firebase-admin/firestore";

import type { AgentBilling } from "@/types/agents-types";

export type ParsedPaymentRecord = {
  id: string;
  amount: number;
  period: string;
  paymentMethod: string;
  reference?: string;
  notes?: string;
  receiptUrl?: string;
  paidAt: string;
  markedBy: string;
  createdAt: string;
};

export function parseBillingDoc(doc: DocumentSnapshot | null): AgentBilling {
  if (!doc || !doc.exists) {
    return {
      domiciliated: null,
      defaultPaymentAmount: undefined,
      lastPaymentDate: null,
      paymentDueDate: null,
      paymentAlert: false,
    };
  }

  const data = doc.data() ?? {};
  const domRaw = data.domiciliated;
  const domiciliated: boolean | null =
    domRaw === true ? true : domRaw === false ? false : null;
  const defaultPaymentAmount =
    typeof data.defaultPaymentAmount === "number"
      ? data.defaultPaymentAmount
      : undefined;

  const lastPaymentDateRaw = data.lastPaymentDate;
  const lastPaymentDate =
    lastPaymentDateRaw?.toDate?.()?.toISOString() ?? null;

  const paymentDueDateRaw = data.paymentDueDate;
  const paymentDueDate =
    paymentDueDateRaw?.toDate?.()?.toISOString() ?? null;

  // Alerta solo si explícitamente no domiciliado y fecha vencida
  const paymentDueDateObj = paymentDueDateRaw?.toDate?.();
  const now = new Date();
  const paymentAlert =
    domiciliated === false &&
    paymentDueDateObj instanceof Date &&
    !isNaN(paymentDueDateObj.getTime()) &&
    paymentDueDateObj < now;

  return {
    domiciliated,
    defaultPaymentAmount,
    lastPaymentDate,
    paymentDueDate,
    paymentAlert,
  };
}

export function parsePaymentRecordDoc(
  doc: DocumentSnapshot,
): ParsedPaymentRecord {
  const data = doc.data() ?? {};
  const paidAtRaw = data.paidAt;
  const createdAtRaw = data.createdAt;

  return {
    id: doc.id,
    amount: typeof data.amount === "number" ? data.amount : 0,
    period: typeof data.period === "string" ? data.period : "",
    paymentMethod:
      typeof data.paymentMethod === "string" ? data.paymentMethod : "",
    reference: typeof data.reference === "string" ? data.reference : undefined,
    notes: typeof data.notes === "string" ? data.notes : undefined,
    receiptUrl:
      typeof data.receiptUrl === "string" ? data.receiptUrl : undefined,
    paidAt: paidAtRaw?.toDate?.()?.toISOString() ?? new Date().toISOString(),
    markedBy: typeof data.markedBy === "string" ? data.markedBy : "",
    createdAt:
      createdAtRaw?.toDate?.()?.toISOString() ?? new Date().toISOString(),
  };
}
