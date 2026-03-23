import type {
  AgentTool,
  CreateAgentToolBody,
  UpdateAgentToolBody,
} from "@/types/agent-tool";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

const BASE = "/api/agents";

export function useAgentTools(agentId: string | null) {
  const [tools, setTools] = useState<AgentTool[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const refetch = useCallback(async () => {
    if (!agentId) {
      setTools([]);
      return;
    }
    setIsLoading(true);
    setTools([]);
    try {
      const res = await fetch(
        `${BASE}/${encodeURIComponent(agentId)}/tools`,
        {
          credentials: "include",
        },
      );
      if (!res.ok) {
        const err = (await res.json()) as { error?: string };
        toast.error(err.error ?? "Error al cargar tools");
        return;
      }
      const json = (await res.json()) as { tools: AgentTool[] };
      setTools(json.tools ?? []);
    } catch {
      toast.error("Error al cargar tools del agente");
    } finally {
      setIsLoading(false);
    }
  }, [agentId]);

  useEffect(() => {
    refetch();
  }, [refetch]);

  return { tools, isLoading, refetch };
}

export async function createAgentTool(
  agentId: string,
  body: CreateAgentToolBody,
): Promise<AgentTool | null> {
  const res = await fetch(`${BASE}/${encodeURIComponent(agentId)}/tools`, {
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
    `${BASE}/${encodeURIComponent(agentId)}/tools/${encodeURIComponent(toolId)}`,
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
    `${BASE}/${encodeURIComponent(agentId)}/tools/${encodeURIComponent(toolId)}`,
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
