import type { Context } from "hono";

export function getHealth(c: Context) {
  return c.json({
    ok: true,
    service: "kai-operations-api",
    timestamp: new Date().toISOString(),
  });
}
