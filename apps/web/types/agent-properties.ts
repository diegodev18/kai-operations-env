/** Agent properties by document. Matches API GET /agents/:id/properties response. */
export interface AgentPropertiesResponse {
  /** Metadatos de despliegue (opcional; no enviar en PATCH de propiedades). */
  in_commercial?: boolean;
  in_production?: boolean;
  primary_source?: "commercial" | "production";
  agent: AgentPropertyDoc;
  ai: AiPropertyDoc;
  answer: AnswerPropertyDoc;
  response: ResponsePropertyDoc;
  time: TimePropertyDoc;
  prompt: PromptPropertyDoc;
  memory: MemoryPropertyDoc;
  mcp: McpPropertyDoc;
  limitation: LimitationPropertyDoc;
}

export interface AgentPropertyDoc {
  enabled?: boolean;
  isAuthEnable?: boolean;
  injectCommandsInPrompt?: boolean;
  isMemoryEnable?: boolean;
  isMultiMessageEnable?: boolean;
  isMultiMessageResponseEnable?: boolean;
  maxFunctionCalls?: number;
  omitFirstEchoes?: boolean;
  isValidatorAgentEnable?: boolean;
  excludedNumbers?: string[];
}

export interface AiPropertyDoc {
  model?: string;
  temperature?: number;
  thinking?: {
    budget?: number;
    includeThoughts: boolean;
    level?: string;
  };
}

export interface AnswerPropertyDoc {
  notSupport?: string;
}

export interface ResponsePropertyDoc {
  maxResponseLines?: number;
  maxResponseLinesEnabled?: boolean;
  waitTime?: number;
}

export interface TimePropertyDoc {
  zone?: string;
}

export interface PromptPropertyDoc {
  auth?: { auth?: string; unauth?: string };
  isMultiFunctionCallingEnable?: boolean;
  model?: string;
  temperature?: number;
}

export interface MemoryPropertyDoc {
  limit?: number;
}

export interface McpPropertyDoc {
  maxRetries?: number;
}

/** Lista blanca de números (MCP-KAI-AGENTS: properties/limitation). */
export interface LimitationPropertyDoc {
  allowedUsers?: string[];
  userLimitation?: boolean;
}

export type PropertyDocumentId =
  | "agent"
  | "ai"
  | "answer"
  | "response"
  | "time"
  | "prompt"
  | "memory"
  | "mcp"
  | "limitation";
