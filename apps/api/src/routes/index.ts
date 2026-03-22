import { Hono } from "hono";

import agentsRouter from "@/routes/agents.route";
import healthRouter from "@/routes/health.route";
import organizationRouter from "@/routes/organization.route";

const api = new Hono();

api.route("/health", healthRouter);
api.route("/agents", agentsRouter);
api.route("/organization", organizationRouter);

export default api;
