export const {
  NODE_ENV = "development",
  PORT = "3000",
} = process.env;

const parsedPort = Number.parseInt(PORT, 10);

export const PORT_NUMBER =
  Number.isFinite(parsedPort) && parsedPort > 0 ? parsedPort : 3000;
