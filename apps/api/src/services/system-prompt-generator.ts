import { GoogleGenAI } from "@google/genai";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { z } from "zod";

import logger, { formatError } from "@/lib/logger";

const MODEL = "gemini-2.5-pro";

const {
  FIREBASE_SERVICE_ACCOUNT_JSON,
  FIREBASE_SERVICE_ACCOUNT_JSON_PRODUCTION,
  VERTEX_AI_LOCATION,
  VERTEX_AI_PROJECT,
} = process.env;

const defaultCredsPath =
  typeof import.meta.dir !== "undefined"
    ? join(import.meta.dir, "..", "tokens", "firestore.json")
    : join(process.cwd(), "src", "tokens", "firestore.json");

const productionCredsPath = defaultCredsPath
  ? join(dirname(defaultCredsPath), "firebase.production.json")
  : null;

function getVertexCredsPath(): null | string {
  if (productionCredsPath && existsSync(productionCredsPath))
    return productionCredsPath;
  return null;
}

let aiInstance: GoogleGenAI | null = null;

function getAiInstance(): GoogleGenAI | null {
  if (aiInstance) return aiInstance;
  if (!VERTEX_AI_PROJECT || !VERTEX_AI_LOCATION) return null;
  try {
    const credsPath = getVertexCredsPath();
    if (!credsPath) {
      logger.error("system-prompt-generator: Vertex credentials missing");
      return null;
    }
    process.env.GOOGLE_APPLICATION_CREDENTIALS = credsPath;
    aiInstance = new GoogleGenAI({
      location: VERTEX_AI_LOCATION,
      project: VERTEX_AI_PROJECT,
      vertexai: true,
    });
    return aiInstance;
  } catch {
    return null;
  }
}

function extractTextFromModelResponse(response: unknown): string {
  const candidates = (
    response as { candidates?: Array<{ content?: { parts?: unknown[] } }> }
  )?.candidates;
  const parts = candidates?.[0]?.content?.parts;
  if (!Array.isArray(parts)) return "";
  const chunks: string[] = [];
  for (const part of parts) {
    if (
      part != null &&
      typeof part === "object" &&
      "text" in part &&
      typeof (part as { text?: unknown }).text === "string"
    ) {
      chunks.push((part as { text: string }).text);
    }
  }
  return chunks.join("").trim();
}

function stripMarkdownFences(input: string): string {
  const trimmed = input.trim();
  if (!trimmed.startsWith("```")) return trimmed;
  return trimmed
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "")
    .trim();
}

function extractBalancedJsonObject(input: string): string | null {
  const text = input.trim();
  const start = text.indexOf("{");
  if (start < 0) return null;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (ch === "\\") {
      escaped = true;
      continue;
    }
    if (ch === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;
    if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }
  return null;
}

function parseCandidateJson(raw: string): unknown | null {
  const candidates = [
    raw,
    stripMarkdownFences(raw),
    extractBalancedJsonObject(raw) ?? "",
  ]
    .map((x) => x.trim())
    .filter(Boolean);
  for (const candidate of candidates) {
    try {
      return JSON.parse(candidate);
    } catch {
      // continue
    }
  }
  return null;
}

const draftOutputSchema = z.object({
  system_prompt: z.string().min(1),
});

const critiqueOutputSchema = z.object({
  issues: z.array(z.string()).default([]),
  rewrite_instructions: z.string().min(1),
});

const BANNED_FRAGMENTS = [
  "MCP-KAI-AGENTS",
  "kaiAgents",
  "defaultSystemPrompt",
  "You are a friendly customer service assistant",
] as const;

export type BuilderContextPayload = {
  draftRoot: Record<string, unknown>;
  tools: Array<Record<string, unknown>>;
  technicalProperties: Record<string, Record<string, unknown>>;
  builderLanguageNote: string;
};

export function validateGeneratedSystemPrompt(text: string): {
  ok: true;
} | { ok: false; reason: string } {
  const t = text.trim();
  if (t.length < 350) {
    return { ok: false, reason: "Prompt demasiado corto para despliegue." };
  }
  const lower = t.toLowerCase();
  for (const frag of BANNED_FRAGMENTS) {
    if (lower.includes(frag.toLowerCase())) {
      return {
        ok: false,
        reason: `El prompt no debe incluir referencias internas o plantillas prohibidas (${frag}).`,
      };
    }
  }
  return { ok: true };
}

async function generateJsonPhase(
  ai: GoogleGenAI,
  systemInstruction: string,
  userText: string,
  temperature: number,
): Promise<string> {
  const res = await ai.models.generateContent({
    model: MODEL,
    contents: userText,
    config: {
      systemInstruction,
      temperature,
    } as never,
  });
  return extractTextFromModelResponse(res);
}

/**
 * Genera un system prompt listo para `mcp_configuration.system_prompt` (Gemini en runtime).
 * Pipeline: draft → critique → rewrite; modo elite = segunda rúbrica de critique antes del rewrite final.
 */
