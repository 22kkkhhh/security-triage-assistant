/**
 * Better Auth / Prisma User → Security Triage AuthUser 唯一 mapper。
 * AuthUser 为 Server-derived trusted object；Client 不得提交身份字段冒充。
 */

import {
  USER_ROLES,
  type AuthUser,
  type UserRole,
} from "@/domain/auth";

export class InvalidAuthUserStateError extends Error {
  readonly code = "INVALID_AUTH_USER_STATE" as const;
  constructor(message: string) {
    super(message);
    this.name = "InvalidAuthUserStateError";
  }
}

const ROLE_SET = new Set<string>(USER_ROLES);

/** Prisma / Better Auth User 行的最小输入形状 */
export type AuthUserSource = {
  id: string;
  username?: string | null;
  name?: string | null;
  email?: string | null;
  role?: string | null;
  enabled?: boolean | null;
};

function isSingleUserRole(role: string): role is UserRole {
  return ROLE_SET.has(role);
}

/**
 * 结构映射：允许 enabled=false（合法禁用用户）。
 * role / username / email 非法 → fail closed（InvalidAuthUserStateError）。
 * 授权拒绝由 hasPermission / authorize 负责。
 */
export function toAuthUser(source: AuthUserSource): AuthUser {
  if (!source.id || typeof source.id !== "string") {
    throw new InvalidAuthUserStateError("用户 id 无效");
  }

  const username = source.username?.trim() ?? "";
  if (!username) {
    throw new InvalidAuthUserStateError("username 缺失");
  }

  const email = source.email?.trim() ?? "";
  if (!email) {
    throw new InvalidAuthUserStateError("email 缺失");
  }

  const displayName = source.name?.trim() ?? "";
  if (!displayName) {
    throw new InvalidAuthUserStateError("displayName（name）缺失");
  }

  const roleRaw = source.role?.trim() ?? "";
  if (!roleRaw) {
    throw new InvalidAuthUserStateError("role 缺失");
  }
  if (roleRaw.includes(",")) {
    throw new InvalidAuthUserStateError("不支持多角色");
  }
  if (!isSingleUserRole(roleRaw)) {
    throw new InvalidAuthUserStateError(`未知或非法 role：${roleRaw}`);
  }

  if (typeof source.enabled !== "boolean") {
    throw new InvalidAuthUserStateError("enabled 必须为 boolean");
  }

  return {
    id: source.id,
    username,
    displayName,
    email,
    role: roleRaw,
    enabled: source.enabled,
  };
}
