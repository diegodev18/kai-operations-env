import { Hono } from "hono";

import { getHealth } from "@/controllers/health.controller";

export const healthRouter = new Hono();

healthRouter.get("/", getHealth);
