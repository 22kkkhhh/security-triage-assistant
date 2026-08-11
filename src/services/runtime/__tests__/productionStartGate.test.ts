import { describe, expect, it, vi } from "vitest";
import { runProductionStartGate } from "@/services/runtime/productionStartGate";

const VALID_ENV = {
  NODE_ENV: "production",
  BETTER_AUTH_SECRET: "a".repeat(32),
  BETTER_AUTH_URL: "https://triage.example.com",
  DATABASE_URL: "file:./prisma/prod.db",
};

describe("runProductionStartGate", () => {
  it("env fail → migration not called, Next not started", async () => {
    const migrateDeploy = vi.fn(async () => undefined);
    const startNext = vi.fn(async () => 0);
    const errors: string[] = [];

    const result = await runProductionStartGate({
      env: { ...VALID_ENV, BETTER_AUTH_SECRET: "short" },
      migrateDeploy,
      startNext,
      checkReadiness: async () => ({ ready: true }),
      logError: (m) => errors.push(m),
    });

    expect(result.exitCode).not.toBe(0);
    expect(result.nextStarted).toBe(false);
    expect(result.stage).toBe("env");
    expect(migrateDeploy).not.toHaveBeenCalled();
    expect(startNext).not.toHaveBeenCalled();
    expect(errors.join("\n")).toMatch(/production env validation failed/);
    expect(errors.join("\n")).not.toMatch(/BETTER_AUTH_SECRET=|file:\.\/prisma/);
  });

  it("migration fail → Next not started", async () => {
    const startNext = vi.fn(async () => 0);
    const errors: string[] = [];

    const result = await runProductionStartGate({
      env: VALID_ENV,
      validateEnv: () => undefined,
      preflightFilesystem: () => undefined,
      migrateDeploy: async () => {
        throw new Error("P3009 migrate exploded with path C:\\\\secret\\\\db");
      },
      checkReadiness: async () => ({ ready: true }),
      startNext,
      logError: (m) => errors.push(m),
    });

    expect(result.exitCode).not.toBe(0);
    expect(result.nextStarted).toBe(false);
    expect(result.stage).toBe("migrate");
    expect(startNext).not.toHaveBeenCalled();
    expect(errors).toEqual(["database migration failed"]);
    expect(errors.join("\n")).not.toMatch(/P3009|C:\\\\secret/);
  });

  it("readiness fail → Next not started", async () => {
    const startNext = vi.fn(async () => 0);
    const errors: string[] = [];

    const result = await runProductionStartGate({
      env: VALID_ENV,
      validateEnv: () => undefined,
      preflightFilesystem: () => undefined,
      migrateDeploy: async () => undefined,
      checkReadiness: async () => ({
        ready: false,
        category: "schema_not_ready",
      }),
      startNext,
      logError: (m) => errors.push(m),
    });

    expect(result.exitCode).not.toBe(0);
    expect(result.nextStarted).toBe(false);
    expect(result.stage).toBe("readiness");
    expect(startNext).not.toHaveBeenCalled();
    expect(errors.join("\n")).toMatch(/schema is not ready/);
  });

  it("all pass → Next start invoked", async () => {
    const migrateDeploy = vi.fn(async () => undefined);
    const startNext = vi.fn(async () => 0);
    const errors: string[] = [];

    const result = await runProductionStartGate({
      env: VALID_ENV,
      validateEnv: () => undefined,
      preflightFilesystem: () => undefined,
      migrateDeploy,
      checkReadiness: async () => ({ ready: true }),
      startNext,
      logError: (m) => errors.push(m),
    });

    expect(result.exitCode).toBe(0);
    expect(result.nextStarted).toBe(true);
    expect(result.stage).toBe("complete");
    expect(migrateDeploy).toHaveBeenCalledOnce();
    expect(startNext).toHaveBeenCalledOnce();
    expect(errors).toEqual([]);
  });

  it("filesystem fail stops before migrate", async () => {
    const migrateDeploy = vi.fn(async () => undefined);
    const errors: string[] = [];

    const result = await runProductionStartGate({
      env: VALID_ENV,
      validateEnv: () => undefined,
      preflightFilesystem: () => {
        throw new Error("数据库目录不可写");
      },
      migrateDeploy,
      startNext: async () => 0,
      logError: (m) => errors.push(m),
    });

    expect(result.stage).toBe("filesystem");
    expect(migrateDeploy).not.toHaveBeenCalled();
    expect(errors).toEqual(["database filesystem preflight failed"]);
  });
});
