import "dotenv/config";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaClient } from "@/generated/prisma/client";
import { resolveDatabaseUrl } from "@/lib/envConfig";

/**
 * Prisma Client 单例（Prisma 7 + better-sqlite3 adapter）。
 * Next.js / Vitest 热重载时复用全局实例，避免连接堆积。
 * 测试可通过 resetPrismaClient 切换 DATABASE_URL。
 */

const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
};

function createPrismaClient(): PrismaClient {
  const url = resolveDatabaseUrl();
  const adapter = new PrismaBetterSqlite3({ url });
  return new PrismaClient({ adapter });
}

export function getPrisma(): PrismaClient {
  if (!globalForPrisma.prisma) {
    globalForPrisma.prisma = createPrismaClient();
  }
  return globalForPrisma.prisma;
}

/** 测试用：断开并按当前 DATABASE_URL 重建 Client */
export async function resetPrismaClient(url?: string): Promise<PrismaClient> {
  if (url) process.env.DATABASE_URL = url;
  if (globalForPrisma.prisma) {
    await globalForPrisma.prisma.$disconnect();
    globalForPrisma.prisma = undefined;
  }
  globalForPrisma.prisma = createPrismaClient();
  return globalForPrisma.prisma;
}

/** 兼容现有 import { prisma } 用法（始终代理到当前单例） */
export const prisma: PrismaClient = new Proxy({} as PrismaClient, {
  get(_target, prop, receiver) {
    const client = getPrisma();
    const value = Reflect.get(client, prop, receiver);
    return typeof value === "function" ? value.bind(client) : value;
  },
});
