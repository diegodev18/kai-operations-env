export interface ActualizarDocumentoBody {
  datosActualizados: Record<string, unknown>;
  opciones?: { merge?: boolean };
  rutaDocumento: string;
}

export interface DuplicacionLog {
  documentos: { error?: string; estado: string; id: string; razon?: string }[];
  errores: { documento?: string; error: string; ruta?: string }[];
  operacion: string;
  proyectoDestino: string;
  proyectoOrigen: string;
  resumen: { exitosos: number; fallidos: number; omitidos: number; total: number };
  rutaDestino: string;
  rutaOrigen: string;
  timestamp: string;
}

export interface DuplicarBody {
  opciones?: { excluirColecciones?: string[]; recursivo?: boolean; sobrescribir?: boolean };
  proyectoDestino: string;
  proyectoOrigen: string;
  rutaDestino: string;
  rutaOrigen: string;
}

export interface ResultadosSubida {
  documentos: {
    error?: string;
    estado: "exitoso" | "fallido" | "omitido";
    id: string;
    nombre: string;
  }[];
  errores: { documento: string; error: string }[];
  exitosos: number;
  fallidos: number;
  omitidos: number;
}

export interface SubirBody {
  datos: Record<string, unknown> | unknown[];
  opciones?: { merge?: boolean; sobrescribir?: boolean };
  rutaColeccion: string;
}

export interface GetDocumentosItem {
  environment: "production" | "testing";
  rutaDocumento: string;
}

export interface GetDocumentosBody {
  items: GetDocumentosItem[];
}
