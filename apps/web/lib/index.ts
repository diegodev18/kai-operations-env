/** Barrel público de `lib/` (mismo patrón que `@/hooks`). Preferir `import { … } from "@/lib"`. */

export { authClient } from "./auth/auth-client";
export { cn } from "./utils";

export type {
  AgentOperationalStatus,
  AgentBilling,
  PaymentRecord,
  GrowerRef,
  Agent,
  AgentWithOperations,
} from "./agents/agent";
export { DEFAULT_AGENT_BILLING, toAgentWithOperations } from "./agents/agent";

export * from "./form-builder/builder-technical-properties";
export * from "./blog/lesson-markdown";
export * from "./profile/github-avatar";
export * from "./phone/whatsapp-phone-format";
