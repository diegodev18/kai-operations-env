import type { Hono } from "hono";

import { assignAgentToUser } from "@/controllers/agents.controller";
import {
  getAgentById,
  getAgentBuilderForm,
  getAgentProperties,
  patchAgent,
  postAgentOperationsArchive,
  postAgentSystemPromptRegenerate,
  updateAgentPrompt,
  updateAgentPropertyDocument,
  getProductionPrompt,
  promotePromptToProduction,
} from "@/controllers/agent-detail";
import {
  createAgentTool,
  deleteAgentTool,
  getAgentTools,
  updateAgentTool,
} from "@/controllers/agent-tools.controller";
import {
  deleteAgentGrower,
  getAgentGrowers,
  postAgentGrower,
} from "@/controllers/agents-growers.controller";
import {
  deleteAgentTechLead,
  getAgentTechLeads,
  postAgentTechLead,
} from "@/controllers/agents-tech-leads.controller";
import {
  createImplementationTask,
  getImplementationTasks,
  patchImplementationTask,
} from "@/controllers/agents-implementation-tasks.controller";
import {
  createImplementationActivityComment,
  getImplementationActivity,
  patchImplementationActivityCommentVisibility,
} from "@/controllers/agents-implementation-activity.controller";
import {
  deleteSimulatorState,
  getSimulatorState,
  patchSimulatorState,
} from "@/controllers/agents-simulator-state.controller";
import {
  getImplementationLifecycle,
  patchImplementationLifecycle,
} from "@/controllers/agents-implementation-lifecycle.controller";
import { getWhatsappIntegrationStatus } from "@/controllers/agents-whatsapp-integration.controller";
import {
  postPromoteToProduction,
  postSyncFromProduction,
  getTestingDiff,
} from "@/controllers/agent-sync.controller";
import {
  getTestingProperties,
  updateTestingPropertyDocument,
} from "@/controllers/agent-testing.controller";
import {
  getAgentBilling,
  patchAgentBillingConfig,
  createPaymentRecord,
  deletePaymentRecord,
} from "@/controllers/agent-billing.controller";
import { uploadAgentFile } from "@/controllers/agent-file-upload.controller";
import { resolveAgentsAuthContext } from "@/routes/agents-auth";

import { isReservedAgentPathSegment } from "./reserved";

