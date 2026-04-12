import type { Context } from "hono";

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

export function errorResponse(
  c: Context,
  message: string,
  code: ApiErrorCode,
  status: 400 | 401 | 403 | 404 | 409 | 500 = 400,
  details?: unknown,
): Response {
  return c.json(
    {
      error: message,
      code,
      ...(details !== undefined && { details }),
    } as ApiErrorResponse,
    status,
  );
}

export const ApiErrors = {
  validation: (c: Context, message: string, details?: unknown) =>
    errorResponse(c, message, "VALIDATION_ERROR", 400, details),

  badRequest: (c: Context, message: string, details?: unknown) =>
    errorResponse(c, message, "BAD_REQUEST", 400, details),

  notFound: (c: Context, message: string) =>
    errorResponse(c, message, "NOT_FOUND", 404),

  forbidden: (c: Context, message: string) =>
    errorResponse(c, message, "FORBIDDEN", 403),

  unauthorized: (c: Context, message: string = "No autenticado") =>
    errorResponse(c, message, "UNAUTHORIZED", 401),

  internal: (c: Context, message: string = "Error interno", details?: unknown) =>
    errorResponse(c, message, "INTERNAL_ERROR", 500, details),

  conflict: (c: Context, message: string, details?: unknown) =>
    errorResponse(c, message, "CONFLICT", 409, details),
} as const;