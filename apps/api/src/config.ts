// Default 3001 so `bun run dev` at repo root can run Next (3000) and API together.
export const {
  NODE_ENV = "development",
  PORT = "3001",
} = process.env;

const parsedPort = Number.parseInt(PORT, 10);

export const PORT_NUMBER =
  Number.isFinite(parsedPort) && parsedPort > 0 ? parsedPort : 3001;
