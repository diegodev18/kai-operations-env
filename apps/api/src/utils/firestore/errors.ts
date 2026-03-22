export const isFirebaseConfigError = (e: unknown): boolean =>
  e instanceof Error && e.message.includes("Credenciales Firebase");

export function extractFirestoreIndexUrl(message: string): string | undefined {
  const m = message.match(/https:\/\/console\.firebase\.google\.com\/[^\s)'"]+/);
  return m?.[0];
}

/** Mensaje legible para errores de Firestore (p. ej. índice faltante en collection group). */
export function firestoreFailureHint(error: unknown): string | null {
  const msg = error instanceof Error ? error.message : String(error);
  if (
    /FAILED_PRECONDITION|failed-precondition|\bcode.?9\b|requires an index/i.test(
      msg,
    )
  ) {
    return "Firestore necesita un índice de collection group para growers (email + __name__). En apps/api, con Firebase CLI vinculado al proyecto: firebase deploy --only firestore:indexes (usa firebase.json). O abre el enlace createIndexUrl si viene en la respuesta.";
  }
  if (/PERMISSION_DENIED|permission denied|7:/i.test(msg)) {
    return "Permiso denegado en Firestore: revisa que la cuenta de servicio tenga rol de lectura en el proyecto correcto.";
  }
  if (/UNAVAILABLE|DEADLINE_EXCEEDED|ECONNREFUSED/i.test(msg)) {
    return "No se pudo conectar a Firestore (red o servicio temporalmente no disponible).";
  }
  return null;
}
