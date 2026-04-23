import { Hono } from "hono";

import { getAvailableModels, promptChat } from "@/controllers/prompt.controller";
import { auth } from "@/lib/auth";

export const promptRouter = new Hono();

promptRouter.get("/models", async (c) => {
  const session = await auth.api.getSession({
    headers: c.req.raw.headers,
  });

  if (!session?.user) {
    return c.json({ error: "No autorizado" }, 401);
  }

  const models = getAvailableModels();
  return c.json({ models });
});

promptRouter.post("/chat", promptChat);
