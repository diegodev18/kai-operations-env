import { Hono } from "hono";

import healthRouter from "@/routes/health.route";

const api = new Hono();

api.route("/health", healthRouter);

export default api;
