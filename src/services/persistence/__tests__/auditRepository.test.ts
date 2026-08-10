import { runPrismaMigrateDeploy } from "@/test-utils/runPrismaMigrateDeploy";
import { existsSync, unlinkSync } from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { caseA } from "@/domain/demo";
import { analyzeSecurityCase } from "@/services/analysis/analyzeSecurityCase";
import {
  buildCaseCreatedAudit,
  buildHandoffAudit,
  buildStatusChangedAudit,
  manualActor,
  systemActor,
} from "@/services/audit/auditEventBuilder";
import { resetPrismaClient } from "@/lib/prisma";
import {
  appendAuditLog,
  appendCaseAudit,
  getLatestHandoffNote,
  listCaseAuditLogs,
  runInTransaction,
} from "@/services/persistence/auditRepository";
import { createCase, getCaseById } from "@/services/persistence/caseRepository";

const TEST_DB_FILE = path.resolve("prisma/test-audit.db");
const TEST_DB_URL = `file:${TEST_DB_FILE.replace(/\\/g, "/")}`;

function cleanDbFiles() {
  for (const suffix of ["", "-journal", "-wal", "-shm"]) {
    const file = `${TEST_DB_FILE}${suffix}`;
    if (existsSync(file)) unlinkSync(file);
  }
}

async function createDemoCase() {
  const analyzed = analyzeSecurityCase(caseA);
  return createCase({
    draft: caseA,
    checklist: analyzed.checklist,
    suggestedRiskLevel: analyzed.suggestedAssessment?.suggestedRiskLevel ?? null,
  });
}

beforeAll(async () => {
  cleanDbFiles();
  process.env.DATABASE_URL = TEST_DB_URL;
  runPrismaMigrateDeploy({ databaseUrl: TEST_DB_URL });
  await resetPrismaClient(TEST_DB_URL);
});

beforeEach(async () => {
  const { prisma } = await import("@/lib/prisma");
  // Restrict：必须先删 Audit 再删 Case
  await prisma.caseAuditLog.deleteMany();
  await prisma.caseRecord.deleteMany();
});

afterAll(async () => {
  const { prisma } = await import("@/lib/prisma");
  await prisma.$disconnect();
  cleanDbFiles();
});

