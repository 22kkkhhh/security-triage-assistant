/**
 * Production / environment guards for auth, database URL, and destructive scripts.
 * Pure helpers are testable without importing Next.js or Prisma singletons.
 */

import path from "node:path";

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
  const raw = (
    options && "databaseUrl" in options
      ? options.databaseUrl
      : process.env.DATABASE_URL
  )?.trim();

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

const SQLITE_SIDEcar_SUFFIXES = ["", "-journal", "-wal", "-shm"] as const;

export type SqliteDatabaseFilePaths = {
  databaseUrl: string;
  dbFilePath: string;
  sidecarPaths: string[];
};

/**
 * Resolve a SQLite `file:` DATABASE_URL to absolute filesystem paths for reset-demo.
 * Relative paths follow Prisma semantics (relative to projectRoot, typically repo root).
 * Non-SQLite URLs fail closed — no guessing.
 */
export function resolveSqliteDatabaseFilePaths(options?: {
  databaseUrl?: string | undefined;
  nodeEnv?: string;
  projectRoot?: string;
}): SqliteDatabaseFilePaths {
  const databaseUrl = resolveDatabaseUrl({
    databaseUrl: options?.databaseUrl,
    nodeEnv: options?.nodeEnv,
  });

  if (!databaseUrl.startsWith("file:")) {
    throw new Error(
      "db:reset-demo 仅支持 SQLite file: DATABASE_URL。当前 URL 无法安全解析为本地文件路径。",
    );
  }

  const filePart = databaseUrl.slice("file:".length);
  if (!filePart) {
    throw new Error(
      "db:reset-demo 无法解析空的 SQLite file: DATABASE_URL。",
    );
  }

  const projectRoot = options?.projectRoot ?? process.cwd();
  let dbFilePath: string;

  if (filePart.startsWith("//")) {
    // file:///absolute/path (Prisma / SQLite URI)
    let absolute = decodeURIComponent(filePart.replace(/^\/\//, ""));
    if (/^\/[A-Za-z]:/.test(absolute)) {
      absolute = absolute.slice(1);
    }
    dbFilePath = path.resolve(absolute);
  } else if (path.isAbsolute(filePart)) {
    dbFilePath = path.resolve(filePart);
  } else {
    dbFilePath = path.resolve(projectRoot, filePart);
  }

  const sidecarPaths = SQLITE_SIDEcar_SUFFIXES.map(
    (suffix) => `${dbFilePath}${suffix}`,
  );

  return { databaseUrl, dbFilePath, sidecarPaths };
}

export type RemoveSqliteDatabaseFilesResult = {
  removed: boolean;
  deletedPaths: string[];
  busyPaths: string[];
};

/**
 * Remove SQLite database files (+ sidecars). Returns removed=false on EBUSY/EPERM
 * so callers can fall back to truncate via the same DATABASE_URL.
 */
export function removeSqliteDatabaseFiles(
  sidecarPaths: readonly string[],
  fsImpl: {
    existsSync: (filePath: string) => boolean;
    unlinkSync: (filePath: string) => void;
  },
): RemoveSqliteDatabaseFilesResult {
  const deletedPaths: string[] = [];
  const busyPaths: string[] = [];

  for (const filePath of sidecarPaths) {
    if (!fsImpl.existsSync(filePath)) continue;
    try {
      fsImpl.unlinkSync(filePath);
      deletedPaths.push(filePath);
    } catch (error) {
      const code =
        error && typeof error === "object" && "code" in error
          ? String((error as { code?: string }).code)
          : "";
      if (code === "EBUSY" || code === "EPERM") {
        busyPaths.push(filePath);
        return { removed: false, deletedPaths, busyPaths };
      }
      throw error;
    }
  }

  return { removed: true, deletedPaths, busyPaths };
}