export function registerAgentsByAgentRoutes(r: Hono) {

r.get("/:agentId/properties", async (c) => {
  const ctx = await resolveAgentsAuthContext(c);
  if (!ctx.ok) return ctx.response;
  const agentId = c.req.param("agentId")?.trim() ?? "";
  if (!agentId || isReservedAgentPathSegment(agentId)) {
    return c.json({ error: "Agente no encontrado" }, 404);
  }
  return getAgentProperties(c, ctx.authCtx, agentId);
});

r.get("/:agentId/builder-form", async (c) => {
  const ctx = await resolveAgentsAuthContext(c);
  if (!ctx.ok) return ctx.response;
  const agentId = c.req.param("agentId")?.trim() ?? "";
  if (!agentId || isReservedAgentPathSegment(agentId)) {
    return c.json({ error: "Agente no encontrado" }, 404);
  }
  return getAgentBuilderForm(c, ctx.authCtx, agentId);
});

r.patch("/:agentId/properties/:documentId", async (c) => {
  const ctx = await resolveAgentsAuthContext(c);
  if (!ctx.ok) return ctx.response;
  const agentId = c.req.param("agentId")?.trim() ?? "";
  const documentId = c.req.param("documentId")?.trim() ?? "";
  if (!agentId || !documentId || isReservedAgentPathSegment(agentId)) {
    return c.json({ error: "Agente o documento no encontrado" }, 404);
  }
  return updateAgentPropertyDocument(c, ctx.authCtx, agentId, documentId);
});

r.get("/:agentId/tools", async (c) => {
  const ctx = await resolveAgentsAuthContext(c);
  if (!ctx.ok) return ctx.response;
  const agentId = c.req.param("agentId")?.trim() ?? "";
  if (!agentId || isReservedAgentPathSegment(agentId)) {
    return c.json({ error: "Agente no encontrado" }, 404);
  }
  return getAgentTools(c, ctx.authCtx, agentId);
});

r.post("/:agentId/tools", async (c) => {
  const ctx = await resolveAgentsAuthContext(c);
  if (!ctx.ok) return ctx.response;
  const agentId = c.req.param("agentId")?.trim() ?? "";
  if (!agentId || isReservedAgentPathSegment(agentId)) {
    return c.json({ error: "Agente no encontrado" }, 404);
  }
  return createAgentTool(c, ctx.authCtx, agentId);
});

r.patch("/:agentId/tools/:toolId", async (c) => {
  const ctx = await resolveAgentsAuthContext(c);
  if (!ctx.ok) return ctx.response;
  const agentId = c.req.param("agentId")?.trim() ?? "";
  const toolId = c.req.param("toolId")?.trim() ?? "";
  if (!agentId || !toolId || isReservedAgentPathSegment(agentId)) {
    return c.json({ error: "Agente o tool no encontrado" }, 404);
  }
  return updateAgentTool(c, ctx.authCtx, agentId, toolId);
});

r.delete("/:agentId/tools/:toolId", async (c) => {
  const ctx = await resolveAgentsAuthContext(c);
  if (!ctx.ok) return ctx.response;
  const agentId = c.req.param("agentId")?.trim() ?? "";
  const toolId = c.req.param("toolId")?.trim() ?? "";
  if (!agentId || !toolId || isReservedAgentPathSegment(agentId)) {
    return c.json({ error: "Agente o tool no encontrado" }, 404);
  }
  return deleteAgentTool(c, ctx.authCtx, agentId, toolId);
});

r.patch("/:agentId/prompt", async (c) => {
  const ctx = await resolveAgentsAuthContext(c);
  if (!ctx.ok) return ctx.response;
  const agentId = c.req.param("agentId")?.trim() ?? "";
  if (!agentId || isReservedAgentPathSegment(agentId)) {
    return c.json({ error: "Agente no encontrado" }, 404);
  }
  return updateAgentPrompt(c, ctx.authCtx, agentId);
});

r.get("/:agentId/production-prompt", async (c) => {
  const ctx = await resolveAgentsAuthContext(c);
  if (!ctx.ok) return ctx.response;
  const agentId = c.req.param("agentId")?.trim() ?? "";
  if (!agentId || isReservedAgentPathSegment(agentId)) {
    return c.json({ error: "Agente no encontrado" }, 404);
  }
  return getProductionPrompt(c, ctx.authCtx, agentId);
});

r.post("/:agentId/promote-prompt-to-production", async (c) => {
  const ctx = await resolveAgentsAuthContext(c);
  if (!ctx.ok) return ctx.response;
  const agentId = c.req.param("agentId")?.trim() ?? "";
  if (!agentId || isReservedAgentPathSegment(agentId)) {
    return c.json({ error: "Agente no encontrado" }, 404);
  }
  return promotePromptToProduction(c, ctx.authCtx, agentId);
});

r.post("/:agentId/system-prompt/regenerate", async (c) => {
  const ctx = await resolveAgentsAuthContext(c);
  if (!ctx.ok) return ctx.response;
  const agentId = c.req.param("agentId")?.trim() ?? "";
  if (!agentId || isReservedAgentPathSegment(agentId)) {
    return c.json({ error: "Agente no encontrado" }, 404);
  }
  return postAgentSystemPromptRegenerate(c, ctx.authCtx, agentId);
});

r.get("/:agentId/testing/properties", async (c) => {
  const ctx = await resolveAgentsAuthContext(c);
  if (!ctx.ok) return ctx.response;
  const agentId = c.req.param("agentId")?.trim() ?? "";
  if (!agentId || isReservedAgentPathSegment(agentId)) {
    return c.json({ error: "Agente no encontrado" }, 404);
  }
  return getTestingProperties(c, ctx.authCtx, agentId);
});

r.patch("/:agentId/testing/properties/:documentId", async (c) => {
  const ctx = await resolveAgentsAuthContext(c);
  if (!ctx.ok) return ctx.response;
  const agentId = c.req.param("agentId")?.trim() ?? "";
  const documentId = c.req.param("documentId")?.trim() ?? "";
  if (!agentId || !documentId || isReservedAgentPathSegment(agentId)) {
    return c.json({ error: "Agente o documento no encontrado" }, 404);
  }
  return updateTestingPropertyDocument(c, ctx.authCtx, agentId, documentId);
});

r.post("/:agentId/sync-from-production", async (c) => {
  const ctx = await resolveAgentsAuthContext(c);
  if (!ctx.ok) return ctx.response;
  const agentId = c.req.param("agentId")?.trim() ?? "";
  if (!agentId || isReservedAgentPathSegment(agentId)) {
    return c.json({ error: "Agente no encontrado" }, 404);
  }
  return postSyncFromProduction(c, ctx.authCtx, agentId);
});

r.post("/:agentId/promote-to-production", async (c) => {
  const ctx = await resolveAgentsAuthContext(c);
  if (!ctx.ok) return ctx.response;
  const agentId = c.req.param("agentId")?.trim() ?? "";
  if (!agentId || isReservedAgentPathSegment(agentId)) {
    return c.json({ error: "Agente no encontrado" }, 404);
  }
  return postPromoteToProduction(c, ctx.authCtx, agentId);
});

r.get("/:agentId/testing/diff", async (c) => {
  const ctx = await resolveAgentsAuthContext(c);
  if (!ctx.ok) return ctx.response;
  const agentId = c.req.param("agentId")?.trim() ?? "";
  if (!agentId || isReservedAgentPathSegment(agentId)) {
    return c.json({ error: "Agente no encontrado" }, 404);
  }
  return getTestingDiff(c, ctx.authCtx, agentId);
});

r.patch("/:agentId", async (c) => {
  const ctx = await resolveAgentsAuthContext(c);
  if (!ctx.ok) return ctx.response;
  const agentId = c.req.param("agentId")?.trim() ?? "";
  if (!agentId || isReservedAgentPathSegment(agentId)) {
    return c.json({ error: "Agente no encontrado" }, 404);
  }
  return patchAgent(c, ctx.authCtx, agentId);
});

r.post("/:agentId/operations-archive", async (c) => {
  const ctx = await resolveAgentsAuthContext(c);
  if (!ctx.ok) return ctx.response;
  const agentId = c.req.param("agentId")?.trim() ?? "";
  if (!agentId || isReservedAgentPathSegment(agentId)) {
    return c.json({ error: "Agente no encontrado" }, 404);
  }
  return postAgentOperationsArchive(c, ctx.authCtx, agentId);
});

r.get("/:agentId", async (c) => {
  const ctx = await resolveAgentsAuthContext(c);
  if (!ctx.ok) return ctx.response;
  const agentId = c.req.param("agentId")?.trim() ?? "";
  if (!agentId || isReservedAgentPathSegment(agentId)) {
    return c.json({ error: "Agente no encontrado" }, 404);
  }
  return getAgentById(c, ctx.authCtx, agentId);
});

r.get("/:agentId/growers", async (c) => {
  const ctx = await resolveAgentsAuthContext(c);
  if (!ctx.ok) return ctx.response;
  const agentId = c.req.param("agentId")?.trim();
  if (!agentId || isReservedAgentPathSegment(agentId)) {
    return c.json({ error: "Agente no encontrado" }, 404);
  }
  return getAgentGrowers(c, ctx.authCtx, agentId);
});

r.post("/:agentId/growers", async (c) => {
  const ctx = await resolveAgentsAuthContext(c);
  if (!ctx.ok) return ctx.response;
  const agentId = c.req.param("agentId")?.trim();
  if (!agentId || isReservedAgentPathSegment(agentId)) {
    return c.json({ error: "Agente no encontrado" }, 404);
  }
  return postAgentGrower(c, ctx.authCtx, agentId);
});

r.delete("/:agentId/growers/:growerEmail", async (c) => {
  const ctx = await resolveAgentsAuthContext(c);
  if (!ctx.ok) return ctx.response;
  const agentId = c.req.param("agentId")?.trim();
  const growerEmail = c.req.param("growerEmail");
  if (
    !agentId ||
    growerEmail == null ||
    growerEmail === "" ||
    isReservedAgentPathSegment(agentId)
  ) {
    return c.json({ error: "Agente o grower no encontrado" }, 404);
  }
  return deleteAgentGrower(c, ctx.authCtx, agentId, growerEmail);
});

r.get("/:agentId/techLeads", async (c) => {
  const ctx = await resolveAgentsAuthContext(c);
  if (!ctx.ok) return ctx.response;
  const agentId = c.req.param("agentId")?.trim();
  if (!agentId || isReservedAgentPathSegment(agentId)) {
    return c.json({ error: "Agente no encontrado" }, 404);
  }
  return getAgentTechLeads(c, ctx.authCtx, agentId);
});

r.post("/:agentId/techLeads", async (c) => {
  const ctx = await resolveAgentsAuthContext(c);
  if (!ctx.ok) return ctx.response;
  const agentId = c.req.param("agentId")?.trim();
  if (!agentId || isReservedAgentPathSegment(agentId)) {
    return c.json({ error: "Agente no encontrado" }, 404);
  }
  return postAgentTechLead(c, ctx.authCtx, agentId);
});

r.delete("/:agentId/techLeads/:techLeadEmail", async (c) => {
  const ctx = await resolveAgentsAuthContext(c);
  if (!ctx.ok) return ctx.response;
  const agentId = c.req.param("agentId")?.trim();
  const techLeadEmail = c.req.param("techLeadEmail");
  if (
    !agentId ||
    techLeadEmail == null ||
    techLeadEmail === "" ||
    isReservedAgentPathSegment(agentId)
  ) {
    return c.json({ error: "Agente o tech lead no encontrado" }, 404);
  }
  return deleteAgentTechLead(c, ctx.authCtx, agentId, techLeadEmail);
});

r.get("/:agentId/whatsapp-integration-status", async (c) => {
  const ctx = await resolveAgentsAuthContext(c);
  if (!ctx.ok) return ctx.response;
  const agentId = c.req.param("agentId")?.trim() ?? "";
  if (!agentId || isReservedAgentPathSegment(agentId)) {
    return c.json({ error: "Agente no encontrado" }, 404);
  }
  return getWhatsappIntegrationStatus(c, ctx.authCtx, agentId);
});

r.get("/:agentId/implementation-tasks", async (c) => {
  const ctx = await resolveAgentsAuthContext(c);
  if (!ctx.ok) return ctx.response;
  const agentId = c.req.param("agentId")?.trim() ?? "";
  if (!agentId || isReservedAgentPathSegment(agentId)) {
    return c.json({ error: "Agente no encontrado" }, 404);
  }
  return getImplementationTasks(c, ctx.authCtx, agentId);
});

r.post("/:agentId/implementation-tasks", async (c) => {
  const ctx = await resolveAgentsAuthContext(c);
  if (!ctx.ok) return ctx.response;
  const agentId = c.req.param("agentId")?.trim() ?? "";
  if (!agentId || isReservedAgentPathSegment(agentId)) {
    return c.json({ error: "Agente no encontrado" }, 404);
  }
  return createImplementationTask(c, ctx.authCtx, agentId);
});

r.patch("/:agentId/implementation-tasks/:taskId", async (c) => {
  const ctx = await resolveAgentsAuthContext(c);
  if (!ctx.ok) return ctx.response;
  const agentId = c.req.param("agentId")?.trim() ?? "";
  const taskId = c.req.param("taskId")?.trim() ?? "";
  if (!agentId || !taskId || isReservedAgentPathSegment(agentId)) {
    return c.json({ error: "Agente o tarea no encontrado" }, 404);
  }
  return patchImplementationTask(c, ctx.authCtx, agentId, taskId);
});

r.get("/:agentId/implementation-activity", async (c) => {
  const ctx = await resolveAgentsAuthContext(c);
  if (!ctx.ok) return ctx.response;
  const agentId = c.req.param("agentId")?.trim() ?? "";
  if (!agentId || isReservedAgentPathSegment(agentId)) {
    return c.json({ error: "Agente no encontrado" }, 404);
  }
  return getImplementationActivity(c, ctx.authCtx, agentId);
});

r.post("/:agentId/implementation-activity", async (c) => {
  const ctx = await resolveAgentsAuthContext(c);
  if (!ctx.ok) return ctx.response;
  const agentId = c.req.param("agentId")?.trim() ?? "";
  if (!agentId || isReservedAgentPathSegment(agentId)) {
    return c.json({ error: "Agente no encontrado" }, 404);
  }
  return createImplementationActivityComment(c, ctx.authCtx, agentId);
});

r.patch("/:agentId/implementation-activity/:entryId", async (c) => {
  const ctx = await resolveAgentsAuthContext(c);
  if (!ctx.ok) return ctx.response;
  const agentId = c.req.param("agentId")?.trim() ?? "";
  const entryId = c.req.param("entryId")?.trim() ?? "";
  if (!agentId || !entryId || isReservedAgentPathSegment(agentId)) {
    return c.json({ error: "Agente o comentario no encontrado" }, 404);
  }
  return patchImplementationActivityCommentVisibility(
    c,
    ctx.authCtx,
    agentId,
    entryId,
  );
});

r.get("/:agentId/simulator-state", async (c) => {
  const ctx = await resolveAgentsAuthContext(c);
  if (!ctx.ok) return ctx.response;
  const agentId = c.req.param("agentId")?.trim() ?? "";
  if (!agentId || isReservedAgentPathSegment(agentId)) {
    return c.json({ error: "Agente no encontrado" }, 404);
  }
  return getSimulatorState(c, ctx.authCtx, agentId);
});

r.patch("/:agentId/simulator-state", async (c) => {
  const ctx = await resolveAgentsAuthContext(c);
  if (!ctx.ok) return ctx.response;
  const agentId = c.req.param("agentId")?.trim() ?? "";
  if (!agentId || isReservedAgentPathSegment(agentId)) {
    return c.json({ error: "Agente no encontrado" }, 404);
  }
  return patchSimulatorState(c, ctx.authCtx, agentId);
});

r.delete("/:agentId/simulator-state", async (c) => {
  const ctx = await resolveAgentsAuthContext(c);
  if (!ctx.ok) return ctx.response;
  const agentId = c.req.param("agentId")?.trim() ?? "";
  if (!agentId || isReservedAgentPathSegment(agentId)) {
    return c.json({ error: "Agente no encontrado" }, 404);
  }
  return deleteSimulatorState(c, ctx.authCtx, agentId);
});

r.get("/:agentId/implementation-lifecycle", async (c) => {
  const ctx = await resolveAgentsAuthContext(c);
  if (!ctx.ok) return ctx.response;
  const agentId = c.req.param("agentId")?.trim() ?? "";
  if (!agentId || isReservedAgentPathSegment(agentId)) {
    return c.json({ error: "Agente no encontrado" }, 404);
  }
  return getImplementationLifecycle(c, ctx.authCtx, agentId);
});

r.patch("/:agentId/implementation-lifecycle", async (c) => {
  const ctx = await resolveAgentsAuthContext(c);
  if (!ctx.ok) return ctx.response;
  const agentId = c.req.param("agentId")?.trim() ?? "";
  if (!agentId || isReservedAgentPathSegment(agentId)) {
    return c.json({ error: "Agente no encontrado" }, 404);
  }
  return patchImplementationLifecycle(c, ctx.authCtx, agentId);
});

r.post("/:agentId/assign-to-user", async (c) => {
  const ctx = await resolveAgentsAuthContext(c);
  if (!ctx.ok) return ctx.response;
  const agentId = c.req.param("agentId")?.trim() ?? "";
  if (!agentId || isReservedAgentPathSegment(agentId)) {
    return c.json({ error: "Agente no encontrado" }, 404);
  }
  return assignAgentToUser(c, ctx.authCtx, agentId);
});

r.get("/:agentId/billing", async (c) => {
  const ctx = await resolveAgentsAuthContext(c);
  if (!ctx.ok) return ctx.response;
  const agentId = c.req.param("agentId")?.trim() ?? "";
  if (!agentId || isReservedAgentPathSegment(agentId)) {
    return c.json({ error: "Agente no encontrado" }, 404);
  }
  return getAgentBilling(c, ctx.authCtx, agentId);
});

r.patch("/:agentId/billing", async (c) => {
  const ctx = await resolveAgentsAuthContext(c);
  if (!ctx.ok) return ctx.response;
  const agentId = c.req.param("agentId")?.trim() ?? "";
  if (!agentId || isReservedAgentPathSegment(agentId)) {
    return c.json({ error: "Agente no encontrado" }, 404);
  }
  return patchAgentBillingConfig(c, ctx.authCtx, agentId);
});

r.post("/:agentId/billing/payments", async (c) => {
  const ctx = await resolveAgentsAuthContext(c);
  if (!ctx.ok) return ctx.response;
  const agentId = c.req.param("agentId")?.trim() ?? "";
  if (!agentId || isReservedAgentPathSegment(agentId)) {
    return c.json({ error: "Agente no encontrado" }, 404);
  }
  return createPaymentRecord(c, ctx.authCtx, agentId);
});

r.delete("/:agentId/billing/payments/:paymentId", async (c) => {
  const ctx = await resolveAgentsAuthContext(c);
  if (!ctx.ok) return ctx.response;
  const agentId = c.req.param("agentId")?.trim() ?? "";
  const paymentId = c.req.param("paymentId")?.trim() ?? "";
  if (!agentId || !paymentId || isReservedAgentPathSegment(agentId)) {
    return c.json({ error: "Agente o pago no encontrado" }, 404);
  }
  return deletePaymentRecord(c, ctx.authCtx, agentId, paymentId);
});

r.post("/:agentId/files/upload", async (c) => {
  const ctx = await resolveAgentsAuthContext(c);
  if (!ctx.ok) return ctx.response;
  const agentId = c.req.param("agentId")?.trim() ?? "";
  if (!agentId || isReservedAgentPathSegment(agentId)) {
    return c.json({ error: "Agente no encontrado" }, 404);
  }
  return uploadAgentFile(c, ctx.authCtx, agentId);
});
}
