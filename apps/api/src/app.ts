import { serve } from "bun";
import { Hono } from "hono";
import { cors } from "hono/cors";

import { CORS_OPTIONS, NODE_ENV, PORT_NUMBER } from "@/config";
import { getHealth } from "@/controllers/health.controller";
import { auth } from "@/lib/auth";
import { api } from "@/routes";

const app = new Hono();

// Log mínimo: si no ves líneas al pegarle al dominio, el proxy no enruta al contenedor
app.use("*", async (c, next) => {
  console.log(`[api] ${c.req.method} ${c.req.path}`);
  await next();
});

app.get("/", (c) =>
  c.json({
    ok: true,
    service: "kai-operations-api",
    hint: "Si ves esto, Traefik llega al contenedor. Prueba también GET /health y GET /api/health.",
  }),
);

app.get("/health", getHealth);

app.use(
  "*",
  cors({
    allowHeaders: [...CORS_OPTIONS.allowHeaders],
    allowMethods: [...CORS_OPTIONS.allowMethods],
    credentials: CORS_OPTIONS.credentials,
    origin: CORS_OPTIONS.origin,
  }),
);

app.on(["GET", "POST"], "/api/auth/*", (c) => auth.handler(c.req.raw));

app.route("/api", api);

serve({
  fetch: app.fetch,
  port: PORT_NUMBER,
  hostname: "0.0.0.0",
  /** Evita el error "request timed out after 10 seconds" en búsquedas pesadas. */
  idleTimeout: 30,
});

console.log(
  `[api] listening on http://0.0.0.0:${PORT_NUMBER} (${NODE_ENV}) — hit GET / or GET /health to verify routing`,
);
