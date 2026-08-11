/**
 * Better Auth server instance（v1.3 Step 2–3）。
 *
 * - 复用 Prisma 7 + better-sqlite3 adapter 单例
 * - HTTP handler：/api/auth/[...all]（Step 3）
 * - Client：src/lib/auth-client.ts（仅 username / session）
 * - User.role 唯一物理 SoT：ADMIN | ANALYST | VIEWER
 * - enabled 为 server-owned；产品禁用态不用 banned
 *
 * 本文件仅供 Server 导入；禁止从 Client Component 引用。
 */
import "dotenv/config";
import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { admin, username } from "better-auth/plugins";
import { prisma } from "@/lib/prisma";
import {
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
} from "@/domain/passwordPolicy";
import {
  authAccessControl,
  authAdminRoles,
} from "@/lib/auth-access";
import {
  buildBetterAuthAdvancedOptions,
  buildBetterAuthRateLimitOptions,
} from "@/lib/authRuntimeConfig";
import {
  validateBetterAuthSecret,
  validateBetterAuthUrl,
} from "@/lib/envConfig";

function requireAuthSecret(): string {
  return validateBetterAuthSecret(process.env.BETTER_AUTH_SECRET);
}

function resolveBaseURL(): string {
  const url = process.env.BETTER_AUTH_URL?.trim();
  if (url) {
    return validateBetterAuthUrl(url, { nodeEnv: process.env.NODE_ENV });
  }
  if (process.env.NODE_ENV === "production") {
    throw new Error("production 必须显式配置 BETTER_AUTH_URL");
  }
  return "http://localhost:3000";
}

const baseURL = resolveBaseURL();

export const auth = betterAuth({
  database: prismaAdapter(prisma, {
    provider: "sqlite",
  }),
  secret: requireAuthSecret(),
  baseURL,
  trustedOrigins: [baseURL],
  /**
   * Native Better Auth 1.6.26 rate limit (memory; enabled in production by library).
   * /sign-in paths use built-in special rule (3 / 10s). No Redis.
   */
  rateLimit: buildBetterAuthRateLimitOptions(),
  /**
   * Cookie httpOnly + SameSite=lax + Secure-from-https baseURL are library defaults
   * (better-auth/dist/cookies/index.mjs). Do not monkey-patch Set-Cookie.
   * IP headers empty until trustedProxies are explicitly configured.
   */
  advanced: buildBetterAuthAdvancedOptions(),
  emailAndPassword: {
    enabled: true,
    disableSignUp: true,
    minPasswordLength: PASSWORD_MIN_LENGTH,
    maxPasswordLength: PASSWORD_MAX_LENGTH,
  },
  /** 无公开注册；关闭用户名枚举面 */
  disabledPaths: ["/is-username-available"],
  user: {
    additionalFields: {
      /**
       * 产品账号启用状态（server-owned）。
       * 禁用流程：enabled=false + revoke sessions（后续 Step）；不使用 banned 产品状态机。
       */
      enabled: {
        type: "boolean",
        required: true,
        defaultValue: true,
        input: false,
      },
    },
  },
  /**
   * Admin createUser 会 spread body.data，可能绕过 additionalFields.input=false。
   * 创建时强制 enabled=true，保证 server-owned 默认。
   */
  databaseHooks: {
    user: {
      create: {
        async before(user) {
          return {
            data: {
              ...user,
              enabled: true,
            },
          };
        },
      },
    },
  },
  plugins: [
    username({
      minUsernameLength: 3,
      maxUsernameLength: 30,
      /** 允许连字符（如 demo-admin）；仍禁止空格与其它特殊字符 */
      usernameValidator: (value) => /^[a-zA-Z0-9_.-]+$/.test(value),
    }),
    admin({
      ac: authAccessControl,
      roles: authAdminRoles,
      defaultRole: "VIEWER",
      adminRoles: ["ADMIN"],
    }),
  ],
});

export type Auth = typeof auth;
