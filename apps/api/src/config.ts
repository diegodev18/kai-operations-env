// Default 3001 so `bun run dev` at repo root can run Next (3000) and API together.
export const {
  NODE_ENV = "development",
  PORT = "3001",
  BETTER_AUTH_SECRET,
  DATABASE_URL,
  BETTER_AUTH_URL = "http://localhost:3000",
  WEB_ORIGIN = "http://localhost:3000",
  FIREBASE_APP_NAME = "kai-project-26879",
  KAI_AGENTS_TESTING_URL = "https://kaiagentstesting-eimrzmtgdq-uc.a.run.app",
} = process.env;

const parsedPort = Number.parseInt(PORT, 10);

export const PORT_NUMBER =
  Number.isFinite(parsedPort) && parsedPort > 0 ? parsedPort : 3001;

export const CORS_OPTIONS = {
  allowHeaders: ["Content-Type", "Cookie", "Authorization"],
  allowMethods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
  credentials: true,
  origin: WEB_ORIGIN,
} as const;
