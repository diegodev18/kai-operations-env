import { redirect } from "next/navigation";

export default async function AgentDetailIndexPage({
  params,
}: {
  params: Promise<{ agentId: string }>;
}) {
  const { agentId } = await params;
  redirect(`/agents/${encodeURIComponent(agentId)}/prompt-design`);
}
