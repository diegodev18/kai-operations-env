import { Hono } from "hono";

import agentsRouter from "@/routes/agents.route";
import healthRouter from "@/routes/health.route";

const api = new Hono();

api.route("/health", healthRouter);
api.route("/agents", agentsRouter);

export default api;
