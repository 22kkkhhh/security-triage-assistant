/**
 * User Administration service（v1.3 Step 8）。
 *
 * - role / enabled / displayName：Prisma + last enabled ADMIN invariant
 * - credential 创建：Better Auth createUser
 * - Session 吊销：Better Auth revokeUserSessions（失败不回滚 enabled）
 */

import type { UserRole } from "@/domain/auth";
import {
  USER_ADMIN_ERROR_MESSAGES,
  UserAdminError,
} from "@/domain/userAdminErrors";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import type { CreateUserInput } from "./userAdminParsers";

export type ManagedUserView = {
  id: string;
  username: string;
  displayName: string;
  email: string;
  role: UserRole;
  enabled: boolean;
  createdAt: string;
};

const PAGE_SIZE = 50;

function mapUser(row: {
  id: string;
  username: string | null;
  name: string;
  email: string;
  role: string | null;
  enabled: boolean;
  createdAt: Date;
}): ManagedUserView {
  const role = row.role;
  if (role !== "ADMIN" && role !== "ANALYST" && role !== "VIEWER") {
    throw new UserAdminError("INVALID_USER_ROLE", "用户角色数据无效。");
  }
  return {
    id: row.id,
    username: row.username ?? "",
    displayName: row.name,
    email: row.email,
    role,
    enabled: row.enabled,
    createdAt: row.createdAt.toISOString(),
  };
}

export async function countEnabledAdmins(
  tx: { user: { count: typeof prisma.user.count } } = prisma,
): Promise<number> {
  return tx.user.count({
    where: { enabled: true, role: "ADMIN" },
  });
}

export async function listManagedUsers(input?: {
  page?: number;
  limit?: number;
}): Promise<{
  items: ManagedUserView[];
  page: number;
  hasMore: boolean;
  enabledAdminCount: number;
}> {
  const limit = Math.min(Math.max(input?.limit ?? PAGE_SIZE, 1), PAGE_SIZE);
  const page = Math.max(input?.page ?? 1, 1);
  const skip = (page - 1) * limit;
  const rows = await prisma.user.findMany({
    orderBy: [{ enabled: "desc" }, { createdAt: "desc" }, { id: "desc" }],
    skip,
    take: limit + 1,
    select: {
      id: true,
      username: true,
      name: true,
      email: true,
      role: true,
      enabled: true,
      createdAt: true,
    },
  });
  const hasMore = rows.length > limit;
  const pageRows = hasMore ? rows.slice(0, limit) : rows;
  const enabledAdminCount = await countEnabledAdmins();
  return {
    items: pageRows.map(mapUser),
    page,
    hasMore,
    enabledAdminCount,
  };
}

