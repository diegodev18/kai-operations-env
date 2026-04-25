import { Hono } from "hono";

import {
  createDynamicTableSchema,
  deleteDynamicTableSchema,
  getDynamicTableSchema,
  listDynamicTableSchemas,
  patchDynamicTableSchema,
} from "@/controllers/dynamic-table-schemas.controller";

export const dynamicTableSchemasRouter = new Hono();

dynamicTableSchemasRouter.get("/", listDynamicTableSchemas);
dynamicTableSchemasRouter.get("/:schemaId", getDynamicTableSchema);
dynamicTableSchemasRouter.post("/", createDynamicTableSchema);
dynamicTableSchemasRouter.patch("/:schemaId", patchDynamicTableSchema);
dynamicTableSchemasRouter.delete("/:schemaId", deleteDynamicTableSchema);
