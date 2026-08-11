import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaClient } from "@/generated/prisma/client";
import { runPrismaMigrateDeploy } from "@/test-utils/runPrismaMigrateDeploy";
import { backupSqliteDatabase } from "@/services/runtime/sqliteBackup";
import { restoreSqliteDatabase } from "@/services/runtime/sqliteRestore";

const tempRoots: string[] = [];

function makeTempDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sta-m2-br-"));
  tempRoots.push(dir);
  return dir;
}

async function withClient<T>(
  dbPath: string,
  fn: (prisma: PrismaClient) => Promise<T>,
): Promise<T> {
  const url = `file:${dbPath.replace(/\\/g, "/")}`;
  const prisma = new PrismaClient({
    adapter: new PrismaBetterSqlite3({ url }),
  });
  try {
    return await fn(prisma);
  } finally {
    await prisma.$disconnect();
  }
}

async function seedRepresentative(dbPath: string): Promise<void> {
  await withClient(dbPath, async (prisma) => {
    await prisma.user.create({
      data: {
        id: "user-m2-1",
        name: "M2 Analyst",
        email: "m2-analyst@example.test",
        emailVerified: false,
        username: "m2_analyst",
        displayUsername: "m2_analyst",
        role: "ANALYST",
        enabled: true,
      },
    });

    const caseState = JSON.parse(
      JSON.stringify({
        caseData: { title: "M2 backup case" },
        checklist: [{ id: "c1", label: "check", completed: false }],
        humanReview: { humanRiskLevel: "MEDIUM", reviewer: "M2" },
        businessContext: {},
        timeline: [],
      }),
    );
    const reportDraft = JSON.parse(JSON.stringify({ overview: "draft" }));

    await prisma.caseRecord.create({
      data: {
        id: "case-m2-1",
        caseNumber: "INC-M2-001",
        title: "M2 backup preservation",
        status: "INVESTIGATING",
        suggestedRiskLevel: "HIGH",
        humanRiskLevel: "MEDIUM",
        humanConclusion: "SUSPECTED_INCIDENT",
        pendingChecklistCount: 1,
        hasReport: true,
        caseState,
        reportDraft,
        assignedToUserId: "user-m2-1",
        assignedAt: new Date("2026-08-11T02:00:00.000Z"),
        dueAt: new Date("2026-08-12T10:00:00.000Z"),
        lastActivityAt: new Date("2026-08-11T03:00:00.000Z"),
      },
    });

    await prisma.caseAuditLog.create({
      data: {
        id: "audit-m2-1",
        caseId: "case-m2-1",
        actionType: "CASE_CREATED",
        actorType: "SYSTEM",
        actorName: "系统",
        summary: "创建案件 INC-M2-001",
        operationId: "m2:case:created",
      },
    });
  });
}

