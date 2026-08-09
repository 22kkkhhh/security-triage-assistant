/**
 * User Admin / Password Action 运行时 allowlist 解析。
 */

import { USER_ROLES, type UserRole } from "@/domain/auth";
import { isPasswordLengthValid } from "@/domain/passwordPolicy";
import {
  USER_ADMIN_ERROR_MESSAGES,
  UserAdminError,
} from "@/domain/userAdminErrors";

const USERNAME_RE = /^[a-zA-Z0-9_.-]+$/;
const DISPLAY_NAME_MAX = 80;

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function unknownKeys(obj: Record<string, unknown>, allowed: Set<string>): string[] {
  return Object.keys(obj).filter((k) => !allowed.has(k));
}

function requireString(
  value: unknown,
  field: string,
): string {
  if (typeof value !== "string") {
    throw new UserAdminError("INVALID_INPUT", `${field} 无效`);
  }
  return value;
}

export function parseUserRole(value: unknown): UserRole {
  if (typeof value !== "string" || !(USER_ROLES as readonly string[]).includes(value)) {
    throw new UserAdminError(
      "INVALID_USER_ROLE",
      USER_ADMIN_ERROR_MESSAGES.INVALID_USER_ROLE,
    );
  }
  return value as UserRole;
}

export type CreateUserInput = {
  username: string;
  displayName: string;
  email: string;
  role: UserRole;
  initialPassword: string;
};

export function parseCreateUserInput(raw: unknown): CreateUserInput {
  if (!isObject(raw)) {
    throw new UserAdminError("INVALID_INPUT", USER_ADMIN_ERROR_MESSAGES.INVALID_INPUT);
  }
  const bad = unknownKeys(
    raw,
    new Set([
      "username",
      "displayName",
      "email",
      "role",
      "initialPassword",
      "confirmPassword",
    ]),
  );
  if (bad.length > 0) {
    throw new UserAdminError(
      "INVALID_INPUT",
      `不允许字段：${bad.join(", ")}`,
    );
  }

  const usernameRaw = requireString(raw.username, "username").trim();
  if (
    usernameRaw.length < 3 ||
    usernameRaw.length > 30 ||
    !USERNAME_RE.test(usernameRaw)
  ) {
    throw new UserAdminError(
      "INVALID_INPUT",
      "用户名须为 3–30 位字母、数字、下划线、点或连字符。",
    );
  }
  const username = usernameRaw.toLowerCase();

  const displayName = requireString(raw.displayName, "displayName").trim();
  if (!displayName || displayName.length > DISPLAY_NAME_MAX) {
    throw new UserAdminError(
      "INVALID_INPUT",
      `显示名称不能为空，且不超过 ${DISPLAY_NAME_MAX} 字。`,
    );
  }

  const email = requireString(raw.email, "email").trim().toLowerCase();
  if (!email.includes("@") || email.length > 254) {
    throw new UserAdminError("INVALID_INPUT", "邮箱格式无效。");
  }

  const role = parseUserRole(raw.role);
  const initialPassword = requireString(raw.initialPassword, "initialPassword");
  const confirmPassword = requireString(raw.confirmPassword, "confirmPassword");
  if (initialPassword !== confirmPassword) {
    throw new UserAdminError(
      "PASSWORD_CONFIRMATION_MISMATCH",
      USER_ADMIN_ERROR_MESSAGES.PASSWORD_CONFIRMATION_MISMATCH,
    );
  }
  if (!isPasswordLengthValid(initialPassword)) {
    throw new UserAdminError(
      "INVALID_INPUT",
      "密码长度不符合要求。",
    );
  }

  return { username, displayName, email, role, initialPassword };
}

export type UpdateDisplayNameInput = {
  userId: string;
  displayName: string;
};

export function parseUpdateDisplayNameInput(raw: unknown): UpdateDisplayNameInput {
  if (!isObject(raw)) {
    throw new UserAdminError("INVALID_INPUT", USER_ADMIN_ERROR_MESSAGES.INVALID_INPUT);
  }
  const bad = unknownKeys(raw, new Set(["userId", "displayName"]));
  if (bad.length > 0) {
    throw new UserAdminError(
      "INVALID_INPUT",
      `不允许字段：${bad.join(", ")}`,
    );
  }
  const userId = requireString(raw.userId, "userId").trim();
  if (!userId) {
    throw new UserAdminError("INVALID_INPUT", "用户 ID 无效。");
  }
  const displayName = requireString(raw.displayName, "displayName").trim();
  if (!displayName || displayName.length > DISPLAY_NAME_MAX) {
    throw new UserAdminError(
      "INVALID_INPUT",
      `显示名称不能为空，且不超过 ${DISPLAY_NAME_MAX} 字。`,
    );
  }
  return { userId, displayName };
}