describe("auditRepository（v1.2 Step 1）", () => {
  it("创建案件后 lastActivityAt 已存在", async () => {
    const created = await createDemoCase();
    expect(created.lastActivityAt).toBeTruthy();
    const restored = await getCaseById(created.id);
    expect(restored?.lastActivityAt).toBe(created.lastActivityAt);
  });

  it("appendCaseAudit 写入 actor 并更新 lastActivityAt", async () => {
    const created = await createDemoCase();
    const before = created.lastActivityAt;

    await new Promise((r) => setTimeout(r, 15));

    const event = buildStatusChangedAudit({
      from: "INVESTIGATING",
      to: "PENDING_VERIFICATION",
      actor: manualActor("王研判")
});
    const log = await appendCaseAudit({ caseId: created.id, ...event });

    expect(log.actorType).toBe("MANUAL");
    expect(log.actorName).toBe("王研判");
    expect(log.actionType).toBe("STATUS_CHANGED");

    const after = await getCaseById(created.id);
    expect(after).not.toBeNull();
    expect(new Date(after!.lastActivityAt).getTime()).toBeGreaterThan(
      new Date(before).getTime(),
    );
  });

  it("list 默认 DESC，且按 case 隔离", async () => {
    const a = await createDemoCase();
    const b = await createDemoCase();

    await appendCaseAudit({
      caseId: a.id,
      ...buildCaseCreatedAudit({ caseNumber: a.caseNumber, actor: systemActor()
}),
    });
    await appendCaseAudit({
      caseId: a.id,
      ...buildStatusChangedAudit({
        from: "INVESTIGATING",
        to: "PENDING_VERIFICATION",
        actor: manualActor("甲")
}),
    });
    await appendCaseAudit({
      caseId: b.id,
      ...buildCaseCreatedAudit({ caseNumber: b.caseNumber, actor: systemActor()
}),
    });

    const listed = await listCaseAuditLogs({ caseId: a.id });
    expect(listed.items).toHaveLength(2);
    expect(listed.items.every((x) => x.caseId === a.id)).toBe(true);
    expect(listed.items[0]!.actionType).toBe("STATUS_CHANGED");
    expect(listed.items[1]!.actionType).toBe("CASE_CREATED");
  });

  it("分页 cursor 正确", async () => {
    const created = await createDemoCase();
    for (let i = 0; i < 5; i++) {
      await appendCaseAudit({
        caseId: created.id,
        ...buildStatusChangedAudit({
          from: "INVESTIGATING",
          to: "PENDING_VERIFICATION",
          operationId: `op-page-${created.id}-${i}`, actor: manualActor("王研判")
}),
      });
    }

    const page1 = await listCaseAuditLogs({ caseId: created.id, limit: 2 });
    expect(page1.items).toHaveLength(2);
    expect(page1.hasMore).toBe(true);
    expect(page1.nextCursor).toBeTruthy();

    const page2 = await listCaseAuditLogs({
      caseId: created.id,
      limit: 2,
      cursor: page1.nextCursor,
    });
    expect(page2.items).toHaveLength(2);
    expect(page1.items[0]!.id).not.toBe(page2.items[0]!.id);

    const page3 = await listCaseAuditLogs({
      caseId: created.id,
      limit: 2,
      cursor: page2.nextCursor,
    });
    expect(page3.items).toHaveLength(1);
    expect(page3.hasMore).toBe(false);
    expect(page3.nextCursor).toBeNull();
  });

  it("最新交接由 HANDOFF_NOTE_ADDED 派生", async () => {
    const created = await createDemoCase();
    expect(await getLatestHandoffNote(created.id)).toBeNull();

    await appendCaseAudit({
      caseId: created.id,
      ...buildHandoffAudit({
        note: "第一班：已联系业务方",
        actor: manualActor("甲")
}),
    });
    await appendCaseAudit({
      caseId: created.id,
      ...buildHandoffAudit({
        note: "第二班：等待 CRM 确认，重点查出口日志",
        actor: manualActor("乙")
}),
    });

    const latest = await getLatestHandoffNote(created.id);
    expect(latest?.actorName).toBe("乙");
    expect(latest?.metadata?.note).toBe(
      "第二班：等待 CRM 确认，重点查出口日志",
    );
  });

  it("删除 CaseRecord 在存在 Audit 时被 Restrict，不会静默级联删除", async () => {
    const { prisma } = await import("@/lib/prisma");
    const created = await createDemoCase();
    await appendCaseAudit({
      caseId: created.id,
      ...buildCaseCreatedAudit({ caseNumber: created.caseNumber, actor: systemActor()
}),
    });

    await expect(
      prisma.caseRecord.delete({ where: { id: created.id } }),
    ).rejects.toThrow();

    const still = await listCaseAuditLogs({ caseId: created.id });
    expect(still.items).toHaveLength(1);
  });

  it("事务内 Audit 失败时业务修改不得半成功", async () => {
    const { prisma } = await import("@/lib/prisma");
    const created = await createDemoCase();
    const beforeStatus = created.status;

    await expect(
      runInTransaction(async (tx) => {
        await tx.caseRecord.update({
          where: { id: created.id },
          data: { status: "CLOSED" },
        });
        await appendCaseAudit(
          {
            caseId: created.id,
            ...buildStatusChangedAudit({
              from: "INVESTIGATING",
              to: "CLOSED",
                            // 故意使用非法外键触发失败（空 caseId 会被覆盖，改用重复 operationId 第二次）
              operationId: "dup-op-1", actor: manualActor("王研判")
}),
          },
          tx,
        );
        // 同事务再写相同 operationId → Unique 冲突，整事务回滚
        await appendAuditLog(
          {
            caseId: created.id,
            ...buildStatusChangedAudit({
              from: "INVESTIGATING",
              to: "CLOSED",
              operationId: "dup-op-1", actor: manualActor("王研判")
}),
          },
          tx,
        );
      }),
    ).rejects.toThrow();

    const after = await getCaseById(created.id);
    expect(after?.status).toBe(beforeStatus);

    const logs = await prisma.caseAuditLog.count({
      where: { caseId: created.id },
    });
    expect(logs).toBe(0);
  });

  it("普通 append 不修改 caseState", async () => {
    const created = await createDemoCase();
    const beforeState = JSON.stringify(created.caseState);

    await appendCaseAudit({
      caseId: created.id,
      ...buildCaseCreatedAudit({ caseNumber: created.caseNumber, actor: systemActor()
}),
    });

    const after = await getCaseById(created.id);
    expect(JSON.stringify(after!.caseState)).toBe(beforeState);
  });
});
