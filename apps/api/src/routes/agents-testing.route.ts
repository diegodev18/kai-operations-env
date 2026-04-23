import { Hono } from "hono";

import { simulateAgentsTesting } from "@/controllers/agents-testing.controller";

export const agentsTestingRouter = new Hono();

agentsTestingRouter.post("/simulate", simulateAgentsTesting);
