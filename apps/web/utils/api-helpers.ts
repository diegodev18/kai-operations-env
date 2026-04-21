export async function parseJsonResponse<T>(res: Response): Promise<T | null> {
  try {
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

export function makeErrorResponse(message?: string): { ok: false; error: string } {
  return { ok: false, error: message ?? "Respuesta inválida del servidor" };
}
