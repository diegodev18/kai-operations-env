import { redirect } from "next/navigation";

export default async function AgentImplementationPage({
  params,
}: {
  params: Promise<{ agentId: string }>;
}) {
  const { agentId } = await params;
  redirect(`/agents/${encodeURIComponent(agentId)}/tasks`);
}
