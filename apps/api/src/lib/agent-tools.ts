import { getFirestore } from "@/lib/firestore";
import { resolveAgentWriteDatabase } from "@/utils/agents";

interface ParamProperty {
  description?: string;
  required?: boolean;
  type?: string;
}

interface ToolDoc {
  description?: string;
  enabled?: boolean;
  name?: string;
  parameters?: ToolParams;
}

interface ToolParams {
  properties?: Record<string, ParamProperty>;
  required?: string[];
}

/**
 * Lee tools del agente en Firestore y devuelve texto para el asistente de prompt.
 */
export async function getAgentToolsContext(agentId: string): Promise<string> {
  try {
    const database = getFirestore();
    const snapshot = await database
      .collection("agent_configurations")
      .doc(agentId)
      .collection("tools")
      .get();

    if (snapshot.empty) return "";

    const blocks: string[] = [];

    for (const doc of snapshot.docs) {
      const data = doc.data() as ToolDoc;
      if (data.enabled === false) continue;
      const name = typeof data.name === "string" ? data.name : doc.id;
      const description =
        typeof data.description === "string" ? data.description : "";
      const params = data.parameters;
      const paramLines =
        params != null && typeof params === "object"
          ? formatToolParameters(params)
          : [];

      blocks.push(`Tool: ${name}`);
      blocks.push(`Description: ${description || "(no description)"}`);
      if (paramLines.length > 0) {
        blocks.push("Parameters (use these exact names in examples):");
        blocks.push(paramLines.join("\n"));
      }
      blocks.push("");
    }

    return blocks.join("\n").trimEnd();
  } catch {
    return "";
  }
}

export type AgentToolForChat = {
  id: string;
  name: string;
  displayName?: string;
  description: string;
  enabled: boolean;
};

/**
 * Fetches agent tools for use in the prompt designer tool-calling flow.
 * Respects testing vs production path via resolveAgentWriteDatabase.
 */
export async function fetchAgentToolsForPromptChat(
  agentId: string,
): Promise<AgentToolForChat[] | null> {
  try {
    const { db, hasTestingData, inProduction } =
      await resolveAgentWriteDatabase(agentId);
    if (!hasTestingData && !inProduction) return null;

    const agentRef = db.collection("agent_configurations").doc(agentId);
    const toolsRef = hasTestingData
      ? agentRef.collection("testing").doc("data").collection("tools")
      : agentRef.collection("tools");

    const snapshot = await toolsRef.get();
    if (snapshot.empty) return [];

    const tools: AgentToolForChat[] = [];
    for (const doc of snapshot.docs) {
      const data = doc.data() as {
        description?: string;
        displayName?: string;
        enabled?: boolean;
        name?: string;
      };
      if (data.enabled === false) continue;
      tools.push({
        description: typeof data.description === "string" ? data.description : "",
        displayName:
          typeof data.displayName === "string" ? data.displayName : undefined,
        enabled: true,
        id: doc.id,
        name: typeof data.name === "string" ? data.name : doc.id,
      });
    }
    return tools;
  } catch {
    return null;
  }
}

export type AgentSimulatorConversationForChat = {
  id: string;
  testPrompt: string;
  messages: { role: string; content: string }[];
  hasError: boolean;
};

export async function fetchSimulatorConversationsForPromptChat(
  agentId: string,
  userId: string,
): Promise<AgentSimulatorConversationForChat[] | null> {
  if (!userId) return null;
  try {
    const { db, hasTestingData, inProduction } =
      await resolveAgentWriteDatabase(agentId);
    if (!hasTestingData && !inProduction) return null;

    const snap = await db
      .collection("agent_configurations")
      .doc(agentId)
      .collection("implementation")
      .doc("simulator")
      .collection("users")
      .doc(userId)
      .get();

    if (!snap.exists) return [];

    const data = snap.data() as { conversations?: unknown } | undefined;
    if (!Array.isArray(data?.conversations)) return [];

    const raw = data.conversations as Array<{
      id?: string;
      prompt?: string;
      streamEvents?: unknown[];
      error?: string | null;
      closedAt?: string | null;
    }>;

    const result: AgentSimulatorConversationForChat[] = [];

    for (const conv of raw.slice(-3)) {
      if (!conv.id) continue;
      const messages: { role: string; content: string }[] = [];
      for (const event of (conv.streamEvents ?? []).slice(-30)) {
        const e = event as { type?: string; data?: { role?: string; content?: string } };
        if (e.type !== "message" || !e.data) continue;
        const role = typeof e.data.role === "string" ? e.data.role : "user";
        const content = typeof e.data.content === "string" ? e.data.content : "";
        if (content) messages.push({ role, content });
        if (messages.length >= 15) break;
      }
      if (messages.length === 0) continue;
      result.push({
        id: conv.id,
        testPrompt: typeof conv.prompt === "string" ? conv.prompt : "",
        messages,
        hasError: !!conv.error,
      });
    }

    return result;
  } catch {
    return null;
  }
}

export type AgentRealConversationForChat = {
  chatId: string;
  messages: { role: string; content: string; timestamp?: string }[];
};

export async function fetchRealConversationsForPromptChat(
  agentId: string,
): Promise<AgentRealConversationForChat[] | null> {
  try {
    const database = getFirestore();
    const chatsSnap = await database
      .collection("agent_configurations")
      .doc(agentId)
      .collection("chats")
      .orderBy("updatedAt", "desc")
      .limit(3)
      .get();

    if (chatsSnap.empty) return [];

    const result: AgentRealConversationForChat[] = [];

    for (const chatDoc of chatsSnap.docs) {
      const messagesSnap = await database
        .collection("agent_configurations")
        .doc(agentId)
        .collection("chats")
        .doc(chatDoc.id)
        .collection("messages")
        .where("status", "==", "show")
        .orderBy("createdAt", "desc")
        .limit(15)
        .get();

      if (messagesSnap.empty) continue;

      const messages: { role: string; content: string; timestamp?: string }[] = [];
      for (const msgDoc of messagesSnap.docs.reverse()) {
        const d = msgDoc.data() as {
          role?: string;
          content?: string;
          messageCase?: string;
          createdAt?: { toDate?: () => Date };
        };
        const mc = d.messageCase ?? "";
        if (mc !== "user_message" && mc !== "model_response") continue;
        const content = typeof d.content === "string" ? d.content.trim() : "";
        if (!content) continue;
        const role = d.role === "model" ? "model" : "user";
        const timestamp = d.createdAt?.toDate?.()?.toISOString();
        messages.push({ role, content, ...(timestamp ? { timestamp } : {}) });
      }

      if (messages.length === 0) continue;
      result.push({ chatId: chatDoc.id, messages });
    }

    return result;
  } catch {
    return null;
  }
}

function formatToolParameters(params: ToolParams): string[] {
  const properties = params.properties;
  if (!properties || typeof properties !== "object" || Array.isArray(properties))
    return [];

  const requiredSet = new Set(
    Array.isArray(params.required) ? params.required : [],
  );
  const lines: string[] = [];

  for (const [key, prop] of Object.entries(properties)) {
    if (typeof prop !== "object") continue;
    const type =
      typeof prop.type === "string" ? prop.type.toLowerCase() : "string";
    const description =
      typeof prop.description === "string" ? prop.description : "";
    const isRequired =
      requiredSet.has(key) ||
      (typeof prop.required === "boolean" && prop.required);
    const requiredLabel = isRequired ? "required" : "optional";
    const descPart = description ? `: ${description}` : "";
    lines.push(`  - ${key} (${type}, ${requiredLabel})${descPart}`);
  }

  return lines;
}
