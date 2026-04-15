import type { Firestore } from "firebase-admin/firestore";
import { FieldValue } from "firebase-admin/firestore";
import sanitizeHtml from "sanitize-html";

import logger, { formatError } from "@/lib/logger";

/** Acciones registradas automáticamente (sin payloads sensibles). */
export type ImplementationActivityAction =
  | "prompt_updated"
  | "prompt_promoted_to_production"
  | "agent_archived"
  | "agent_unarchived"
  | "testing_properties_updated"
  | "tool_created"
  | "tool_deleted"
  | "tool_disabled"
  | "tool_enabled"
  | "tool_updated"
  | "billing_config_updated"
  | "promoted_to_production";

const SANITIZE_OPTIONS: sanitizeHtml.IOptions = {
  allowedTags: [
    "p",
    "br",
    "strong",
    "em",
    "b",
    "i",
    "u",
    "s",
    "strike",
    "del",
    "h1",
    "h2",
    "h3",
    "h4",
    "ul",
    "ol",
    "li",
    "blockquote",
    "pre",
    "code",
    "span",
    "div",
    "a",
    "hr",
    "mark",
  ],
  allowedAttributes: {
    a: ["href", "name", "target", "rel"],
    span: ["class"],
    code: ["class"],
    div: ["class"],
    p: ["class"],
  },
  allowedSchemes: ["http", "https", "mailto"],
  transformTags: {
    a: sanitizeHtml.simpleTransform("a", {
      rel: "noopener noreferrer",
      target: "_blank",
    }),
  },
};

const MAX_COMMENT_HTML_LENGTH = 50_000;

export function getImplementationActivityItemsRef(db: Firestore, agentId: string) {
  return db
    .collection("agent_configurations")
    .doc(agentId)
    .collection("implementation")
    .doc("activity")
    .collection("items");
}

export function sanitizeImplementationCommentHtml(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return "";
  if (trimmed.length > MAX_COMMENT_HTML_LENGTH) {
    return sanitizeHtml(trimmed.slice(0, MAX_COMMENT_HTML_LENGTH), SANITIZE_OPTIONS);
  }
  return sanitizeHtml(trimmed, SANITIZE_OPTIONS);
}

/** Texto plano aproximado para validar que no quede vacío tras sanitizar. */
function htmlToPlainText(html: string): string {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function validateCommentBodyHtml(raw: string): { ok: true; html: string } | { ok: false; error: string } {
  if (typeof raw !== "string") {
    return { ok: false, error: "bodyHtml debe ser texto" };
  }
  if (raw.length > MAX_COMMENT_HTML_LENGTH) {
    return { ok: false, error: "Comentario demasiado largo" };
  }
  const html = sanitizeImplementationCommentHtml(raw);
  if (!htmlToPlainText(html)) {
    return { ok: false, error: "El comentario no puede quedar vacío" };
  }
  return { ok: true, html };
}

type SystemEntryInput = {
  kind: "system";
  actorEmail: string | null;
  action: ImplementationActivityAction;
  summary: string;
  metadata?: Record<string, unknown>;
};

/**
 * Añade una entrada de sistema a la bitácora. Errores solo se registran; no relanza.
 */
export async function appendImplementationActivityEntry(
  db: Firestore,
  agentId: string,
  input: SystemEntryInput,
): Promise<void> {
  try {
    const payload: Record<string, unknown> = {
      kind: "system",
      actorEmail: input.actorEmail?.toLowerCase().trim() || null,
      action: input.action,
      summary: input.summary.slice(0, 2000),
      createdAt: FieldValue.serverTimestamp(),
    };
    if (input.metadata && Object.keys(input.metadata).length > 0) {
      payload.metadata = input.metadata;
    }
    await getImplementationActivityItemsRef(db, agentId).add(payload);
  } catch (e) {
    logger.error(
      "[implementation-activity] append system failed",
      formatError(e),
      { agentId, action: input.action },
    );
  }
}

