import { Hono } from "hono";

import agentsRouter from "@/routes/agents.route";
import agentsTestingRouter from "@/routes/agents-testing.route";
import healthRouter from "@/routes/health.route";
import organizationRouter from "@/routes/organization.route";
import promptRouter from "@/routes/prompt.route";

const api = new Hono();

api.route("/health", healthRouter);
api.route("/agents", agentsRouter);
api.route("/agents-testing", agentsTestingRouter);
api.route("/organization", organizationRouter);
api.route("/prompt", promptRouter);

export default api;
