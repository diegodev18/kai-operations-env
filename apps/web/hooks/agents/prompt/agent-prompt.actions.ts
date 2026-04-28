import { toast } from "sonner";

export async function updateAgentPrompt(params: {
  agentId: string;
  prompt: string;
}): Promise<string | null> {
  const { agentId, prompt } = params;
  try {
    const response = await fetch(
      `/api/agents/${encodeURIComponent(agentId)}/prompt`,
      {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify({ prompt }),
      },
    );

    if (!response.ok) {
      toast.error("No se pudo guardar el prompt del agente.");
      return null;
    }

    const data = (await response.json()) as { prompt: string };
    toast.success("Prompt del agente guardado correctamente.");

    return data.prompt;
  } catch {
    toast.error("Ocurrió un error al guardar el prompt del agente.");
    return null;
  }
}

export async function promotePromptToProduction(
  agentId: string,
  payload: {
    prompt: string;
    auth?: { auth: string; unauth: string };
    confirmation_agent_name: string;
    expected_testing_prompt?: string;
  },
): Promise<boolean> {
  try {
    const response = await fetch(
      `/api/agents/${encodeURIComponent(agentId)}/promote-prompt-to-production`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(payload),
      },
    );

    if (!response.ok) {
      const err = (await response.json()) as { error?: string };
      toast.error(err.error ?? "No se pudo subir el prompt a producción");
      return false;
    }

    return true;
  } catch {
    toast.error("Ocurrió un error al subir el prompt a producción");
    return false;
  }
}
