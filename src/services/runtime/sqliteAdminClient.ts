/**
 * Short-lived Prisma client for SQLite admin operations (backup / restore validation).
 * Does not touch the app global prisma singleton.
 */

import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaClient } from "@/generated/prisma/client";

export async function withSqliteAdminClient<T>(
  databaseUrl: string,
  fn: (client: PrismaClient) => Promise<T>,
): Promise<T> {
  const adapter = new PrismaBetterSqlite3({ url: databaseUrl });
  const client = new PrismaClient({ adapter });
  try {
    return await fn(client);
  } finally {
    await client.$disconnect().catch(() => undefined);
  }
}

/** Escape a filesystem path for use as a SQLite string literal. */
export function quoteSqlitePathLiteral(absolutePath: string): string {
  const normalized = absolutePath.replace(/\\/g, "/");
  return `'${normalized.replace(/'/g, "''")}'`;
}

export async function pragmaIntegrityCheck(
  client: PrismaClient,
): Promise<"ok" | string> {
  const rows = await client.$queryRawUnsafe<Array<Record<string, unknown>>>(
    "PRAGMA integrity_check",
  );
  const first = rows[0];
  if (!first) return "empty";
  const value = Object.values(first)[0];
  return value === "ok" ? "ok" : String(value ?? "failed");
}
