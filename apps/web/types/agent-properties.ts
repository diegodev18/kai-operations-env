/** Agent properties by document. Matches API GET /agents/:id/properties response. */
export interface AgentPropertiesResponse {
  agent: AgentPropertyDoc;
  ai: AiPropertyDoc;
  answer: AnswerPropertyDoc;
  response: ResponsePropertyDoc;
  time: TimePropertyDoc;
  prompt: PromptPropertyDoc;
  memory: MemoryPropertyDoc;
  mcp: McpPropertyDoc;
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

export type PropertyDocumentId =
  | "agent"
  | "ai"
  | "answer"
  | "response"
  | "time"
  | "prompt"
  | "memory"
  | "mcp";
