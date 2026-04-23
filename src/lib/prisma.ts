import { PrismaClient } from "@prisma/client";

/**
 * PrismaClient singleton for the local SQLite app DB.
 *
 * In dev mode, Next.js hot-reloads modules constantly — without the global
 * cache we would open a new DB connection per edit and quickly exhaust the
 * SQLite file handle pool. In production there's only one module evaluation
 * per worker so the guard is a no-op.
 */
declare global {
  // eslint-disable-next-line no-var
  var __prismaClient: PrismaClient | undefined;
}

export const prisma: PrismaClient =
  globalThis.__prismaClient ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalThis.__prismaClient = prisma;
}
