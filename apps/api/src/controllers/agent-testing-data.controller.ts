import type { Context } from "hono";

import admin from "firebase-admin";

import { getFirestore } from "@/lib/firestore";
import type { AgentsInfoAuthContext } from "@/types/agents";
import { userCanEditAgent } from "@/utils/agents/agentAccess";

interface DocumentBody {
  data: Record<string, unknown>;
  merge?: boolean;
}

interface SerializedTimestamp {
  _seconds: number;
  _nanoseconds: number;
}

interface SerializedGeoPoint {
  _latitude: number;
  _longitude: number;
}

function isSerializedTimestamp(value: unknown): value is SerializedTimestamp {
  return (
    typeof value === "object" &&
    value !== null &&
    "_seconds" in value &&
    "_nanoseconds" in value &&
    typeof (value as SerializedTimestamp)._seconds === "number" &&
    typeof (value as SerializedTimestamp)._nanoseconds === "number"
  );
}

function isSerializedGeoPoint(value: unknown): value is SerializedGeoPoint {
  return (
    typeof value === "object" &&
    value !== null &&
    "_latitude" in value &&
    "_longitude" in value &&
    typeof (value as SerializedGeoPoint)._latitude === "number" &&
    typeof (value as SerializedGeoPoint)._longitude === "number"
  );
}

function isSerializedDocumentRef(value: unknown): value is { _path: string } {
  return (
    typeof value === "object" &&
    value !== null &&
    "_path" in value &&
    typeof (value as { _path: unknown })._path === "string"
  );
}

function restoreFirestoreTypes(value: unknown): unknown {
  if (value === null || value === undefined) return value;
  if (isSerializedTimestamp(value)) {
    return new admin.firestore.Timestamp(value._seconds, value._nanoseconds);
  }
  if (isSerializedGeoPoint(value)) {
    return new admin.firestore.GeoPoint(value._latitude, value._longitude);
  }
  if (isSerializedDocumentRef(value)) {
    return admin.firestore().doc(value._path);
  }
  if (Array.isArray(value)) {
    return value.map(restoreFirestoreTypes);
  }
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(value as Record<string, unknown>)) {
      out[key] = restoreFirestoreTypes((value as Record<string, unknown>)[key]);
    }
    return out;
  }
  return value;
}

function serializeFirestoreValue(value: unknown): unknown {
  if (value === null || value === undefined) return value;
  if (value instanceof admin.firestore.Timestamp) {
    return { _seconds: value.seconds, _nanoseconds: value.nanoseconds };
  }
  if (value instanceof admin.firestore.GeoPoint) {
    return { _latitude: value.latitude, _longitude: value.longitude };
  }
  if (value instanceof admin.firestore.DocumentReference) {
    return { _path: value.path };
  }
  if (Array.isArray(value)) {
    return value.map(serializeFirestoreValue);
  }
  if (typeof value === "object") {
    const v = value as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(v)) {
      out[key] = serializeFirestoreValue(v[key]);
    }
    return out;
  }
  return value;
}

function getTestingDataRef(agentId: string) {
  const db = getFirestore();
  return db.collection("agent_configurations").doc(agentId).collection("testing").doc("data");
}

export async function listTestingDataCollections(authCtx: AgentsInfoAuthContext, c: Context) {
  const agentId = c.req.param("agentId")?.trim() ?? "";
  if (!agentId) {
    return c.json({ error: "Agent ID requerido" }, 400);
  }

  const hasAccess = await userCanEditAgent(authCtx, agentId);
  if (!hasAccess) {
    return c.json({ error: "No tienes acceso a este agente" }, 403);
  }

  try {
    const db = getFirestore();
    const testingDataRef = db.collection("agent_configurations").doc(agentId).collection("testing").doc("data");
    
    const docSnap = await testingDataRef.get();
    if (!docSnap.exists) {
      return c.json({ collections: [] });
    }
    
    const collections = await testingDataRef.listCollections();
    const collectionNames = collections.map((col) => col.id);

    return c.json({ collections: collectionNames });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return c.json({ error: "Error listando colecciones", details: message }, 500);
  }
}

export async function listTestingDataSubcollections(authCtx: AgentsInfoAuthContext, c: Context) {
  const agentId = c.req.param("agentId")?.trim() ?? "";
  const collection = c.req.param("collection")?.trim() ?? "";
  
  if (!agentId || !collection) {
    return c.json({ error: "Agent ID y collection requeridos" }, 400);
  }

  const hasAccess = await userCanEditAgent(authCtx, agentId);
  if (!hasAccess) {
    return c.json({ error: "No tienes acceso a este agente" }, 403);
  }

  try {
    const db = getFirestore();
    const parentRef = db.collection("agent_configurations").doc(agentId).collection("testing").doc("data").collection(collection);
    
    const collections = await parentRef.listCollections();
    const collectionNames = collections.map((col) => col.id);

    return c.json({ collections: collectionNames });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return c.json({ error: "Error listando subcolecciones", details: message }, 500);
  }
}

export async function listTestingDataDocuments(authCtx: AgentsInfoAuthContext, c: Context) {
  const agentId = c.req.param("agentId")?.trim() ?? "";
  const collection = c.req.param("collection")?.trim() ?? "";

  if (!agentId || !collection) {
    return c.json({ error: "Agent ID y collection requeridos" }, 400);
  }

  const hasAccess = await userCanEditAgent(authCtx, agentId);
  if (!hasAccess) {
    return c.json({ error: "No tienes acceso a este agente" }, 403);
  }

  try {
    const testingDataRef = getTestingDataRef(agentId);
    const colRef = testingDataRef.collection(collection);
    const snapshot = await colRef.get();

    const documents = snapshot.docs.map((doc) => ({
      id: doc.id,
      data: serializeFirestoreValue(doc.data()),
    }));

    return c.json({ documents });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return c.json({ error: "Error listando documentos", details: message }, 500);
  }
}

