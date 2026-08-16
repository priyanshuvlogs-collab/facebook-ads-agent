import { PrismaClient } from "@prisma/client";
import { createLogger } from "@yta/shared";

const logger = createLogger("database");

declare global {
  // eslint-disable-next-line no-var
  var __ytaPrisma: PrismaClient | undefined;
}

/**
 * Singleton PrismaClient. Reused across hot reloads in development to avoid
 * exhausting the connection pool.
 */
export function getPrisma(): PrismaClient {
  if (!globalThis.__ytaPrisma) {
    if (!process.env.DATABASE_URL) {
      logger.warn(
        "DATABASE_URL is not set - database operations will fail until it is configured"
      );
    }
    globalThis.__ytaPrisma = new PrismaClient({
      log:
        process.env.NODE_ENV === "development"
          ? ["warn", "error"]
          : ["error"],
    });
  }
  return globalThis.__ytaPrisma;
}

export const prisma = getPrisma();

export * from "@prisma/client";
