"use server";

import { headers } from "next/headers";
import { UserAdminError } from "@/domain/userAdminErrors";
import {
  requirePermission,
  toAuthActionFailure,
} from "@/services/auth/requirePermission";
import {
  adminResetUserPassword,
  revokeTargetUserSessions,
} from "@/services/auth/passwordLifecycleService";
import {
  parseAdminResetPasswordInput,
  parseChangeRoleInput,
  parseCreateUserInput,
  parseSetEnabledInput,
  parseUpdateDisplayNameInput,
} from "@/services/auth/userAdminParsers";
import {
  changeUserRole,
  createManagedUser,
  listManagedUsers,
  setUserEnabled,
  updateUserDisplayName,
  type ManagedUserView,
} from "@/services/auth/userAdminService";

export type UserAdminActionResult =
  | {
      ok: true;
      user?: ManagedUserView;
      sessionRevokeFailed?: boolean;
      targetStillDisabled?: boolean;
      message?: string;
    }
  | {
      ok: false;
      error: string;
      code?:
        | "UNAUTHENTICATED"
        | "FORBIDDEN"
        | UserAdminError["code"];
    };

function toUserAdminFailure(error: unknown): UserAdminActionResult {
  if (error instanceof UserAdminError) {
    return { ok: false, error: error.message, code: error.code };
  }
  return toAuthActionFailure(error);
}

export async function listUsersAction(
  page: unknown = 1,
): Promise<
  | {
      ok: true;
      items: ManagedUserView[];
      page: number;
      hasMore: boolean;
      enabledAdminCount: number;
    }
  | UserAdminActionResult
> {
  try {
    await requirePermission("USER_ADMIN");
  } catch (error) {
    return toUserAdminFailure(error);
  }
  const pageNum = typeof page === "number" && Number.isFinite(page) ? page : 1;
  const listed = await listManagedUsers({ page: pageNum });
  return { ok: true, ...listed };
}

export async function createUserAction(
  raw: unknown,
): Promise<UserAdminActionResult> {
  try {
    await requirePermission("USER_ADMIN");
    const input = parseCreateUserInput(raw);
    const user = await createManagedUser(input);
    return {
      ok: true,
      user,
      message: "账号已创建，请通过安全渠道告知用户初始密码。",
    };
  } catch (error) {
    return toUserAdminFailure(error);
  }
}

export async function updateDisplayNameAction(
  raw: unknown,
): Promise<UserAdminActionResult> {
  try {
    await requirePermission("USER_ADMIN");
    const input = parseUpdateDisplayNameInput(raw);
    const user = await updateUserDisplayName(input);
    return { ok: true, user };
  } catch (error) {
    return toUserAdminFailure(error);
  }
}

export async function changeRoleAction(
  raw: unknown,
): Promise<UserAdminActionResult> {
  try {
    await requirePermission("USER_ADMIN");
    const input = parseChangeRoleInput(raw);
    const user = await changeUserRole(input);
    return { ok: true, user };
  } catch (error) {
    return toUserAdminFailure(error);
  }
}

export async function setEnabledAction(
  raw: unknown,
): Promise<UserAdminActionResult> {
  try {
    await requirePermission("USER_ADMIN");
    const input = parseSetEnabledInput(raw);
    const hdrs = await headers();
    const result = await setUserEnabled(input, hdrs);
    if (result.sessionRevokeFailed) {
      return {
        ok: true,
        user: result.user,
        sessionRevokeFailed: true,
        message:
          "账号已停用，但旧会话吊销失败，请立即重试会话清理。",
      };
    }
    return { ok: true, user: result.user };
  } catch (error) {
    return toUserAdminFailure(error);
  }
}

export async function retryRevokeSessionsAction(
  userId: unknown,
): Promise<UserAdminActionResult> {
  try {
    await requirePermission("USER_ADMIN");
    if (typeof userId !== "string" || !userId.trim()) {
      return { ok: false, error: "用户 ID 无效", code: "INVALID_INPUT" };
    }
    const hdrs = await headers();
    const result = await revokeTargetUserSessions({
      targetUserId: userId.trim(),
      headers: hdrs,
    });
    if (!result.ok) {
      return {
        ok: false,
        error: "会话吊销失败，请重试。",
        code: "DISABLE_SESSION_REVOKE_FAILED",
      };
    }
    return { ok: true, message: "会话已吊销。" };
  } catch (error) {
    return toUserAdminFailure(error);
  }
}

export async function adminResetPasswordAction(
  raw: unknown,
): Promise<UserAdminActionResult> {
  let actor;
  try {
    actor = await requirePermission("PASSWORD_ADMIN_RESET");
  } catch (error) {
    return toUserAdminFailure(error);
  }
  try {
    const input = parseAdminResetPasswordInput(raw);
    const hdrs = await headers();
    const result = await adminResetUserPassword({
      actor,
      targetUserId: input.userId,
      newPassword: input.newPassword,
      headers: hdrs,
    });
    if (result.sessionRevokeFailed) {
      return {
        ok: true,
        sessionRevokeFailed: true,
        targetStillDisabled: result.targetStillDisabled,
        message:
          "密码已重置，但旧会话吊销失败，请立即重试会话清理。",
      };
    }
    return {
      ok: true,
      targetStillDisabled: result.targetStillDisabled,
      message: result.targetStillDisabled
        ? "密码已重置。账号仍处于停用状态，需重新启用后才能登录。"
        : "密码已重置，目标用户需使用新密码重新登录。",
    };
  } catch (error) {
    return toUserAdminFailure(error);
  }
}