export async function generateSystemPromptMultiPhase(
  context: BuilderContextPayload,
  options?: { elite?: boolean },
): Promise<{ system_prompt: string } | { error: string }> {
  const ai = getAiInstance();
  if (!ai) {
    return {
      error:
        "Vertex AI no configurado (VERTEX_AI_PROJECT, VERTEX_AI_LOCATION, credenciales).",
    };
  }

  const elite =
    options?.elite === true ||
    process.env.SYSTEM_PROMPT_GENERATION_ELITE === "1" ||
    process.env.SYSTEM_PROMPT_GENERATION_ELITE === "true";

  const contextJson = JSON.stringify(context, null, 2);

  const phase1System = `You are a principal prompt engineer for Google Gemini deployed as a WhatsApp/business automation agent.
You write the FINAL system prompt text that will be stored in Firestore as mcp_configuration.system_prompt (a single string).

Hard rules:
- Output language for the system prompt itself: English (clear, operational).
- If builderLanguageNote or user content requires EXACT phrases (trademarks, legal lines, greetings), keep those phrases verbatim in their original language inside clearly marked sections (e.g. "Exact phrases (do not paraphrase):").
- Do NOT paste, quote, or imitate default prompts from any internal repo (never mention MCP-KAI-AGENTS, webhook boilerplate, or framework defaults).
- Optimize for Gemini: explicit role, boundaries, tool-use discipline, grounding rules (only state facts consistent with provided context; if unknown, say you do not have that information), no hallucinated policies or APIs.
- Be specific to the business and tools in the JSON context; no generic platitudes.
- No contradictions: one coherent tone, one set of escalation rules.
- The deployed agent is NOT the builder UI—write instructions for the live assistant.

Return STRICT JSON only: {"system_prompt": "<full multi-line string with escaped newlines>"}
The system_prompt value must be plain text suitable for a single Firestore string (use \\n escapes in JSON for newlines).`;

  try {
    const raw1 = await generateJsonPhase(
      ai,
      phase1System,
      `Build the first draft system prompt from this builder snapshot:\n${contextJson}`,
      0.25,
    );
    const parsed1 = parseCandidateJson(raw1);
    const d1 = draftOutputSchema.safeParse(parsed1);
    if (!d1.success) {
      return { error: "Fase draft: JSON inválido del modelo." };
    }
    let draftPrompt = d1.data.system_prompt.replace(/\\n/g, "\n").trim();

    const critiqueSystem = `You are a strict reviewer of system prompts for Gemini agents.
Given the BUILDER CONTEXT (JSON) and the DRAFT SYSTEM PROMPT, find concrete problems: contradictions, ambiguity, missing guardrails, hallucination risk, unclear tool usage, wrong language rules, or missing business specifics.

Return STRICT JSON only:
{"issues": string[], "rewrite_instructions": string}
issues: short bullet strings; rewrite_instructions: one consolidated instruction block for the editor.`;

    const runCritique = async (label: string, draft: string) => {
      const raw = await generateJsonPhase(
        ai,
        critiqueSystem,
        `(${label})\nCONTEXT:\n${contextJson}\n\nDRAFT SYSTEM PROMPT:\n${draft}`,
        0.15,
      );
      const p = parseCandidateJson(raw);
      return critiqueOutputSchema.safeParse(p);
    };

    const critPrimary = await runCritique("critique_primary", draftPrompt);
    if (!critPrimary.success) {
      return { error: "Fase critique: JSON inválido del modelo." };
    }
    let issues = [...critPrimary.data.issues];
    let rewriteInstructions = critPrimary.data.rewrite_instructions;
    if (elite) {
      const critElite = await runCritique("critique_elite", draftPrompt);
      if (critElite.success) {
        issues = [...issues, ...critElite.data.issues];
        rewriteInstructions = `${rewriteInstructions}\n\nAdditional elite review:\n${critElite.data.rewrite_instructions}`;
      }
    }

    const rewriteSystem = `You are a prompt engineer. Rewrite the DRAFT SYSTEM PROMPT into a final version that fully applies the rewrite_instructions and fixes every issue.
Keep English as the base language; preserve exact-phrase blocks as required.
Return STRICT JSON only: {"system_prompt": "..."} with \\n escapes for newlines inside the JSON string.`;

    const raw3 = await generateJsonPhase(
      ai,
      rewriteSystem,
      `ISSUES:\n${JSON.stringify(issues)}\n\nINSTRUCTIONS:\n${rewriteInstructions}\n\nDRAFT:\n${draftPrompt}`,
      0.2,
    );
    const parsed3 = parseCandidateJson(raw3);
    const d3 = draftOutputSchema.safeParse(parsed3);
    if (!d3.success) {
      return { error: "Fase rewrite: JSON inválido del modelo." };
    }
    let finalPrompt = d3.data.system_prompt.replace(/\\n/g, "\n").trim();

    let validation = validateGeneratedSystemPrompt(finalPrompt);
    if (!validation.ok) {
      const rawFix = await generateJsonPhase(
        ai,
        `Fix the system prompt so it passes validation: ${validation.reason}. Return STRICT JSON {"system_prompt":"..."} only.`,
        `BROKEN PROMPT:\n${finalPrompt}\n\nBUILDER CONTEXT (summary):\n${contextJson.slice(0, 12000)}`,
        0.1,
      );
      const pFix = parseCandidateJson(rawFix);
      const f = draftOutputSchema.safeParse(pFix);
      if (f.success) {
        finalPrompt = f.data.system_prompt.replace(/\\n/g, "\n").trim();
        validation = validateGeneratedSystemPrompt(finalPrompt);
      }
      if (!validation.ok) {
        return { error: validation.reason };
      }
    }

    return { system_prompt: finalPrompt };
  } catch (err) {
    logger.error("generateSystemPromptMultiPhase", formatError(err));
    return {
      error:
        err instanceof Error ? err.message : "Error desconocido en generación.",
    };
  }
}
