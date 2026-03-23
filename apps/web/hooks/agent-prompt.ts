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
