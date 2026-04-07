import { Hono } from "hono";

import {
  actualizarDocumento,
  clonarRecursivo,
  duplicarColeccion,
  duplicarDocumento,
  getDocument,
  getDocumentos,
  listSubcollections,
  previewCollection,
  subirDocumentos,
} from "@/controllers/database.controller";

const databaseRouter = new Hono();

databaseRouter.get("/coleccion/preview", previewCollection);
databaseRouter.get("/documento", getDocument);
databaseRouter.get("/documento/subcolecciones", listSubcollections);
databaseRouter.post("/documentos", getDocumentos);
databaseRouter.post("/documento/actualizar", actualizarDocumento);
databaseRouter.post("/subir", subirDocumentos);
databaseRouter.post("/duplicar/coleccion", duplicarColeccion);
databaseRouter.post("/duplicar/documento", duplicarDocumento);
databaseRouter.post("/clonar-recursivo", clonarRecursivo);

export default databaseRouter;