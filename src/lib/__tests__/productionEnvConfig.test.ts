import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  assertResetDemoAllowed,
  assertSqliteParentDirectoryReady,
  BETTER_AUTH_SECRET_PLACEHOLDERS,
  resolveDatabaseUrl,
  resolveSessionCookieSecureFromAuthUrl,
  validateBetterAuthSecret,
  validateBetterAuthUrl,
  validateProductionEnvironment,
  type SqliteFilesystemPreflightFs,
} from "@/lib/envConfig";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../..",
);

const VALID_SECRET = "a".repeat(32);

describe("production env config guards", () => {
  describe("validateBetterAuthSecret", () => {
    it("rejects placeholder secret from .env.example", () => {
      expect(() =>
        validateBetterAuthSecret(BETTER_AUTH_SECRET_PLACEHOLDERS[0]),
      ).toThrow(/不得使用仓库 .env.example 占位值/);
    });

    it("rejects too-short secret", () => {
      expect(() => validateBetterAuthSecret("short-secret")).toThrow(
        /至少 32 字符/,
      );
    });

    it("accepts configured high-entropy secret", () => {
      expect(validateBetterAuthSecret(VALID_SECRET)).toBe(VALID_SECRET);
    });
  });

  describe("resolveDatabaseUrl", () => {
    it("rejects production when DATABASE_URL is missing", () => {
      expect(() =>
        resolveDatabaseUrl({ nodeEnv: "production", databaseUrl: undefined }),
      ).toThrow(/production 必须显式配置 DATABASE_URL/);
    });

    it("rejects production when DATABASE_URL is blank", () => {
      expect(() =>
        resolveDatabaseUrl({ nodeEnv: "production", databaseUrl: "   " }),
      ).toThrow(/production 必须显式配置 DATABASE_URL/);
    });

    it("accepts production when DATABASE_URL is configured", () => {
      expect(
        resolveDatabaseUrl({
          nodeEnv: "production",
          databaseUrl: "file:./prisma/prod.db",
        }),
      ).toBe("file:./prisma/prod.db");
    });

    it("keeps development fallback when DATABASE_URL is missing", () => {
      expect(
        resolveDatabaseUrl({
          nodeEnv: "development",
          databaseUrl: undefined,
        }),
      ).toBe("file:./prisma/dev.db");
    });

    it("keeps test fallback when DATABASE_URL is missing", () => {
      expect(
        resolveDatabaseUrl({
          nodeEnv: "test",
          databaseUrl: undefined,
          fallbackUrl: "file:./prisma/test.db",
        }),
      ).toBe("file:./prisma/test.db");
    });
  });

  describe("validateBetterAuthUrl", () => {
    it("rejects missing URL", () => {
      expect(() => validateBetterAuthUrl(undefined)).toThrow(/未配置/);
    });

    it("rejects invalid URL", () => {
      expect(() => validateBetterAuthUrl("not-a-url")).toThrow(/合法的绝对 URL/);
    });

    it("rejects non-http(s) protocol", () => {
      expect(() => validateBetterAuthUrl("ftp://example.com")).toThrow(
        /仅允许 http 或 https/,
      );
    });

    it("rejects non-loopback HTTP in production", () => {
      expect(() =>
        validateBetterAuthUrl("http://triage.example.com", {
          nodeEnv: "production",
        }),
      ).toThrow(/必须使用 https/);
    });

    it("allows localhost HTTP in production", () => {
      expect(
        validateBetterAuthUrl("http://localhost:3000", {
          nodeEnv: "production",
        }),
      ).toBe("http://localhost:3000");
    });

    it("allows 127.0.0.1 HTTP in production", () => {
      expect(
        validateBetterAuthUrl("http://127.0.0.1:3000", {
          nodeEnv: "production",
        }),
      ).toBe("http://127.0.0.1:3000");
    });

    it("allows production HTTPS", () => {
      expect(
        validateBetterAuthUrl("https://triage.example.com", {
          nodeEnv: "production",
        }),
      ).toBe("https://triage.example.com");
    });
  });

  describe("validateProductionEnvironment", () => {
    const base = {
      NODE_ENV: "production",
      BETTER_AUTH_SECRET: VALID_SECRET,
      BETTER_AUTH_URL: "https://triage.example.com",
      DATABASE_URL: "file:./prisma/prod.db",
    };

    it("rejects missing secret", () => {
      expect(() =>
        validateProductionEnvironment({ ...base, BETTER_AUTH_SECRET: undefined }),
      ).toThrow(/BETTER_AUTH_SECRET/);
    });

    it("rejects placeholder secret", () => {
      expect(() =>
        validateProductionEnvironment({
          ...base,
          BETTER_AUTH_SECRET: BETTER_AUTH_SECRET_PLACEHOLDERS[0],
        }),
      ).toThrow(/占位值/);
    });

    it("rejects missing database", () => {
      expect(() =>
        validateProductionEnvironment({ ...base, DATABASE_URL: undefined }),
      ).toThrow(/DATABASE_URL/);
    });

    it("rejects non-file database URL", () => {
      expect(() =>
        validateProductionEnvironment({
          ...base,
          DATABASE_URL: "postgresql://localhost/db",
        }),
      ).toThrow(/SQLite file:/);
    });

    it("rejects missing auth URL", () => {
      expect(() =>
        validateProductionEnvironment({ ...base, BETTER_AUTH_URL: undefined }),
      ).toThrow(/BETTER_AUTH_URL/);
    });

    it("rejects invalid auth URL", () => {
      expect(() =>
        validateProductionEnvironment({ ...base, BETTER_AUTH_URL: "bad" }),
      ).toThrow(/绝对 URL/);
    });

    it("rejects non-loopback HTTP production URL", () => {
      expect(() =>
        validateProductionEnvironment({
          ...base,
          BETTER_AUTH_URL: "http://triage.example.com",
        }),
      ).toThrow(/https/);
    });

    it("allows localhost HTTP", () => {
      const cfg = validateProductionEnvironment({
        ...base,
        BETTER_AUTH_URL: "http://127.0.0.1:3000",
      });
      expect(cfg.betterAuthUrl).toBe("http://127.0.0.1:3000");
    });

    it("allows production HTTPS", () => {
      const cfg = validateProductionEnvironment(base);
      expect(cfg.nodeEnv).toBe("production");
      expect(cfg.databaseUrl).toBe("file:./prisma/prod.db");
    });

    it("rejects non-production NODE_ENV", () => {
      expect(() =>
        validateProductionEnvironment({ ...base, NODE_ENV: "development" }),
      ).toThrow(/NODE_ENV=production/);
    });
  });

  describe("session cookie secure derivation", () => {
    it("https URL → secure cookie expected", () => {
      expect(
        resolveSessionCookieSecureFromAuthUrl("https://triage.example.com"),
      ).toBe(true);
    });

    it("http loopback URL → secure cookie false (BA default)", () => {
      expect(
        resolveSessionCookieSecureFromAuthUrl("http://127.0.0.1:3000"),
      ).toBe(false);
    });
  });

  describe("assertSqliteParentDirectoryReady", () => {
    it("creates missing parent and verifies writability via fs adapter", () => {
      const files = new Set<string>();
      const dirs = new Set<string>();
      const fsImpl: SqliteFilesystemPreflightFs = {
        existsSync: (p) => dirs.has(p) || files.has(p),
        mkdirSync: (p) => {
          dirs.add(p);
          return p;
        },
        accessSync: () => undefined,
        writeFileSync: (p) => {
          files.add(p);
        },
        unlinkSync: (p) => {
          files.delete(p);
        },
        constants: { W_OK: 2 },
      };

      const result = assertSqliteParentDirectoryReady({
        nodeEnv: "production",
        databaseUrl: "file:./tmp-preflight/nested/prod.db",
        projectRoot: "C:\\app",
        fsImpl,
      });

      expect(result.parentDir.replace(/\\/g, "/")).toMatch(/tmp-preflight\/nested$/);
      expect(dirs.size).toBeGreaterThan(0);
    });

    it("fails closed when directory is not writable", () => {
      const fsImpl: SqliteFilesystemPreflightFs = {
        existsSync: () => true,
        mkdirSync: () => undefined,
        accessSync: () => {
          throw new Error("EACCES");
        },
        writeFileSync: () => undefined,
        unlinkSync: () => undefined,
        constants: { W_OK: 2 },
      };

      expect(() =>
        assertSqliteParentDirectoryReady({
          nodeEnv: "production",
          databaseUrl: "file:./prisma/prod.db",
          projectRoot: repoRoot,
          fsImpl,
        }),
      ).toThrow(/不可写/);
    });
  });

  describe("assertResetDemoAllowed", () => {
    it("rejects production reset-demo before destructive work", () => {
      expect(() => assertResetDemoAllowed("production")).toThrow(
        /禁止在 production 环境执行 db:reset-demo/,
      );
    });

    it("allows development reset-demo", () => {
      expect(() => assertResetDemoAllowed("development")).not.toThrow();
    });
  });

  describe("reset-demo script production guard", () => {
    it("exits before destructive operations in production", () => {
      const command =
        process.platform === "win32"
          ? {
              executable: process.env.ComSpec ?? "cmd.exe",
              args: ["/d", "/s", "/c", "npx tsx scripts/reset-demo.ts"],
            }
          : { executable: "npx", args: ["tsx", "scripts/reset-demo.ts"] };
      const result = (() => {
        try {
          execFileSync(command.executable, command.args, {
            cwd: repoRoot,
            env: { ...process.env, NODE_ENV: "production" },
            stdio: "pipe",
          });
          return { exitCode: 0, stderr: "", stdout: "" };
        } catch (error) {
          const execError = error as {
            status?: number;
            stderr?: Buffer | string;
            stdout?: Buffer | string;
          };
          return {
            exitCode: execError.status ?? 1,
            stderr: String(execError.stderr ?? ""),
            stdout: String(execError.stdout ?? ""),
          };
        }
      })();

      expect(result.exitCode).not.toBe(0);
      const output = `${result.stderr}\n${result.stdout}`;
      expect(output).toMatch(/禁止在 production 环境执行 db:reset-demo/);
      expect(output).not.toMatch(/Demo 复位完成/);
      expect(output).not.toMatch(/已删除 prisma/);
    });
  });
});
