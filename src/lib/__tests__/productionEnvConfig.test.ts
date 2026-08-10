import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  assertResetDemoAllowed,
  BETTER_AUTH_SECRET_PLACEHOLDERS,
  resolveDatabaseUrl,
  validateBetterAuthSecret,
} from "@/lib/envConfig";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../..",
);

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
      const secret = "a".repeat(32);
      expect(validateBetterAuthSecret(secret)).toBe(secret);
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