export async function getTestingDataDocument(authCtx: AgentsInfoAuthContext, c: Context) {
  const agentId = c.req.param("agentId")?.trim() ?? "";
  const collection = c.req.param("collection")?.trim() ?? "";
  const docId = c.req.param("docId")?.trim() ?? "";

  if (!agentId || !collection || !docId) {
    return c.json({ error: "Agent ID, collection y docId requeridos" }, 400);
  }

  const hasAccess = await userCanEditAgent(authCtx, agentId);
  if (!hasAccess) {
    return c.json({ error: "No tienes acceso a este agente" }, 403);
  }

  try {
    const testingDataRef = getTestingDataRef(agentId);
    const docRef = testingDataRef.collection(collection).doc(docId);
    const snapshot = await docRef.get();

    if (!snapshot.exists) {
      return c.json({ error: "Documento no encontrado" }, 404);
    }

    return c.json({
      id: snapshot.id,
      data: serializeFirestoreValue(snapshot.data()),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return c.json({ error: "Error obteniendo documento", details: message }, 500);
  }
}

export async function createTestingDataDocument(authCtx: AgentsInfoAuthContext, c: Context) {
  const agentId = c.req.param("agentId")?.trim() ?? "";
  const collection = c.req.param("collection")?.trim() ?? "";

  if (!agentId || !collection) {
    return c.json({ error: "Agent ID y collection requeridos" }, 400);
  }

  const hasAccess = await userCanEditAgent(authCtx, agentId);
  if (!hasAccess) {
    return c.json({ error: "No tienes acceso a este agente" }, 403);
  }

  let body: DocumentBody;
  try {
    body = await c.req.json<DocumentBody>();
  } catch {
    return c.json({ error: "Body JSON inválido" }, 400);
  }

  const { data, merge } = body;

  if (!data || typeof data !== "object" || Array.isArray(data)) {
    return c.json({ error: "data debe ser un objeto" }, 400);
  }

  try {
    const testingDataRef = getTestingDataRef(agentId);
    const colRef = testingDataRef.collection(collection);
    const docRef = colRef.doc();

    const restoredData = restoreFirestoreTypes(data) as Record<string, unknown>;

    if (merge) {
      await docRef.set(restoredData, { merge: true });
    } else {
      await docRef.set(restoredData);
    }

    return c.json({
      id: docRef.id,
      data: serializeFirestoreValue(restoredData),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return c.json({ error: "Error creando documento", details: message }, 500);
  }
}

export async function updateTestingDataDocument(authCtx: AgentsInfoAuthContext, c: Context) {
  const agentId = c.req.param("agentId")?.trim() ?? "";
  const collection = c.req.param("collection")?.trim() ?? "";
  const docId = c.req.param("docId")?.trim() ?? "";

  if (!agentId || !collection || !docId) {
    return c.json({ error: "Agent ID, collection y docId requeridos" }, 400);
  }

  const hasAccess = await userCanEditAgent(authCtx, agentId);
  if (!hasAccess) {
    return c.json({ error: "No tienes acceso a este agente" }, 403);
  }

  let body: DocumentBody;
  try {
    body = await c.req.json<DocumentBody>();
  } catch {
    return c.json({ error: "Body JSON inválido" }, 400);
  }

  const { data, merge } = body;

  if (!data || typeof data !== "object" || Array.isArray(data)) {
    return c.json({ error: "data debe ser un objeto" }, 400);
  }

  try {
    const testingDataRef = getTestingDataRef(agentId);
    const docRef = testingDataRef.collection(collection).doc(docId);

    const docSnap = await docRef.get();
    if (!docSnap.exists) {
      return c.json({ error: "Documento no encontrado" }, 404);
    }

    const restoredData = restoreFirestoreTypes(data) as Record<string, unknown>;

    if (merge) {
      await docRef.set(restoredData, { merge: true });
    } else {
      await docRef.set(restoredData);
    }

    const updatedSnap = await docRef.get();

    return c.json({
      id: updatedSnap.id,
      data: serializeFirestoreValue(updatedSnap.data()),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return c.json({ error: "Error actualizando documento", details: message }, 500);
  }
}

export async function deleteTestingDataDocument(authCtx: AgentsInfoAuthContext, c: Context) {
  const agentId = c.req.param("agentId")?.trim() ?? "";
  const collection = c.req.param("collection")?.trim() ?? "";
  const docId = c.req.param("docId")?.trim() ?? "";

  if (!agentId || !collection || !docId) {
    return c.json({ error: "Agent ID, collection y docId requeridos" }, 400);
  }

  const hasAccess = await userCanEditAgent(authCtx, agentId);
  if (!hasAccess) {
    return c.json({ error: "No tienes acceso a este agente" }, 403);
  }

  try {
    const testingDataRef = getTestingDataRef(agentId);
    const docRef = testingDataRef.collection(collection).doc(docId);

    const docSnap = await docRef.get();
    if (!docSnap.exists) {
      return c.json({ error: "Documento no encontrado" }, 404);
    }

    await docRef.delete();

    return c.json({ message: "Documento eliminado", id: docId });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return c.json({ error: "Error eliminando documento", details: message }, 500);
  }
}
