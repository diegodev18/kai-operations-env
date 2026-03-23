import { Hono } from "hono";

import { simulateAgentsTesting } from "@/controllers/agents-testing.controller";

const router = new Hono();

router.post("/simulate", simulateAgentsTesting);

export default router;
