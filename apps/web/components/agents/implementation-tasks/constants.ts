import {
  PhoneIcon,
  FileTextIcon,
  CreditCardIcon,
  SendIcon,
  UserCircleIcon,
} from "lucide-react";
import type { AgentBilling } from "@/lib/agents/agent";
import type { AgentGrowerRow } from "@/types";

export const MANDATORY_TASK_TYPES = new Set([
  "connect-number",
  "csf-request",
  "payment-domiciliation",
  "quote-sent",
  "representative-contact",
]);

export const TASK_TYPES_WITH_ATTACHMENTS = new Set(["quote-sent", "csf-request"]);

export const TASK_TYPE_CONFIG: Record<
  string,
  {
    icon: React.ElementType;
    badge?: string;
    badgeVariant?: "default" | "secondary" | "outline";
    label?: string;
  }
> = {
  "connect-number": { icon: PhoneIcon, label: "Conectar número" },
  "csf-request": {
    icon: FileTextIcon,
    badge: "CSF",
    badgeVariant: "default",
    label: "Constancia de Situación Fiscal",
  },
  "payment-domiciliation": {
    icon: CreditCardIcon,
    badge: "Cobranza",
    badgeVariant: "secondary",
    label: "Domiciliación de cobro",
  },
  "quote-sent": {
    icon: SendIcon,
    badge: "Cotización",
    badgeVariant: "outline",
    label: "Cotización enviada",
  },
  "representative-contact": {
    icon: UserCircleIcon,
    badge: "Contacto",
    badgeVariant: "outline",
    label: "Contacto representante",
  },
};

export function toDateInputValue(value?: string | null): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString().slice(0, 10);
}

export function toIsoFromDateInput(value: string): string | null {
  const v = value.trim();
  if (!v) return null;
  const date = new Date(`${v}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

export function formatDate(iso?: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("es-MX", { dateStyle: "medium" });
}

export function formatDateTime(iso?: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("es-MX", { dateStyle: "short", timeStyle: "short" });
}

export function actorLabel(
  email: string | null | undefined,
  growersByEmail: Map<string, string>,
): string {
  if (!email) return "Sistema";
  const norm = email.trim().toLowerCase();
  return growersByEmail.get(norm) ?? norm;
}

export function isOperationsRole(role: string): boolean {
  const r = role.toLowerCase();
  return r === "admin" || r === "commercial";
}

export function paymentDomiciliationShouldComplete(billing: AgentBilling): boolean {
  if (billing.domiciliated === true) return true;
  return Boolean(billing.paymentDueDate);
}

export function growerInitials(grower: AgentGrowerRow): string {
  const parts = grower.name.trim().split(/\s+/);
  if (parts.length >= 2) {
    return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase();
  }
  return grower.name.slice(0, 2).toUpperCase();
}

export function emailInitials(email: string): string {
  return email.slice(0, 2).toUpperCase();
}
