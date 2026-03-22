import { serve } from "bun";
import { Hono } from "hono";
import { cors } from "hono/cors";

import { CORS_OPTIONS, NODE_ENV, PORT_NUMBER } from "@/config";
import { auth } from "@/lib/auth";
import api from "@/routes";

const app = new Hono();

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
});

console.log(
  `API listening on http://localhost:${PORT_NUMBER} (${NODE_ENV})`,
);
