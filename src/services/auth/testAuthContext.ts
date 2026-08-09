/**
 * Vitest 专用 Auth 覆盖（仅 process.env.VITEST）。
 * 生产路径永不读取本模块的 store。
 */
import { AsyncLocalStorage } from "node:async_hooks";
import type { AuthUser } from "@/domain/auth";

type Store =
  | { kind: "user"; user: AuthUser }
  | { kind: "unauthenticated" };

const als = new AsyncLocalStorage<Store>();

/** 未进入 ALS 时的默认用户（旧集成测试用 ANALYST 旁路） */
let defaultUser: AuthUser | null = null;

export function setVitestDefaultAuthUser(user: AuthUser | null): void {
  if (process.env.VITEST !== "true") {
    throw new Error("setVitestDefaultAuthUser 仅允许在 Vitest 中使用");
  }
  defaultUser = user;
}

export function runWithTestAuthUser<T>(
  user: AuthUser,
  fn: () => T | Promise<T>,
): T | Promise<T> {
  return als.run({ kind: "user", user }, fn);
}

export function runAsUnauthenticatedTest<T>(
  fn: () => T | Promise<T>,
): T | Promise<T> {
  return als.run({ kind: "unauthenticated" }, fn);
}

export function resolveVitestAuthOverride():
  | { kind: "user"; user: AuthUser }
  | { kind: "unauthenticated" }
  | null {
  if (process.env.VITEST !== "true") return null;
  const store = als.getStore();
  if (store) return store;
  if (defaultUser) return { kind: "user", user: defaultUser };
  return null;
}

/** 便于旧测试快速挂 ANALYST */
export const VITEST_ANALYST_USER: AuthUser = {
  id: "vitest-analyst-id",
  username: "vitest-analyst",
  displayName: "Vitest 分析员",
  email: "vitest-analyst@example.test",
  role: "ANALYST",
  enabled: true,
};

export const VITEST_VIEWER_USER: AuthUser = {
  id: "vitest-viewer-id",
  username: "vitest-viewer",
  displayName: "Vitest 只读",
  email: "vitest-viewer@example.test",
  role: "VIEWER",
  enabled: true,
};

export const VITEST_ADMIN_USER: AuthUser = {
  id: "vitest-admin-id",
  username: "vitest-admin",
  displayName: "Vitest 管理员",
  email: "vitest-admin@example.test",
  role: "ADMIN",
  enabled: true,
};

/**
 * 确保 Vitest 虚拟 AuthUser 在 DB 有对应 User 行，
 * 以便 CaseAuditLog.actorId FK（USER Actor）可写入。
 */
export async function ensureVitestAuthUsersInDb(): Promise<void> {
  if (process.env.VITEST !== "true") {
    throw new Error("ensureVitestAuthUsersInDb 仅允许在 Vitest 中使用");
  }
  const { prisma } = await import("@/lib/prisma");
  for (const u of [
    VITEST_ANALYST_USER,
    VITEST_VIEWER_USER,
    VITEST_ADMIN_USER,
  ]) {
    await prisma.user.upsert({
      where: { id: u.id },
      create: {
        id: u.id,
        name: u.displayName,
        email: u.email,
        emailVerified: false,
        username: u.username,
        displayUsername: u.username,
        role: u.role,
        enabled: u.enabled,
      },
      update: {
        name: u.displayName,
        role: u.role,
        enabled: u.enabled,
      },
    });
  }
}
