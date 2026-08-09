/**
 * Production bootstrap：仅在无 enabled ADMIN 时创建首个 ADMIN。
 * CLI：npm run user:bootstrap-admin
 */

import {
  USER_ADMIN_ERROR_MESSAGES,
  UserAdminError,
} from "@/domain/userAdminErrors";
import { isPasswordLengthValid } from "@/domain/passwordPolicy";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { countEnabledAdmins } from "./userAdminService";

export type BootstrapAdminInput = {
  username: string;
  email: string;
  displayName: string;
  password: string;
};

export type BootstrapAdminResult = {
  id: string;
  username: string;
  email: string;
  displayName: string;
  role: "ADMIN";
  enabled: true;
};

export function parseBootstrapEnv(env: NodeJS.ProcessEnv = process.env): BootstrapAdminInput {
  const username = env.BOOTSTRAP_ADMIN_USERNAME?.trim();
  const email = env.BOOTSTRAP_ADMIN_EMAIL?.trim();
  const displayName = env.BOOTSTRAP_ADMIN_DISPLAY_NAME?.trim();
  const password = env.BOOTSTRAP_ADMIN_PASSWORD;
  if (!username || !email || !displayName || !password) {
    throw new UserAdminError(
      "BOOTSTRAP_ENV_MISSING",
      USER_ADMIN_ERROR_MESSAGES.BOOTSTRAP_ENV_MISSING,
    );
  }
  return {
    username: username.toLowerCase(),
    email: email.toLowerCase(),
    displayName,
    password,
  };
}

export async function bootstrapAdmin(
  input: BootstrapAdminInput,
): Promise<BootstrapAdminResult> {
  const username = input.username.trim().toLowerCase();
  const email = input.email.trim().toLowerCase();
  if (
    username.length < 3 ||
    username.length > 30 ||
    !/^[a-z0-9_.-]+$/.test(username)
  ) {
    throw new UserAdminError("INVALID_INPUT", "用户名无效。");
  }
  if (!input.displayName.trim()) {
    throw new UserAdminError("INVALID_INPUT", "显示名称不能为空。");
  }
  if (!email.includes("@")) {
    throw new UserAdminError("INVALID_INPUT", "邮箱无效。");
  }
  if (!isPasswordLengthValid(input.password)) {
    throw new UserAdminError("INVALID_INPUT", "密码长度不符合要求。");
  }

  const existingAdmins = await countEnabledAdmins();
  if (existingAdmins > 0) {
    throw new UserAdminError(
      "BOOTSTRAP_ADMIN_EXISTS",
      USER_ADMIN_ERROR_MESSAGES.BOOTSTRAP_ADMIN_EXISTS,
    );
  }

  await auth.api.createUser({
    body: {
      email,
      password: input.password,
      name: input.displayName.trim(),
      role: "ADMIN",
      data: { username },
    },
  });

  const created = await prisma.user.findFirst({
    where: { username },
  });
  if (!created || created.role !== "ADMIN" || !created.enabled) {
    throw new UserAdminError("INVALID_INPUT", "bootstrap 创建后校验失败。");
  }

  return {
    id: created.id,
    username: created.username ?? username,
    email: created.email,
    displayName: created.name,
    role: "ADMIN",
    enabled: true,
  };
}