describe("sqlite backup / restore", () => {
  beforeEach(() => {
    // ensure isolated env does not force production secrets
  });

  afterEach(() => {
    for (const dir of tempRoots.splice(0)) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("backs up and restores representative data with integrity", async () => {
    const dir = makeTempDir();
    const dbPath = path.join(dir, "live.db");
    const url = `file:${dbPath.replace(/\\/g, "/")}`;
    await runPrismaMigrateDeploy({ databaseUrl: url });
    await seedRepresentative(dbPath);

    const backup = await backupSqliteDatabase({
      databaseUrl: url,
      outputPath: path.join(dir, "backup.db"),
      clock: () => new Date("2026-08-11T12:00:00.000Z"),
    });
    expect(backup.integrity).toBe("ok");
    expect(fs.existsSync(backup.outputPath)).toBe(true);

    await withClient(dbPath, async (prisma) => {
      await prisma.caseAuditLog.deleteMany();
      await prisma.caseRecord.deleteMany();
      await prisma.user.deleteMany();
    });

    const restored = await restoreSqliteDatabase({
      databaseUrl: url,
      backupPath: backup.outputPath,
      confirmRestore: true,
      skipSafetyBackup: true,
    });
    expect(restored.integrity).toBe("ok");

    await withClient(dbPath, async (prisma) => {
      const row = await prisma.caseRecord.findUnique({
        where: { id: "case-m2-1" },
      });
      expect(row?.caseNumber).toBe("INC-M2-001");
      expect(row?.status).toBe("INVESTIGATING");
      expect(row?.suggestedRiskLevel).toBe("HIGH");
      expect(row?.humanRiskLevel).toBe("MEDIUM");
      expect(row?.assignedToUserId).toBe("user-m2-1");
      expect(row?.dueAt?.toISOString()).toBe("2026-08-12T10:00:00.000Z");
      expect(row?.reportDraft).toEqual({ overview: "draft" });
      const state = row?.caseState as { checklist: unknown[] };
      expect(state.checklist).toHaveLength(1);
      const audits = await prisma.caseAuditLog.count({
        where: { caseId: "case-m2-1" },
      });
      expect(audits).toBe(1);
      const migrations = await prisma.$queryRawUnsafe<Array<{ id: string }>>(
        `SELECT id FROM _prisma_migrations LIMIT 1`,
      );
      expect(migrations.length).toBe(1);
    });
  });

  it("rejects corrupt backup before replacing live DB", async () => {
    const dir = makeTempDir();
    const dbPath = path.join(dir, "live.db");
    const url = `file:${dbPath.replace(/\\/g, "/")}`;
    await runPrismaMigrateDeploy({ databaseUrl: url });
    await seedRepresentative(dbPath);

    const before = fs.readFileSync(dbPath);
    const corrupt = path.join(dir, "corrupt.db");
    fs.writeFileSync(corrupt, "not-a-sqlite-database");

    await expect(
      restoreSqliteDatabase({
        databaseUrl: url,
        backupPath: corrupt,
        confirmRestore: true,
        skipSafetyBackup: true,
      }),
    ).rejects.toThrow(/not a valid SQLite|integrity|backup/i);

    expect(fs.readFileSync(dbPath)).toEqual(before);
  });

  it("requires confirm-restore and rejects non-sqlite URL", async () => {
    const dir = makeTempDir();
    await expect(
      restoreSqliteDatabase({
        databaseUrl: "file:./x.db",
        backupPath: path.join(dir, "missing.db"),
        confirmRestore: false,
      }),
    ).rejects.toThrow(/confirm-restore/);

    await expect(
      backupSqliteDatabase({
        databaseUrl: "postgresql://localhost/db",
        outputPath: path.join(dir, "out.db"),
      }),
    ).rejects.toThrow(/SQLite file:/);
  });

  it("rejects same source/target and missing source", async () => {
    const dir = makeTempDir();
    const dbPath = path.join(dir, "only.db");
    const url = `file:${dbPath.replace(/\\/g, "/")}`;
    await expect(
      backupSqliteDatabase({ databaseUrl: url, outputPath: dbPath }),
    ).rejects.toThrow(/does not exist|differ/i);

    await runPrismaMigrateDeploy({ databaseUrl: url });
    await expect(
      backupSqliteDatabase({ databaseUrl: url, outputPath: dbPath }),
    ).rejects.toThrow(/differ/);
  });

  it("fails closed when stale sidecar cannot be cleared before live replacement", async () => {
    const dir = makeTempDir();
    const dbPath = path.join(dir, "live.db");
    const url = `file:${dbPath.replace(/\\/g, "/")}`;
    await runPrismaMigrateDeploy({ databaseUrl: url });
    await seedRepresentative(dbPath);

    const backup = await backupSqliteDatabase({
      databaseUrl: url,
      outputPath: path.join(dir, "backup.db"),
      clock: () => new Date("2026-08-11T13:00:00.000Z"),
    });

    await withClient(dbPath, async (prisma) => {
      await prisma.caseRecord.update({
        where: { id: "case-m2-1" },
        data: { title: "MUTATED-BEFORE-RESTORE" },
      });
    });

    const beforeBytes = fs.readFileSync(dbPath);
    const walPath = `${dbPath}-wal`;
    fs.writeFileSync(walPath, "stale-wal-bytes");

    const fsImpl = {
      ...fs,
      unlinkSync(target: fs.PathLike) {
        const asString = String(target);
        if (asString === walPath || asString.endsWith("live.db-wal")) {
          const err = new Error("permission denied") as NodeJS.ErrnoException;
          err.code = "EPERM";
          throw err;
        }
        return fs.unlinkSync(target);
      },
    } as typeof fs;

    const logLines: string[] = [];
    const logSpy = vi.spyOn(console, "log").mockImplementation((line) => {
      logLines.push(String(line));
    });
    const errSpy = vi.spyOn(console, "error").mockImplementation((line) => {
      logLines.push(String(line));
    });

    try {
      await expect(
        restoreSqliteDatabase({
          databaseUrl: url,
          backupPath: backup.outputPath,
          confirmRestore: true,
          skipSafetyBackup: true,
          fsImpl,
        }),
      ).rejects.toThrow(/failed to clear SQLite sidecar/i);

      expect(fs.readFileSync(dbPath)).toEqual(beforeBytes);
      await withClient(dbPath, async (prisma) => {
        const row = await prisma.caseRecord.findUnique({
          where: { id: "case-m2-1" },
        });
        expect(row?.title).toBe("MUTATED-BEFORE-RESTORE");
      });

      expect(
        logLines.some((line) => line.includes('"event":"restore_success"')),
      ).toBe(false);
      expect(
        logLines.some(
          (line) =>
            line.includes('"event":"restore_failed"') &&
            line.includes("sidecar_cleanup_failed"),
        ),
      ).toBe(true);
    } finally {
      logSpy.mockRestore();
      errSpy.mockRestore();
    }
  });
});
