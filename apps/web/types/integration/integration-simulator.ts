/** Tipos del simulador de integración (POST /api/agents-testing/simulate). */

export type SimulatorMode = "questions_only" | "full";

export type ValidatorMode = "on" | "off" | "agent";

export type SimulateBody = {
  config: {
    AGENT_DOC_ID: string;
    AGENT_LONG_LIVED_TOKEN?: string;
    AGENT_PHONE_NUMBER_ID?: string;
  };
  agent: {
    message?: { limit: number };
    personality?: { limit: number };
    prompt?: string;
    simulatorMode?: SimulatorMode;
  };
  enableTools?: boolean;
  stream?: boolean;
  testingMode?: boolean;
  enableValidator?: boolean;
};

export type SSEMessage = {
  content?: string;
  role?: string;
  personality?: string;
  functionCalls?: unknown[];
  tools?: unknown[];
};

export type SSEEvent =
  | { type: "start"; message: string; personalityCount: number }
  | { type: "message"; data: SSEMessage }
  | {
      type: "personality";
      personality: string;
      conversacion: unknown[];
      analisis: unknown;
    }
  | {
      type: "done";
      chat?: unknown;
      results?: unknown;
      conversationAnalysis?: unknown;
    };
