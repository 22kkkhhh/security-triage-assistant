/**
 * Seed Audit 幂等 / lastActivityAt / 数据最小化（不扩大生产 API）。
 */
import { execSync } from "node:child_process";
import { existsSync, unlinkSync } from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { resetPrismaClient } from "@/lib/prisma";
import { HANDOFF_NOTE_MAX_LENGTH } from "@/domain/audit";

const TEST_DB_FILE = path.resolve("prisma/test-seed-audit.db");
const TEST_DB_URL = `file:${TEST_DB_FILE.replace(/\\/g, "/")}`;

function cleanDbFiles() {
  for (const suffix of ["", "-journal", "-wal", "-shm"]) {
    const file = `${TEST_DB_FILE}${suffix}`;
    if (existsSync(file)) unlinkSync(file);
  }
}

function runSeed() {
  execSync("npx tsx prisma/seed.ts", {
    env: { ...process.env, DATABASE_URL: TEST_DB_URL },
    stdio: "pipe",
  });
}

const FORBIDDEN_PAYLOAD_KEYS = [
  "caseState",
  "reportDraft",
  "securityCase",
  "analystNote",
  "businessJustification",
  "conclusionNote",
  "sections",
  "evidences",
  "analysisResults",
];

beforeAll(async () => {
  cleanDbFiles();
  process.env.DATABASE_URL = TEST_DB_URL;
  execSync("npx prisma migrate deploy", {
    env: { ...process.env, DATABASE_URL: TEST_DB_URL },
    stdio: "pipe",
  });
  await resetPrismaClient(TEST_DB_URL);
});

afterAll(async () => {
  const { prisma } = await import("@/lib/prisma");
  await prisma.$disconnect();
  cleanDbFiles();
});

describe("Demo Seed Audit（v1.2 RC）", () => {
  it(
    "幂等：重复 seed 不新增 Audit；lastActivityAt = MAX(createdAt)",
    async () => {
      runSeed();
      const { prisma } = await import("@/lib/prisma");
      await resetPrismaClient(TEST_DB_URL);

      const count1 = await prisma.caseAuditLog.count();
      const a1 = await prisma.caseRecord.findUniqueOrThrow({
        where: { id: "demo-case-a" },
      });
      const b1 = await prisma.caseRecord.findUniqueOrThrow({
        where: { id: "demo-case-b" },
      });

      expect(a1.humanConclusion).toBe("NORMAL_BUSINESS");
      expect(a1.hasReport).toBe(true);
      expect(a1.status).toBe("CLOSED");
      expect(b1.humanConclusion).toBe("SUSPECTED_SECURITY_INCIDENT");
      expect(b1.hasReport).toBe(false);
      expect(b1.status).toBe("PENDING_VERIFICATION");

      const aAudits1 = await prisma.caseAuditLog.count({
        where: { caseId: "demo-case-a" },
      });
      const bAudits1 = await prisma.caseAuditLog.count({
        where: { caseId: "demo-case-b" },
      });
      expect(aAudits1).toBe(6);
      expect(bAudits1).toBe(4);

      runSeed();
      await resetPrismaClient(TEST_DB_URL);
      const count2 = await prisma.caseAuditLog.count();
      expect(count2).toBe(count1);

      for (const caseId of ["demo-case-a", "demo-case-b"] as const) {
        const record = await prisma.caseRecord.findUniqueOrThrow({
          where: { id: caseId },
        });
        const maxAudit = await prisma.caseAuditLog.findFirst({
          where: { caseId },
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        });
        expect(maxAudit).not.toBeNull();
        expect(record.lastActivityAt.getTime()).toBe(
          maxAudit!.createdAt.getTime(),
        );
      }

      // 重复 seed 不得把 lastActivityAt 刷成「现在」
      const a2 = await prisma.caseRecord.findUniqueOrThrow({
        where: { id: "demo-case-a" },
      });
      expect(a2.lastActivityAt.getTime()).toBe(a1.lastActivityAt.getTime());
      expect(a2.lastActivityAt.getTime()).toBeLessThan(Date.now() - 60_000);
    },
    60_000,
  );

  it("Audit payload 最小化：不含完整案件/报告/敏感全文", async () => {
    const { prisma } = await import("@/lib/prisma");
    await resetPrismaClient(TEST_DB_URL);
    const logs = await prisma.caseAuditLog.findMany();
    expect(logs.length).toBeGreaterThan(0);

    for (const log of logs) {
      const blob = JSON.stringify({
        changes: log.changes,
        metadata: log.metadata,
        summary: log.summary,
      });
      for (const key of FORBIDDEN_PAYLOAD_KEYS) {
        expect(blob.includes(`"${key}"`)).toBe(false);
      }
      if (log.actionType === "HANDOFF_NOTE_ADDED") {
        const meta = log.metadata as { note?: string } | null;
        expect(typeof meta?.note).toBe("string");
        expect(meta!.note!.length).toBeGreaterThan(0);
        expect(meta!.note!.length).toBeLessThanOrEqual(HANDOFF_NOTE_MAX_LENGTH);
      }
      // 时间单调：同案不得出现闭环后再「开始研判」类逆序（Seed 固定）
      expect(log.operationId?.startsWith("seed:v12:")).toBe(true);
    }

    const aLogs = await prisma.caseAuditLog.findMany({
      where: { caseId: "demo-case-a" },
      orderBy: { createdAt: "asc" },
    });
    for (let i = 1; i < aLogs.length; i++) {
      expect(aLogs[i]!.createdAt.getTime()).toBeGreaterThanOrEqual(
        aLogs[i - 1]!.createdAt.getTime(),
      );
    }
  });
});
