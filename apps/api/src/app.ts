import { serve } from "bun";
import { Hono } from "hono";

import { NODE_ENV, PORT_NUMBER } from "@/config";
import api from "@/routes";

const app = new Hono();

app.route("/api", api);

serve({
  fetch: app.fetch,
  port: PORT_NUMBER,
});

console.log(
  `API listening on http://localhost:${PORT_NUMBER} (${NODE_ENV})`,
);
