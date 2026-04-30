"use client";

import {
  PhoneIcon,
  FileTextIcon,
  CreditCardIcon,
  SendIcon,
  UserCircleIcon,
  AlertCircleIcon,
  ChevronsUpIcon,
  ArrowRightIcon,
  ChevronsDownIcon,
  MinusIcon,
  CircleDashedIcon,
  CircleIcon,
  TimerIcon,
  GitBranchIcon,
  FlaskConicalIcon,
  CheckCircle2Icon,
  XCircleIcon,
  MinusCircleIcon,
} from "lucide-react";
import type { AgentBilling } from "@/lib/agents/agent";
import type { AgentGrowerRow, ImplementationTaskPriority, ImplementationTaskStatus } from "@/types";

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

export const PRIORITY_CONFIG: Record<
  ImplementationTaskPriority,
  { label: string; icon: React.ElementType; className: string }
> = {
  urgent: { label: "Urgente", icon: AlertCircleIcon, className: "text-red-500" },
  high: { label: "Alta", icon: ChevronsUpIcon, className: "text-orange-500" },
  medium: { label: "Media", icon: ArrowRightIcon, className: "text-yellow-500" },
  low: { label: "Baja", icon: ChevronsDownIcon, className: "text-blue-400" },
  none: { label: "Sin prioridad", icon: MinusIcon, className: "text-muted-foreground" },
};

export const PRIORITY_ORDER: ImplementationTaskPriority[] = [
  "urgent",
  "high",
  "medium",
  "low",
  "none",
];

export const STATUS_CONFIG: Record<
  ImplementationTaskStatus,
  { label: string; icon: React.ElementType; iconClassName: string; badgeClassName: string }
> = {
  pending: {
    label: "Por hacer",
    icon: CircleIcon,
    iconClassName: "text-muted-foreground",
    badgeClassName: "border-muted-foreground/40 text-muted-foreground",
  },
  backlog: {
    label: "Backlog",
    icon: CircleDashedIcon,
    iconClassName: "text-muted-foreground/60",
    badgeClassName: "border-muted-foreground/30 text-muted-foreground/60",
  },
  todo: {
    label: "Por hacer",
    icon: CircleIcon,
    iconClassName: "text-muted-foreground",
    badgeClassName: "border-muted-foreground/40 text-muted-foreground",
  },
  in_progress: {
    label: "En progreso",
    icon: TimerIcon,
    iconClassName: "text-blue-500",
    badgeClassName: "border-blue-300 text-blue-600",
  },
  in_review: {
    label: "En revisión",
    icon: GitBranchIcon,
    iconClassName: "text-purple-500",
    badgeClassName: "border-purple-300 text-purple-600",
  },
  testing: {
    label: "En pruebas",
    icon: FlaskConicalIcon,
    iconClassName: "text-orange-500",
    badgeClassName: "border-orange-300 text-orange-600",
  },
  completed: {
    label: "Completada",
    icon: CheckCircle2Icon,
    iconClassName: "text-green-500",
    badgeClassName: "border-green-300 text-green-600",
  },
  blocked: {
    label: "Bloqueada",
    icon: XCircleIcon,
    iconClassName: "text-red-500",
    badgeClassName: "border-red-300 text-red-600",
  },
  cancelled: {
    label: "Cancelada",
    icon: MinusCircleIcon,
    iconClassName: "text-muted-foreground/50",
    badgeClassName: "border-muted-foreground/20 text-muted-foreground/50",
  },
};

export const STATUS_ORDER: ImplementationTaskStatus[] = [
  "backlog",
  "todo",
  "in_progress",
  "in_review",
  "testing",
  "completed",
  "blocked",
  "cancelled",
];

export function normalizeStatus(status: ImplementationTaskStatus): ImplementationTaskStatus {
  return status === "pending" ? "todo" : status;
}

export function isCompletedStatus(status: ImplementationTaskStatus): boolean {
  return status === "completed";
}

export function isActiveStatus(status: ImplementationTaskStatus): boolean {
  return status === "in_progress" || status === "in_review" || status === "testing";
}

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

/** Accepts ISO strings or YYYY-MM-DD date-input values. */
export function formatDate(isoOrDate?: string | null): string {
  if (!isoOrDate) return "";
  const normalized = isoOrDate.includes("T")
    ? isoOrDate
    : `${isoOrDate}T00:00:00.000Z`;
  const d = new Date(normalized);
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
