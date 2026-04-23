import type { Context } from "hono";

import { KAI_AGENTS_TESTING_URL } from "@/config";
import logger, { formatError } from "@/lib/logger";
import { resolveAgentsAuthContext } from "@/routes/agents-auth";
import type { AgentsTestingSimulateBody } from "@/types/agents-testing";
import { userCanAccessAgent } from "@/utils/agents";

function isAgentModeBody(body: AgentsTestingSimulateBody): boolean {
  const config = body.config;
  const agent = body.agent;
  if (typeof config !== "object" || config == null) return false;
  const docId = config.AGENT_DOC_ID;
  if (typeof docId !== "string" || docId.length === 0) return false;
  if (typeof agent !== "object" || agent == null) return false;
  if (body.whatsappBody !== undefined) return false;
  return true;
}

export const simulateAgentsTesting = async (c: Context) => {
  const ctx = await resolveAgentsAuthContext(c);
  if (!ctx.ok) return ctx.response;

  if (!KAI_AGENTS_TESTING_URL?.trim()) {
    return c.json(
      { error: "KAI_AGENTS_TESTING_URL no está configurada en el servidor" },
      503,
    );
  }

  let body: AgentsTestingSimulateBody;
  try {
    body = (await c.req.json()) as AgentsTestingSimulateBody;
  } catch {
    return c.json({ error: "JSON inválido" }, 400);
  }

  if (!isAgentModeBody(body)) {
    return c.json(
      {
        details:
          "Modo agente requiere config.AGENT_DOC_ID, objeto agent y sin whatsappBody.",
        error: "Payload inválido",
      },
      400,
    );
  }

  const id = body.config!.AGENT_DOC_ID;
  if (id) {
    const ok = await userCanAccessAgent(ctx.authCtx, id);
    if (!ok) {
      return c.json({ error: "No autorizado para este agente" }, 403);
    }
  }

  const stream = body.stream === true;
  const url = KAI_AGENTS_TESTING_URL.trim();

  try {
    const upstreamResponse = await fetch(url, {
      body: JSON.stringify(body),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    });

    if (stream) {
      if (
        upstreamResponse.body === null ||
        !upstreamResponse.headers.get("content-type")?.includes("text/event-stream")
      ) {
        const text = await upstreamResponse.text();
        logger.warn("Agents testing: se esperaba stream", {
          contentType: upstreamResponse.headers.get("content-type"),
          status: upstreamResponse.status,
        });
        return c.json(
          { error: "El upstream no devolvió stream", raw: text.slice(0, 500) },
          502,
        );
      }
      return new Response(upstreamResponse.body, {
        headers: {
          "Cache-Control": "no-cache",
          Connection: "keep-alive",
          "Content-Type": "text/event-stream",
          "X-Accel-Buffering": "no",
        },
        status: upstreamResponse.status,
      });
    }

    const data = await upstreamResponse.json().catch(() => ({}));
    return new Response(JSON.stringify(data), {
      headers: { "Content-Type": "application/json" },
      status: upstreamResponse.status,
    });
  } catch (error) {
    logger.error("Agents testing proxy error", {
      error: formatError(error),
      url,
    });
    return c.json(
      { details: (error as Error).message, error: "Fallo al contactar el servicio de simulación" },
      502,
    );
  }
};
