/**
 * Security Triage Auth Domain（v1.3 Step 1 foundation）。
 *
 * 业务授权模型独立于 Better Auth：
 * Better Auth 仅提供 authenticated identity；
 * 映射为 AuthUser 后，业务代码只依赖本模块的 Role / Permission / authorize。
 *
 * AuthUser 是 Server-derived trusted object。
 * Client 不得提交 id / username / displayName / email / role / enabled 作为可信身份。
 *
 * 本模块不含 Session、密码、Prisma User、Better Auth import。
 * 「至少一个 enabled ADMIN」属于未来 User Admin Command invariant，不在 authorize() 内实现。
 */

/** 全局角色；禁止自定义角色扩展 */
export type UserRole = "ADMIN" | "ANALYST" | "VIEWER";

export const USER_ROLES: readonly UserRole[] = [
  "ADMIN",
  "ANALYST",
  "VIEWER",
] as const;

/** 角色中文展示（App Shell 展示用；不等于授权） */
export const userRoleLabels: Record<UserRole, string> = {
  ADMIN: "管理员",
  ANALYST: "分析员",
  VIEWER: "只读用户",
};

/**
 * Security Triage 已验证的当前用户身份（非数据库 User 完整实体）。
 * 不得包含 password / passwordHash / sessionToken。
 */
export interface AuthUser {
  id: string;
  username: string;
  displayName: string;
  email: string;
  role: UserRole;
  enabled: boolean;
}

/** 业务权限；刻意保持粗粒度，避免过细拆分 */
export const PERMISSIONS = [
  "CASE_READ",
  "CASE_CREATE",
  "CASE_SNAPSHOT_WRITE",
  "CASE_STATUS_CHANGE",
  "CHECKLIST_WRITE",
  "BUSINESS_CONTEXT_WRITE",
  "HUMAN_REVIEW_WRITE",
  "TIMELINE_WRITE",
  "HANDOFF_WRITE",
  "ACTIVITY_READ",
  "REPORT_READ",
  "REPORT_WRITE",
  "REPORT_EXPORT",
  "USER_ADMIN",
  "PASSWORD_SELF_CHANGE",
  "PASSWORD_ADMIN_RESET",
  "KNOWLEDGE_READ",
] as const;

export type Permission = (typeof PERMISSIONS)[number];

const VIEWER_PERMISSIONS: readonly Permission[] = [
  "CASE_READ",
  "ACTIVITY_READ",
  "REPORT_READ",
  "PASSWORD_SELF_CHANGE",
  "KNOWLEDGE_READ",
];

const ANALYST_PERMISSIONS: readonly Permission[] = [
  ...VIEWER_PERMISSIONS,
  "CASE_CREATE",
  "CASE_SNAPSHOT_WRITE",
  "CASE_STATUS_CHANGE",
  "CHECKLIST_WRITE",
  "BUSINESS_CONTEXT_WRITE",
  "HUMAN_REVIEW_WRITE",
  "TIMELINE_WRITE",
  "HANDOFF_WRITE",
  "REPORT_WRITE",
  "REPORT_EXPORT",
];

const ADMIN_PERMISSIONS: readonly Permission[] = [
  ...ANALYST_PERMISSIONS,
  "USER_ADMIN",
  "PASSWORD_ADMIN_RESET",
];

/** Role → Permission 单一 Source of Truth */
export const ROLE_PERMISSIONS: Record<UserRole, readonly Permission[]> = {
  VIEWER: VIEWER_PERMISSIONS,
  ANALYST: ANALYST_PERMISSIONS,
  ADMIN: ADMIN_PERMISSIONS,
};

/** 仅回答 Role 是否拥有 Permission（不考虑 enabled） */
export function roleHasPermission(
  role: UserRole,
  permission: Permission,
): boolean {
  return ROLE_PERMISSIONS[role].includes(permission);
}

/**
 * 有效授权判断：disabled user 永远 false（即使 role=ADMIN）。
 */
export function hasPermission(
  user: AuthUser,
  permission: Permission,
): boolean {
  if (!user.enabled) return false;
  return roleHasPermission(user.role, permission);
}

export class UnauthenticatedError extends Error {
  readonly code = "UNAUTHENTICATED" as const;
  constructor(message = "未登录或会话无效") {
    super(message);
    this.name = "UnauthenticatedError";
  }
}

export class ForbiddenError extends Error {
  readonly code = "FORBIDDEN" as const;
  constructor(message = "无权执行此操作") {
    super(message);
    this.name = "ForbiddenError";
  }
}

/**
 * 应用层授权入口。
 * - enabled === false → ForbiddenError
 * - role 不具备 permission → ForbiddenError
 * - 成功返回同一 AuthUser（便于链式使用）
 *
 * 未认证（无 user）由调用方抛 UnauthenticatedError；本函数不接受 null。
 */
export function authorize(
  user: AuthUser,
  permission: Permission,
): AuthUser {
  if (!hasPermission(user, permission)) {
    throw new ForbiddenError();
  }
  return user;
}
