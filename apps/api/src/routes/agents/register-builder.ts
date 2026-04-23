import type { Hono } from "hono";

import { postAgentBuilderChat } from "@/controllers/agent-builder-chat.controller";
import { postAgentFlowQuestions } from "@/controllers/agent-flow-questions.controller";
import { postAgentRecommendTools } from "@/controllers/agent-recommend-tools.controller";
import { postAgentToolFlowsMarkdown } from "@/controllers/agent-tool-flows-markdown.controller";
import { resolveAgentsAuthContext } from "@/routes/agents-auth";

export function registerAgentsBuilderRoutes(r: Hono) {
  r.post("/builder/chat", async (c) => {
    const ctx = await resolveAgentsAuthContext(c);
    if (!ctx.ok) return ctx.response;
    return postAgentBuilderChat(c, ctx.authCtx);
  });

  r.post("/builder/recommend-tools", async (c) => {
    const ctx = await resolveAgentsAuthContext(c);
    if (!ctx.ok) return ctx.response;
    return postAgentRecommendTools(c, ctx.authCtx);
  });

  r.post("/builder/tool-flows-markdown", async (c) => {
    const ctx = await resolveAgentsAuthContext(c);
    if (!ctx.ok) return ctx.response;
    return postAgentToolFlowsMarkdown(c, ctx.authCtx);
  });

  r.post("/builder/flow-questions", async (c) => {
    const ctx = await resolveAgentsAuthContext(c);
    if (!ctx.ok) return ctx.response;
    return postAgentFlowQuestions(c, ctx.authCtx);
  });
}
