/** Cuerpo JSON para crear/actualizar documentos en `testing/data`. */
export interface TestingDataDocumentBody {
  data: Record<string, unknown>;
  merge?: boolean;
  docId?: string;
}

/** Timestamp serializado desde el cliente hacia la API. */
export interface SerializedFirestoreTimestamp {
  _seconds: number;
  _nanoseconds: number;
}

/** GeoPoint serializado desde el cliente hacia la API. */
export interface SerializedFirestoreGeoPoint {
  _latitude: number;
  _longitude: number;
}
