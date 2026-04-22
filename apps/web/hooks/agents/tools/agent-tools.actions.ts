import type {
  AgentTool,
  CreateAgentToolBody,
  UpdateAgentToolBody,
} from "@/types/agent-tool";
import { toast } from "sonner";
import { AGENTS_BASE } from "@/services/agents-api";

export async function createAgentTool(
  agentId: string,
  body: CreateAgentToolBody,
): Promise<AgentTool | null> {
  const res = await fetch(`${AGENTS_BASE}/${encodeURIComponent(agentId)}/tools`, {
    method: "POST",
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = (await res.json()) as { error?: string };
    toast.error(err.error ?? "Error al crear tool");
    return null;
  }
  return (await res.json()) as AgentTool;
}

export async function updateAgentTool(
  agentId: string,
  toolId: string,
  body: UpdateAgentToolBody,
): Promise<AgentTool | null> {
  const res = await fetch(
    `${AGENTS_BASE}/${encodeURIComponent(agentId)}/tools/${encodeURIComponent(toolId)}`,
    {
      method: "PATCH",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    },
  );
  if (!res.ok) {
    const err = (await res.json()) as { error?: string };
    toast.error(err.error ?? "Error al actualizar tool");
    return null;
  }
  return (await res.json()) as AgentTool;
}

export async function deleteAgentTool(
  agentId: string,
  toolId: string,
): Promise<boolean> {
  const res = await fetch(
    `${AGENTS_BASE}/${encodeURIComponent(agentId)}/tools/${encodeURIComponent(toolId)}`,
    {
      method: "DELETE",
      credentials: "include",
    },
  );
  if (!res.ok) {
    const err = (await res.json()) as { error?: string };
    toast.error(err.error ?? "Error al eliminar tool");
    return false;
  }
  return true;
}