export type ChangeRoleInput = {
  userId: string;
  role: UserRole;
};

export function parseChangeRoleInput(raw: unknown): ChangeRoleInput {
  if (!isObject(raw)) {
    throw new UserAdminError("INVALID_INPUT", USER_ADMIN_ERROR_MESSAGES.INVALID_INPUT);
  }
  const bad = unknownKeys(raw, new Set(["userId", "role"]));
  if (bad.length > 0) {
    throw new UserAdminError(
      "INVALID_INPUT",
      `不允许字段：${bad.join(", ")}`,
    );
  }
  const userId = requireString(raw.userId, "userId").trim();
  if (!userId) {
    throw new UserAdminError("INVALID_INPUT", "用户 ID 无效。");
  }
  return { userId, role: parseUserRole(raw.role) };
}

export type SetEnabledInput = {
  userId: string;
  enabled: boolean;
};

export function parseSetEnabledInput(raw: unknown): SetEnabledInput {
  if (!isObject(raw)) {
    throw new UserAdminError("INVALID_INPUT", USER_ADMIN_ERROR_MESSAGES.INVALID_INPUT);
  }
  const bad = unknownKeys(raw, new Set(["userId", "enabled"]));
  if (bad.length > 0) {
    throw new UserAdminError(
      "INVALID_INPUT",
      `不允许字段：${bad.join(", ")}`,
    );
  }
  const userId = requireString(raw.userId, "userId").trim();
  if (!userId) {
    throw new UserAdminError("INVALID_INPUT", "用户 ID 无效。");
  }
  if (typeof raw.enabled !== "boolean") {
    throw new UserAdminError("INVALID_INPUT", "enabled 必须为 boolean。");
  }
  return { userId, enabled: raw.enabled };
}

export type SelfPasswordInput = {
  currentPassword: string;
  newPassword: string;
};

export function parseSelfPasswordInput(raw: unknown): SelfPasswordInput {
  if (!isObject(raw)) {
    throw new UserAdminError("INVALID_INPUT", USER_ADMIN_ERROR_MESSAGES.INVALID_INPUT);
  }
  const bad = unknownKeys(
    raw,
    new Set(["currentPassword", "newPassword", "confirmPassword"]),
  );
  if (bad.length > 0) {
    throw new UserAdminError(
      "INVALID_INPUT",
      `不允许字段：${bad.join(", ")}`,
    );
  }
  const currentPassword = requireString(raw.currentPassword, "currentPassword");
  const newPassword = requireString(raw.newPassword, "newPassword");
  const confirmPassword = requireString(raw.confirmPassword, "confirmPassword");
  if (newPassword !== confirmPassword) {
    throw new UserAdminError(
      "PASSWORD_CONFIRMATION_MISMATCH",
      USER_ADMIN_ERROR_MESSAGES.PASSWORD_CONFIRMATION_MISMATCH,
    );
  }
  if (!isPasswordLengthValid(newPassword)) {
    throw new UserAdminError("INVALID_INPUT", "密码长度不符合要求。");
  }
  return { currentPassword, newPassword };
}

export type AdminResetPasswordInput = {
  userId: string;
  newPassword: string;
};

export function parseAdminResetPasswordInput(
  raw: unknown,
): AdminResetPasswordInput {
  if (!isObject(raw)) {
    throw new UserAdminError("INVALID_INPUT", USER_ADMIN_ERROR_MESSAGES.INVALID_INPUT);
  }
  const bad = unknownKeys(
    raw,
    new Set(["userId", "newPassword", "confirmPassword"]),
  );
  if (bad.length > 0) {
    throw new UserAdminError(
      "INVALID_INPUT",
      `不允许字段：${bad.join(", ")}`,
    );
  }
  const userId = requireString(raw.userId, "userId").trim();
  if (!userId) {
    throw new UserAdminError("INVALID_INPUT", "用户 ID 无效。");
  }
  const newPassword = requireString(raw.newPassword, "newPassword");
  const confirmPassword = requireString(raw.confirmPassword, "confirmPassword");
  if (newPassword !== confirmPassword) {
    throw new UserAdminError(
      "PASSWORD_CONFIRMATION_MISMATCH",
      USER_ADMIN_ERROR_MESSAGES.PASSWORD_CONFIRMATION_MISMATCH,
    );
  }
  if (!isPasswordLengthValid(newPassword)) {
    throw new UserAdminError("INVALID_INPUT", "密码长度不符合要求。");
  }
  return { userId, newPassword };
}
