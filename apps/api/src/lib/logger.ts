import { NODE_ENV } from "@/config";

/** Serializa un error para logs: message + stack si existe. */
export function formatError(err: unknown): string {
  if (err instanceof Error) return err.stack ?? err.message;
  return String(err);
}

const logger = {
  debug: (...args: unknown[]) => {
    if (NODE_ENV !== "production") console.debug("[api]", ...args);
  },
  info: (...args: unknown[]) => {
    console.info("[api]", ...args);
  },
  warn: (...args: unknown[]) => {
    console.warn("[api]", ...args);
  },
  error: (...args: unknown[]) => {
    console.error("[api]", ...args);
  },
};

export default logger;