export async function createManagedUser(
  input: CreateUserInput,
): Promise<ManagedUserView> {
  const username = input.username.trim().toLowerCase();
  const email = input.email.trim().toLowerCase();
  const usernameTaken = await prisma.user.findFirst({
    where: {
      OR: [
        { username },
        { displayUsername: username },
        { displayUsername: input.username.trim() },
      ],
    },
  });
  if (usernameTaken) {
    throw new UserAdminError(
      "USERNAME_TAKEN",
      USER_ADMIN_ERROR_MESSAGES.USERNAME_TAKEN,
    );
  }
  const emailTaken = await prisma.user.findUnique({
    where: { email },
  });
  if (emailTaken) {
    throw new UserAdminError(
      "EMAIL_TAKEN",
      USER_ADMIN_ERROR_MESSAGES.EMAIL_TAKEN,
    );
  }

  try {
    await auth.api.createUser({
      body: {
        email,
        password: input.initialPassword,
        name: input.displayName,
        role: input.role,
        data: {
          username,
        },
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (/email/i.test(message) && /already|exist|unique/i.test(message)) {
      throw new UserAdminError(
        "EMAIL_TAKEN",
        USER_ADMIN_ERROR_MESSAGES.EMAIL_TAKEN,
      );
    }
    if (/already exists|unique|USER_ALREADY_EXISTS|username/i.test(message)) {
      throw new UserAdminError(
        "USERNAME_TAKEN",
        USER_ADMIN_ERROR_MESSAGES.USERNAME_TAKEN,
      );
    }
    throw new UserAdminError(
      "INVALID_INPUT",
      "用户创建失败，请检查输入后重试。",
    );
  }

  const created = await prisma.user.findFirst({
    where: { username },
  });
  if (!created) {
    throw new UserAdminError("USER_NOT_FOUND", "用户创建后无法读取。");
  }
  return mapUser(created);
}

export async function updateUserDisplayName(input: {
  userId: string;
  displayName: string;
}): Promise<ManagedUserView> {
  const existing = await prisma.user.findUnique({ where: { id: input.userId } });
  if (!existing) {
    throw new UserAdminError(
      "USER_NOT_FOUND",
      USER_ADMIN_ERROR_MESSAGES.USER_NOT_FOUND,
    );
  }
  const updated = await prisma.user.update({
    where: { id: input.userId },
    data: { name: input.displayName },
  });
  return mapUser(updated);
}

/**
 * 变更角色；若导致 enabled ADMIN = 0 则 rollback。
 */
export async function changeUserRole(input: {
  userId: string;
  role: UserRole;
}): Promise<ManagedUserView> {
  try {
    const updated = await prisma.$transaction(async (tx) => {
      const existing = await tx.user.findUnique({ where: { id: input.userId } });
      if (!existing) {
        throw new UserAdminError(
          "USER_NOT_FOUND",
          USER_ADMIN_ERROR_MESSAGES.USER_NOT_FOUND,
        );
      }
      const next = await tx.user.update({
        where: { id: input.userId },
        data: { role: input.role },
      });
      // 仅当目标原为 enabled ADMIN 且变更后系统无剩余 enabled ADMIN 时拒绝
      const wasEnabledAdmin =
        existing.enabled === true && existing.role === "ADMIN";
      if (wasEnabledAdmin) {
        const admins = await tx.user.count({
          where: { enabled: true, role: "ADMIN" },
        });
        if (admins < 1) {
          throw new UserAdminError(
            "LAST_ENABLED_ADMIN_REQUIRED",
            USER_ADMIN_ERROR_MESSAGES.LAST_ENABLED_ADMIN_REQUIRED,
          );
        }
      }
      return next;
    });
    return mapUser(updated);
  } catch (error) {
    if (error instanceof UserAdminError) throw error;
    throw error;
  }
}

export type SetEnabledResult = {
  user: ManagedUserView;
  sessionRevokeFailed: boolean;
};

/**
 * 启停用户。enabled=false 先提交；再吊销 Session。
 * Session revoke 失败不回滚 enabled。
 */
export async function setUserEnabled(
  input: {
    userId: string;
    enabled: boolean;
  },
  adminHeaders: Headers,
): Promise<SetEnabledResult> {
  let updated;
  try {
    updated = await prisma.$transaction(async (tx) => {
      const existing = await tx.user.findUnique({ where: { id: input.userId } });
      if (!existing) {
        throw new UserAdminError(
          "USER_NOT_FOUND",
          USER_ADMIN_ERROR_MESSAGES.USER_NOT_FOUND,
        );
      }
      const next = await tx.user.update({
        where: { id: input.userId },
        data: { enabled: input.enabled },
      });
      // 仅停用 enabled ADMIN 时检查；re-enable 不触发
      const disablingEnabledAdmin =
        input.enabled === false &&
        existing.enabled === true &&
        existing.role === "ADMIN";
      if (disablingEnabledAdmin) {
        const admins = await tx.user.count({
          where: { enabled: true, role: "ADMIN" },
        });
        if (admins < 1) {
          throw new UserAdminError(
            "LAST_ENABLED_ADMIN_REQUIRED",
            USER_ADMIN_ERROR_MESSAGES.LAST_ENABLED_ADMIN_REQUIRED,
          );
        }
      }
      return next;
    });
  } catch (error) {
    if (error instanceof UserAdminError) throw error;
    throw error;
  }

  let sessionRevokeFailed = false;
  if (!input.enabled) {
    try {
      await auth.api.revokeUserSessions({
        body: { userId: input.userId },
        headers: adminHeaders,
      });
    } catch {
      sessionRevokeFailed = true;
    }
  }

  return { user: mapUser(updated), sessionRevokeFailed };
}

export async function getManagedUserById(
  userId: string,
): Promise<ManagedUserView | null> {
  const row = await prisma.user.findUnique({ where: { id: userId } });
  return row ? mapUser(row) : null;
}
