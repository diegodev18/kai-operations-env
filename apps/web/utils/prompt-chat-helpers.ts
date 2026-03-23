import type {
  PromptTarget,
  SuggestedPrompts,
} from "@/types/prompt-chat";

export const CHAT_STATUS_LOADING_MESSAGES = [
  "✨ Perfeccionando tu prompt...",
  "🔧 Puliendo las instrucciones...",
  "📝 Analizando el prompt...",
  "✨ Ajustando el texto...",
  "🛠️ Mejorando la redacción...",
] as const;

export function pickRandom<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]!;
}

export function isChatStatusMessage(content: string): boolean {
  return (CHAT_STATUS_LOADING_MESSAGES as readonly string[]).includes(content);
}

const VALID_TARGETS: PromptTarget[] = ["base", "auth", "unauth"];

export function parseSuggestedTarget(raw: unknown): PromptTarget[] {
  if (!Array.isArray(raw) || raw.length === 0) return ["base"];
  const filtered = raw.filter(
    (t): t is PromptTarget =>
      typeof t === "string" && VALID_TARGETS.includes(t as PromptTarget),
  );
  return filtered.length > 0 ? filtered : ["base"];
}

export function parseSuggestedPrompts(raw: unknown): SuggestedPrompts | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;
  const result: SuggestedPrompts = {};
  if (typeof o.base === "string" && o.base.trim()) result.base = o.base.trim();
  if (typeof o.unauth === "string" && o.unauth.trim())
    result.unauth = o.unauth.trim();
  if (typeof o.auth === "string" && o.auth.trim()) result.auth = o.auth.trim();
  return Object.keys(result).length > 0 ? result : null;
}
