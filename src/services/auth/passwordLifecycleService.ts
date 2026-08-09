/**
 * Password Lifecycle：自助改密 / ADMIN 重置（Better Auth 官方 API）。
 */

import type { AuthUser } from "@/domain/auth";
import {
  USER_ADMIN_ERROR_MESSAGES,
  UserAdminError,
} from "@/domain/userAdminErrors";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getManagedUserById } from "./userAdminService";

export type PasswordActionOk = {
  ok: true;
  sessionRevokeFailed?: boolean;
  /** 目标仍停用时的提示 */
  targetStillDisabled?: boolean;
};

/**
 * 当前用户修改自己的密码；revokeOtherSessions=true。
 * 目标始终为 authenticated user，忽略 Client userId。
 */
export async function changeOwnPassword(input: {
  authUser: AuthUser;
  currentPassword: string;
  newPassword: string;
  headers: Headers;
}): Promise<PasswordActionOk> {
  try {
    await auth.api.changePassword({
      body: {
        currentPassword: input.currentPassword,
        newPassword: input.newPassword,
        revokeOtherSessions: true,
      },
      headers: input.headers,
    });
  } catch {
    throw new UserAdminError(
      "PASSWORD_CHANGE_FAILED",
      USER_ADMIN_ERROR_MESSAGES.PASSWORD_CHANGE_FAILED,
    );
  }
  return { ok: true };
}

/**
 * ADMIN 重置其他用户密码，然后吊销目标全部 Session。
 * 禁止重置自己。
 */
export async function adminResetUserPassword(input: {
  actor: AuthUser;
  targetUserId: string;
  newPassword: string;
  headers: Headers;
}): Promise<PasswordActionOk> {
  if (input.targetUserId === input.actor.id) {
    throw new UserAdminError(
      "ADMIN_RESET_SELF_FORBIDDEN",
      USER_ADMIN_ERROR_MESSAGES.ADMIN_RESET_SELF_FORBIDDEN,
    );
  }

  const target = await getManagedUserById(input.targetUserId);
  if (!target) {
    throw new UserAdminError(
      "USER_NOT_FOUND",
      USER_ADMIN_ERROR_MESSAGES.USER_NOT_FOUND,
    );
  }

  try {
    await auth.api.setUserPassword({
      body: {
        userId: input.targetUserId,
        newPassword: input.newPassword,
      },
      headers: input.headers,
    });
  } catch {
    throw new UserAdminError(
      "PASSWORD_CHANGE_FAILED",
      USER_ADMIN_ERROR_MESSAGES.PASSWORD_CHANGE_FAILED,
    );
  }

  let sessionRevokeFailed = false;
  try {
    await auth.api.revokeUserSessions({
      body: { userId: input.targetUserId },
      headers: input.headers,
    });
  } catch {
    sessionRevokeFailed = true;
  }

  // 确认无明文密码残留于 DB（credential Account.password 必须为 hash）
  const account = await prisma.account.findFirst({
    where: { userId: input.targetUserId, providerId: "credential" },
    select: { password: true },
  });
  if (account?.password && account.password === input.newPassword) {
    throw new UserAdminError(
      "PASSWORD_CHANGE_FAILED",
      "密码存储异常，请联系运维。",
    );
  }

  return {
    ok: true,
    sessionRevokeFailed,
    targetStillDisabled: !target.enabled,
  };
}

/** 仅吊销目标用户会话（供 disable 后重试） */
export async function revokeTargetUserSessions(input: {
  targetUserId: string;
  headers: Headers;
}): Promise<{ ok: true } | { ok: false }> {
  try {
    await auth.api.revokeUserSessions({
      body: { userId: input.targetUserId },
      headers: input.headers,
    });
    return { ok: true };
  } catch {
    return { ok: false };
  }
}
