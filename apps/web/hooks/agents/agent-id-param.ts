import { useParams } from "next/navigation";

export function useAgentIdParam(): string {
  const params = useParams();
  return typeof params.agentId === "string" ? params.agentId : "";
}
