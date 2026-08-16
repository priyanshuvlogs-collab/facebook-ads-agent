import { createLogger, getEnv } from "@yta/shared";
import { createApp } from "./app";

const logger = createLogger("api");

const env = getEnv();
const app = createApp();

const server = app.listen(env.API_PORT, () => {
  logger.info(`API server listening on http://localhost:${env.API_PORT}`);
  if (!env.DATABASE_URL) {
    logger.warn("DATABASE_URL not set - start Postgres (docker compose up -d) and configure .env");
  }
});

function shutdown(signal: string): void {
  logger.info(`${signal} received - shutting down`);
  server.close(() => process.exit(0));
  // Force-exit if connections refuse to drain.
  setTimeout(() => process.exit(1), 10_000).unref();
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
