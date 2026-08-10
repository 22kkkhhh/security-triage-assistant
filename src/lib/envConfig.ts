/**
 * Production / environment guards for auth, database URL, and destructive scripts.
 * Pure helpers are testable without importing Next.js or Prisma singletons.
 */

export const BETTER_AUTH_SECRET_MIN_LENGTH = 32;

/** Values shipped in .env.example that must never be used as a real secret. */
export const BETTER_AUTH_SECRET_PLACEHOLDERS: readonly string[] = [
  "replace-with-a-high-entropy-secret-at-least-32-chars",
];

const DEFAULT_DEV_DATABASE_URL = "file:./prisma/dev.db";

export function isProductionNodeEnv(nodeEnv?: string): boolean {
  return (nodeEnv ?? process.env.NODE_ENV) === "production";
}

export function isForbiddenBetterAuthSecretPlaceholder(secret: string): boolean {
  return BETTER_AUTH_SECRET_PLACEHOLDERS.includes(secret);
}

export function validateBetterAuthSecret(
  secret: string | undefined,
  options?: { nodeEnv?: string },
): string {
  void options?.nodeEnv;
  const trimmed = secret?.trim();
  if (!trimmed || trimmed.length < BETTER_AUTH_SECRET_MIN_LENGTH) {
    throw new Error(
      "BETTER_AUTH_SECRET 未配置或长度不足（至少 32 字符）。请在环境变量中设置高熵密钥。",
    );
  }
  if (isForbiddenBetterAuthSecretPlaceholder(trimmed)) {
    throw new Error(
      "BETTER_AUTH_SECRET 不得使用仓库 .env.example 占位值。请设置独立的高熵密钥。",
    );
  }
  return trimmed;
}

export function resolveDatabaseUrl(options?: {
  databaseUrl?: string | undefined;
  nodeEnv?: string;
  fallbackUrl?: string;
}): string {
  const nodeEnv = options?.nodeEnv ?? process.env.NODE_ENV;
  const raw = (options?.databaseUrl ?? process.env.DATABASE_URL)?.trim();

  if (isProductionNodeEnv(nodeEnv)) {
    if (!raw) {
      throw new Error(
        "production 必须显式配置 DATABASE_URL，禁止回退到本地 Demo SQLite。",
      );
    }
    return raw;
  }

  return raw || options?.fallbackUrl || DEFAULT_DEV_DATABASE_URL;
}

export function assertResetDemoAllowed(nodeEnv?: string): void {
  if (isProductionNodeEnv(nodeEnv)) {
    throw new Error(
      "禁止在 production 环境执行 db:reset-demo。该命令会 destructive 清空数据库。",
    );
  }
}
