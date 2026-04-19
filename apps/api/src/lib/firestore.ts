import { readFileSync } from "node:fs";
import { join } from "node:path";

import admin from "firebase-admin";
import {
  FieldValue,
  Timestamp,
  initializeFirestore,
  type Firestore,
} from "firebase-admin/firestore";

import { FIREBASE_APP_NAME } from "@/config";

const TOKEN_FILE_PRODUCTION = "firebase.production.json";
const TOKEN_FILE_TESTING = "firebase.testing.json";

export { FieldValue, Timestamp };

export type FirestoreEnvironment = "production" | "testing";

function getTokensDir(): string {
  return typeof import.meta.dir !== "undefined"
    ? join(import.meta.dir, "..", "tokens")
    : join(process.cwd(), "src", "tokens");
}

function loadServiceAccountProduction(): admin.ServiceAccount | null {
  const envJson =
    process.env.FIREBASE_SERVICE_ACCOUNT_JSON_PRODUCTION ??
    process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (envJson) {
    try {
      return JSON.parse(envJson) as admin.ServiceAccount;
    } catch {
      return null;
    }
  }

  const filePath = join(getTokensDir(), TOKEN_FILE_PRODUCTION);
  try {
    const raw = readFileSync(filePath, "utf-8");
    if (!raw.trim()) return null;
    return JSON.parse(raw) as admin.ServiceAccount;
  } catch {
    return null;
  }
}

function loadServiceAccountTesting(): admin.ServiceAccount | null {
  const envJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON_TESTING;
  if (envJson) {
    try {
      return JSON.parse(envJson) as admin.ServiceAccount;
    } catch {
      return null;
    }
  }

  const filePath = join(getTokensDir(), TOKEN_FILE_TESTING);
  try {
    const raw = readFileSync(filePath, "utf-8");
    if (!raw.trim()) return null;
    return JSON.parse(raw) as admin.ServiceAccount;
  } catch {
    return null;
  }
}

let firestoreInstance: Firestore | null = null;
let firestoreTestingInstance: Firestore | null = null;

/** Bun + gRPC de Firestore suele fallar; REST evita @grpc/grpc-js. Desactiva con FIRESTORE_PREFER_REST=0. */
function shouldPreferFirestoreRest(): boolean {
  if (process.env.FIRESTORE_PREFER_REST === "0") return false;
  if (process.env.FIRESTORE_PREFER_REST === "1") return true;
  return typeof process.versions.bun === "string";
}

/**
 * Firestore de producción (lazy). Credenciales: env JSON o `src/tokens/firebase.production.json`.
 */
export function getFirestore(): Firestore {
  if (firestoreInstance) return firestoreInstance;

  const serviceAccount = loadServiceAccountProduction();
  if (!serviceAccount) {
    const msg =
      "Credenciales Firebase no encontradas. Define FIREBASE_SERVICE_ACCOUNT_JSON_PRODUCTION o FIREBASE_SERVICE_ACCOUNT_JSON, o coloca el JSON de cuenta de servicio en src/tokens/firebase.production.json.";
    console.error(`[firestore] ${msg}`);
    throw new Error(msg);
  }

  if (!admin.apps.some((app) => app?.name === FIREBASE_APP_NAME)) {
    admin.initializeApp(
      { credential: admin.credential.cert(serviceAccount) },
      FIREBASE_APP_NAME,
    );
  }

  const firebaseApp = admin.app(FIREBASE_APP_NAME);
  firestoreInstance = shouldPreferFirestoreRest()
    ? initializeFirestore(firebaseApp, { preferRest: true })
    : firebaseApp.firestore();
  return firestoreInstance;
}

/**
 * Firestore según ambiente de datos (producción vs proyecto Firebase de testing).
 * Duplicar/clonar entre ambientes requiere credenciales de testing (`FIREBASE_SERVICE_ACCOUNT_JSON_TESTING` o `src/tokens/firebase.testing.json`).
 */
export function getFirestoreForEnvironment(env: FirestoreEnvironment): Firestore {
  if (env === "production") {
    return getFirestore();
  }

  if (firestoreTestingInstance) {
    return firestoreTestingInstance;
  }

  const serviceAccount = loadServiceAccountTesting();
  if (!serviceAccount) {
    const msg =
      "Credenciales Firebase (testing) no encontradas. Define FIREBASE_SERVICE_ACCOUNT_JSON_TESTING o coloca el JSON de cuenta de servicio en src/tokens/firebase.testing.json para operar contra el ambiente testing.";
    console.error(`[firestore] ${msg}`);
    throw new Error(msg);
  }

  const testingAppName = `${FIREBASE_APP_NAME}-firestore-testing`;
  if (!admin.apps.some((app) => app?.name === testingAppName)) {
    admin.initializeApp({ credential: admin.credential.cert(serviceAccount) }, testingAppName);
  }

  const firebaseApp = admin.app(testingAppName);
  firestoreTestingInstance = shouldPreferFirestoreRest()
    ? initializeFirestore(firebaseApp, { preferRest: true })
    : firebaseApp.firestore();
  return firestoreTestingInstance;
}
