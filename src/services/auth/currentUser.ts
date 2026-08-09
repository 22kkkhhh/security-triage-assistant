/**
 * Security Triage Auth DAL（Server-only）。
 *
 * Session 仅证明 userId；role / enabled / displayName 一律 DB reload + toAuthUser。
 * 禁止将 session.user.role / enabled 作为业务授权数据。
 */

import { headers } from "next/headers";
import {
  ForbiddenError,
  UnauthenticatedError,
  type AuthUser,
} from "@/domain/auth";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  InvalidAuthUserStateError,
  toAuthUser,
} from "@/services/auth/toAuthUser";

export type { AuthUser };

async function resolveRequestHeaders(
  incoming?: Headers,
): Promise<Headers> {
  if (incoming) return incoming;
  return await headers();
}

/**
 * 解析当前登录用户；无 Session 返回 null。
 * enabled=false / 身份损坏不返回 AuthUser，由 requireAuthenticatedUser 分类抛错。
 */
export async function getCurrentAuthUser(
  incomingHeaders?: Headers,
): Promise<AuthUser | null> {
  const requestHeaders = await resolveRequestHeaders(incomingHeaders);

  const session = await auth.api.getSession({
    headers: requestHeaders,
    query: {
      /** 敏感 DAL：不信任 cookie cache 中的 role/enabled */
      disableCookieCache: true,
    },
  });

  if (!session?.session?.userId) {
    return null;
  }

  const userId = session.session.userId;
  const row = await prisma.user.findUnique({ where: { id: userId } });
  if (!row) {
    return null;
  }

  return toAuthUser(row);
}

/**
 * 受保护 Server 入口：
 * - 无 Session / User 缺失 → UnauthenticatedError
 * - enabled=false → ForbiddenError
 * - 身份字段损坏 → InvalidAuthUserStateError
 */
export async function requireAuthenticatedUser(
  incomingHeaders?: Headers,
): Promise<AuthUser> {
  const requestHeaders = await resolveRequestHeaders(incomingHeaders);

  const session = await auth.api.getSession({
    headers: requestHeaders,
    query: { disableCookieCache: true },
  });

  if (!session?.session?.userId) {
    throw new UnauthenticatedError();
  }

  const row = await prisma.user.findUnique({
    where: { id: session.session.userId },
  });
  if (!row) {
    throw new UnauthenticatedError("会话无效或用户不存在");
  }

  let user: AuthUser;
  try {
    user = toAuthUser(row);
  } catch (error) {
    if (error instanceof InvalidAuthUserStateError) {
      throw error;
    }
    throw new InvalidAuthUserStateError("无法构造可信 AuthUser");
  }

  if (!user.enabled) {
    throw new ForbiddenError("账号已停用，请联系管理员");
  }

  return user;
}
