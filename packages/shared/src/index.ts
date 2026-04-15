export type ApiErrorCode =
  | "VALIDATION_ERROR"
  | "NOT_FOUND"
  | "FORBIDDEN"
  | "UNAUTHORIZED"
  | "INTERNAL_ERROR"
  | "CONFLICT"
  | "BAD_REQUEST";

export interface ApiErrorResponse {
  error: string;
  code: ApiErrorCode;
  details?: unknown;
}

export interface PaginatedResponse<T> {
  data: T[];
  nextCursor: string | null;
}

export interface AgentGrowerRow {
  email: string;
  name: string;
}

export interface AgentTechLeadRow {
  email: string;
  name: string;
}

export interface ImplementationTask {
  id: string;
  title: string;
  description?: string;
  status: "pending" | "completed";
  dueDate?: string | null;
  assigneeEmails: string[];
  createdByEmail?: string;
  createdAt?: string | null;
  updatedAt?: string | null;
  mandatory?: boolean;
  taskType?: string;
  attachments?: Array<{
    name: string;
    url: string;
    uploadedAt: string;
  }>;
  representativeEmail?: string | null;
  representativePhone?: string | null;
}

export {
  AGENT_BUILDER_MANDATORY_TOOL_NAMES,
  AGENT_BUILDER_MANDATORY_TOOLS_LLM_CONTEXT,
  type AgentBuilderMandatoryToolName,
} from "./agent-builder-mandatory-tools.js";

export interface ToolsCatalogItem {
  id: string;
  name: string;
  displayName: string;
  description: string;
  path: string;
  type: string;
  category: string;
  parameters?: Record<string, unknown>;
  properties?: Record<string, unknown>;
  crmConfig?: unknown;
}