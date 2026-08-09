/**
 * User Administration / Password Lifecycle 业务错误（非权限错误）。
 * 权限仍用 ForbiddenError / UnauthenticatedError。
 */

export type UserAdminErrorCode =
  | "LAST_ENABLED_ADMIN_REQUIRED"
  | "INVALID_USER_ROLE"
  | "PASSWORD_CONFIRMATION_MISMATCH"
  | "PASSWORD_RESET_SESSION_REVOKE_FAILED"
  | "DISABLE_SESSION_REVOKE_FAILED"
  | "USER_NOT_FOUND"
  | "USERNAME_TAKEN"
  | "EMAIL_TAKEN"
  | "INVALID_INPUT"
  | "ADMIN_RESET_SELF_FORBIDDEN"
  | "PASSWORD_CHANGE_FAILED"
  | "BOOTSTRAP_ADMIN_EXISTS"
  | "BOOTSTRAP_ENV_MISSING";

export class UserAdminError extends Error {
  readonly code: UserAdminErrorCode;
  constructor(code: UserAdminErrorCode, message: string) {
    super(message);
    this.name = "UserAdminError";
    this.code = code;
  }
}

export const USER_ADMIN_ERROR_MESSAGES: Record<UserAdminErrorCode, string> = {
  LAST_ENABLED_ADMIN_REQUIRED: "系统至少需要保留一个启用的管理员。",
  INVALID_USER_ROLE: "角色无效，仅支持管理员、分析员或只读用户。",
  PASSWORD_CONFIRMATION_MISMATCH: "两次输入的新密码不一致。",
  PASSWORD_RESET_SESSION_REVOKE_FAILED:
    "密码已重置，但旧会话吊销失败，请立即重试会话清理。",
  DISABLE_SESSION_REVOKE_FAILED:
    "账号已停用，但旧会话吊销失败，请立即重试会话清理。",
  USER_NOT_FOUND: "用户不存在。",
  USERNAME_TAKEN: "用户名已存在。",
  EMAIL_TAKEN: "邮箱已存在。",
  INVALID_INPUT: "输入无效，请检查后重试。",
  ADMIN_RESET_SELF_FORBIDDEN: "请使用「修改自己的密码」，不能通过管理员重置修改本人密码。",
  PASSWORD_CHANGE_FAILED: "当前密码不正确或新密码不符合要求。",
  BOOTSTRAP_ADMIN_EXISTS: "系统已存在启用的管理员，拒绝重复 bootstrap。",
  BOOTSTRAP_ENV_MISSING: "缺少 bootstrap 所需环境变量。",
};
