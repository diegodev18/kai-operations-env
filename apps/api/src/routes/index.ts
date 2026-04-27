import { Hono } from "hono";

import { agentsRouter } from "@/routes/agents";
import { agentTestingDataRouter } from "@/routes/agent-testing-data.route";
import { agentsTestingRouter } from "@/routes/agents-testing.route";
import { builderSavedCompaniesRouter } from "@/routes/builder-saved-companies.route";
import { blogRouter } from "@/routes/blog.route";
import { changelogRouter } from "@/routes/changelog.route";
import { databaseRouter } from "@/routes/database.route";
import { dynamicTableSchemasRouter } from "@/routes/dynamic-table-schemas.route";
import { favoritesRouter } from "@/routes/favorites.route";
import { healthRouter } from "@/routes/health.route";
import { organizationRouter } from "@/routes/organization.route";
import { promptRouter } from "@/routes/prompt.route";
import { crmRouter } from "@/routes/crm.route";

export const api = new Hono();

api.route("/blog", blogRouter);
api.route("/changelogs", changelogRouter);
api.route("/database", databaseRouter);
api.route("/dynamic-table-schemas", dynamicTableSchemasRouter);
api.route("/health", healthRouter);
api.route("/agents", agentsRouter);
api.route("/agents-testing", agentsTestingRouter);
api.route("/agent_configurations", agentTestingDataRouter);
api.route("/favorites", favoritesRouter);
api.route("/builder/saved-companies", builderSavedCompaniesRouter);
api.route("/organization", organizationRouter);
api.route("/prompt", promptRouter);
api.route("/crm", crmRouter);
