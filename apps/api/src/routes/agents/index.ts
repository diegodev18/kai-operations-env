import { Hono } from "hono";

import { registerAgentsBuilderRoutes } from "./register-builder";
import { registerAgentsByAgentRoutes } from "./register-by-agent";
import { registerAgentsDraftRoutes } from "./register-drafts";
import { registerAgentsListRoutes } from "./register-list";

export const agentsRouter = new Hono();

registerAgentsListRoutes(agentsRouter);
registerAgentsBuilderRoutes(agentsRouter);
registerAgentsDraftRoutes(agentsRouter);
registerAgentsByAgentRoutes(agentsRouter);
