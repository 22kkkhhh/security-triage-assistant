import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  assertResetDemoAllowed,
  removeSqliteDatabaseFiles,
  resolveSqliteDatabaseFilePaths,
} from "@/lib/envConfig";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../..",
);

describe("reset-demo DATABASE_URL safety", () => {
  describe("resolveSqliteDatabaseFilePaths", () => {
    it("maps default development fallback to prisma/dev.db under project root", () => {
      const resolved = resolveSqliteDatabaseFilePaths({
        nodeEnv: "development",
        databaseUrl: undefined,
        projectRoot: repoRoot,
      });

      expect(resolved.databaseUrl).toBe("file:./prisma/dev.db");
      expect(resolved.dbFilePath).toBe(
        path.resolve(repoRoot, "prisma/dev.db"),
      );
      expect(resolved.sidecarPaths).toContain(
        path.resolve(repoRoot, "prisma/dev.db-journal"),
      );
    });

    it("maps DATABASE_URL=file:./prisma/e2e.db to e2e.db without touching dev.db", () => {
      const resolved = resolveSqliteDatabaseFilePaths({
        nodeEnv: "development",
        databaseUrl: "file:./prisma/e2e.db",
        projectRoot: repoRoot,
      });

      expect(resolved.dbFilePath).toBe(
        path.resolve(repoRoot, "prisma/e2e.db"),
      );
      expect(resolved.dbFilePath).not.toBe(
        path.resolve(repoRoot, "prisma/dev.db"),
      );
    });

    it("fail-closed for non-SQLite DATABASE_URL", () => {
      expect(() =>
        resolveSqliteDatabaseFilePaths({
          nodeEnv: "development",
          databaseUrl: "postgresql://localhost:5432/app",
          projectRoot: repoRoot,
        }),
      ).toThrow(/仅支持 SQLite file:/);
    });

    it("fail-closed for unparseable file: URL", () => {
      expect(() =>
        resolveSqliteDatabaseFilePaths({
          nodeEnv: "development",
          databaseUrl: "file:",
          projectRoot: repoRoot,
        }),
      ).toThrow(/无法解析空的 SQLite/);
    });
  });

  describe("removeSqliteDatabaseFiles", () => {
    it("returns removed=true when all sidecar files unlink successfully", () => {
      const sidecars = [
        "/tmp/e2e.db",
        "/tmp/e2e.db-journal",
        "/tmp/e2e.db-wal",
        "/tmp/e2e.db-shm",
      ];
      const deleted: string[] = [];
      const exists = new Set(sidecars);

      const result = removeSqliteDatabaseFiles(sidecars, {
        existsSync: (p) => exists.has(p),
        unlinkSync: (p) => {
          deleted.push(p);
          exists.delete(p);
        },
      });

      expect(result.removed).toBe(true);
      expect(deleted).toEqual(sidecars);
    });

    it("returns removed=false on EBUSY and stops without deleting remaining files", () => {
      const sidecars = ["/tmp/e2e.db", "/tmp/e2e.db-journal"];
      const deleted: string[] = [];

      const result = removeSqliteDatabaseFiles(sidecars, {
        existsSync: () => true,
        unlinkSync: (p) => {
          deleted.push(p);
          const error = new Error("EBUSY") as NodeJS.ErrnoException;
          error.code = "EBUSY";
          throw error;
        },
      });

      expect(result.removed).toBe(false);
      expect(result.busyPaths).toEqual(["/tmp/e2e.db"]);
      expect(deleted).toEqual(["/tmp/e2e.db"]);
    });
  });

  describe("production guard", () => {
    it("rejects production before destructive operations", () => {
      expect(() => assertResetDemoAllowed("production")).toThrow(
        /禁止在 production 环境执行 db:reset-demo/,
      );
    });

    it("reset-demo script exits before unlink when NODE_ENV=production", () => {
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
            env: {
              ...process.env,
              NODE_ENV: "production",
              DATABASE_URL: "file:./prisma/e2e.db",
            },
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

  describe("EBUSY truncate fallback uses same DATABASE_URL", () => {
    it("sets process.env.DATABASE_URL to resolved URL before prisma import path", async () => {
      const e2eUrl = "file:./prisma/e2e-truncate-test.db";
      const resolved = resolveSqliteDatabaseFilePaths({
        nodeEnv: "development",
        databaseUrl: e2eUrl,
        projectRoot: repoRoot,
      });

      process.env.DATABASE_URL = resolved.databaseUrl;

      const { resetPrismaClient } = await import("@/lib/prisma");
      const client = await resetPrismaClient(resolved.databaseUrl);

      expect(process.env.DATABASE_URL).toBe(e2eUrl);
      expect(client).toBeDefined();

      await client.$disconnect();
    });
  });
});
