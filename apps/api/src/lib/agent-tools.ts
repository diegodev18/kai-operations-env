import { getFirestore } from "@/lib/firestore";

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
