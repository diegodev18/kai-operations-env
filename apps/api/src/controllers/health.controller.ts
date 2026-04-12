import type { Context } from "hono";

export function getHealth(c: Context) {
  return c.json({
    ok: true,
    service: "kai-operations-api",
    version: process.env.API_VERSION || "0.1.0",
    timestamp: new Date().toISOString(),
    dependencies: {
      node: process.version,
    },
  });
}
