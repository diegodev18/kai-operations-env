import { Hono } from "hono";

import { resolveAgentsAuthContext } from "@/routes/agents-auth";
import {
  deleteChangelogEntry,
  getChangelogEntries,
  getChangelogEntry,
  listChangelogProjects,
  postChangelogEntry,
  postChangelogUpload,
} from "@/controllers/changelog.controller";

const changelogRouter = new Hono();

changelogRouter.get("/:project", async (c) => {
  const ctx = await resolveAgentsAuthContext(c);
  if (!ctx.ok) {
    return ctx.response;
  }
  const project = c.req.param("project") as string;
  const version = c.req.query("version");
  if (version) {
    return getChangelogEntry(c, project, version);
  }
  const search = c.req.query("q") || "";
  const status = c.req.query("status") as string | undefined;
  return getChangelogEntries(c, project, search, status);
});

changelogRouter.post("/:project", async (c) => {
  const ctx = await resolveAgentsAuthContext(c);
  if (!ctx.ok) {
    return ctx.response;
  }
  const project = c.req.param("project") as string;
  return postChangelogEntry(c, ctx.authCtx, project);
});

changelogRouter.delete("/:project/:id", async (c) => {
  const ctx = await resolveAgentsAuthContext(c);
  if (!ctx.ok) {
    return ctx.response;
  }
  const project = c.req.param("project") as string;
  const id = c.req.param("id") as string;
  return deleteChangelogEntry(c, ctx.authCtx, project, id);
});

changelogRouter.post("/:project/upload", async (c) => {
  const ctx = await resolveAgentsAuthContext(c);
  if (!ctx.ok) {
    return ctx.response;
  }
  const project = c.req.param("project") as string;
  return postChangelogUpload(c, ctx.authCtx, project);
});

export default changelogRouter;
export { listChangelogProjects };