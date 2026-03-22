import { Hono } from "hono";

import { getHealth } from "@/controllers/health.controller";

const router = new Hono();

router.get("/", getHealth);

export default router;
