/**
 * Better Auth server instance（v1.3 Step 2 persistence foundation）。
 *
 * - 复用 Prisma 7 + better-sqlite3 adapter 单例
 * - 不挂载 HTTP route（Step 3）
 * - 不创建 auth-client（Step 3）
 * - User.role 唯一物理 SoT：ADMIN | ANALYST | VIEWER（与 domain/auth UserRole 同名）
 * - enabled 为 server-owned additional field；产品禁用态不用 banned
 */
import "dotenv/config";
import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { admin, username } from "better-auth/plugins";
import { prisma } from "@/lib/prisma";
import {
  authAccessControl,
  authAdminRoles,
} from "@/lib/auth-access";

function requireAuthSecret(): string {
  const secret = process.env.BETTER_AUTH_SECRET?.trim();
  if (!secret || secret.length < 32) {
    throw new Error(
      "BETTER_AUTH_SECRET 未配置或熵不足（至少 32 字符）。请在 .env 中设置高熵密钥。",
    );
  }
  return secret;
}

const baseURL =
  process.env.BETTER_AUTH_URL?.trim() || "http://localhost:3000";

export const auth = betterAuth({
  database: prismaAdapter(prisma, {
    provider: "sqlite",
  }),
  secret: requireAuthSecret(),
  baseURL,
  emailAndPassword: {
    enabled: true,
    disableSignUp: true,
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
