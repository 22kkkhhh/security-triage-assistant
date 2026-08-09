import { execSync } from "node:child_process";
import { systemActor } from "@/services/audit/auditEventBuilder";
import { existsSync, unlinkSync } from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { caseA } from "@/domain/demo";
import { HANDOFF_NOTE_MAX_LENGTH } from "@/domain/audit";
import { analyzeSecurityCase } from "@/services/analysis/analyzeSecurityCase";
import { addHandoffNoteCommand } from "@/services/caseCommands/handoffCommands";
import { resetPrismaClient } from "@/lib/prisma";
import {
  getLatestHandoffNote,
  listCaseAuditLogs,
} from "@/services/persistence/auditRepository";
import {
  createCase,
  getCaseById,
  saveCaseState,
} from "@/services/persistence/caseRepository";

const TEST_DB_FILE = path.resolve("prisma/test-handoff.db");
const TEST_DB_URL = `file:${TEST_DB_FILE.replace(/\\/g, "/")}`;

function cleanDbFiles() {
  for (const suffix of ["", "-journal", "-wal", "-shm"]) {
    const file = `${TEST_DB_FILE}${suffix}`;
    if (existsSync(file)) unlinkSync(file);
  }
}

async function seed() {
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
  execSync("npx prisma migrate deploy", {
    env: { ...process.env, DATABASE_URL: TEST_DB_URL },
    stdio: "pipe",
  });
  await resetPrismaClient(TEST_DB_URL);
});

beforeEach(async () => {
  const { prisma } = await import("@/lib/prisma");
  await prisma.caseAuditLog.deleteMany();
  await prisma.caseRecord.deleteMany();
});

afterAll(async () => {
  const { prisma } = await import("@/lib/prisma");
  await prisma.$disconnect();
  cleanDbFiles();
});

describe("handoffCommands（v1.2 Step 4）", () => {
  it("添加 Handoff 成功；更新 lastActivityAt；不改 caseState/Timeline", async () => {
    const created = await seed();
    const beforeState = JSON.stringify(created.caseState);
    const beforeTimeline = JSON.stringify(created.caseState.timeline);
    const beforeActivity = created.lastActivityAt;

    await new Promise((r) => setTimeout(r, 15));
    const result = await addHandoffNoteCommand({
      caseId: created.id,
      note: "已完成账号核实。\n下一班重点核查出口网络日志。",
      operationId: "op-handoff-1", actor: systemActor()
});
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.audit?.actionType).toBe("HANDOFF_NOTE_ADDED");
    expect(result.audit?.metadata?.note).toContain("下一班重点核查");
    expect(new Date(result.case.lastActivityAt).getTime()).toBeGreaterThan(
      new Date(beforeActivity).getTime(),
    );

    const after = await getCaseById(created.id);
    expect(JSON.stringify(after!.caseState)).toBe(beforeState);
    expect(JSON.stringify(after!.caseState.timeline)).toBe(beforeTimeline);

    const latest = await getLatestHandoffNote(created.id);
    expect(latest?.id).toBe(result.audit?.id);
  });

  it("空 note / 超长拒绝；latest 无数据为 null", async () => {
    const created = await seed();
    expect(await getLatestHandoffNote(created.id)).toBeNull();

    const empty = await addHandoffNoteCommand({
      caseId: created.id,
      note: "   ",
      operationId: "op-empty", actor: systemActor()
});
    expect(empty.ok).toBe(false);

    const tooLong = await addHandoffNoteCommand({
      caseId: created.id,
      note: "甲".repeat(HANDOFF_NOTE_MAX_LENGTH + 1),
      operationId: "op-long", actor: systemActor()
});
    expect(tooLong.ok).toBe(false);
    expect(await getLatestHandoffNote(created.id)).toBeNull();
  });

  it("operationId retry 不重复；actor 从 server caseState 读取", async () => {
    const created = await seed();
    await saveCaseState(created.id, {
      caseData: created.caseState.caseData,
      businessContext: created.caseState.businessContext,
      checklist: created.caseState.checklist,
      humanReview: {
        reviewer: "王研判",
        finalConclusion: created.caseState.humanReview?.finalConclusion ?? null,
        humanRiskLevel: created.caseState.humanReview?.humanRiskLevel ?? null,
        conclusionNote: created.caseState.humanReview?.conclusionNote ?? null,
        adjustments: created.caseState.humanReview?.adjustments ?? [],
        confirmedAt: created.caseState.humanReview?.confirmedAt ?? null,
      },
      timeline: created.caseState.timeline,
      suggestedRiskLevel: created.suggestedRiskLevel,
      status: created.status,
    });

    const first = await addHandoffNoteCommand({
      caseId: created.id,
      note: "交接说明 A",
      operationId: "op-handoff-retry", actor: systemActor()
});
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    expect(first.audit?.actorName).toBe("系统");
    expect(first.audit?.actorType).toBe("SYSTEM");

    const retry = await addHandoffNoteCommand({
      caseId: created.id,
      note: "交接说明 A（重复）",
      operationId: "op-handoff-retry", actor: systemActor()
});
    expect(retry.ok && retry.alreadyApplied).toBe(true);
    const logs = await listCaseAuditLogs({ caseId: created.id });
    expect(
      logs.items.filter((x) => x.actionType === "HANDOFF_NOTE_ADDED"),
    ).toHaveLength(1);
  });

  it("list DESC / limit / cursor / 隔离；LoadMore 不改 lastActivityAt", async () => {
    const a = await seed();
    const b = await seed();
    for (let i = 0; i < 5; i++) {
      await addHandoffNoteCommand({
        caseId: a.id,
        note: `交接 ${i}`,
        operationId: `op-page-a-${i}`, actor: systemActor()
});
    }
    await addHandoffNoteCommand({
      caseId: b.id,
      note: "案件 B 交接",
      operationId: "op-page-b", actor: systemActor()
});

    const page1 = await listCaseAuditLogs({ caseId: a.id, limit: 2 });
    expect(page1.items).toHaveLength(2);
    expect(page1.hasMore).toBe(true);
    expect(page1.items[0]!.createdAt >= page1.items[1]!.createdAt).toBe(true);
    expect(page1.items.every((x) => x.caseId === a.id)).toBe(true);

    const beforeActivity = (await getCaseById(a.id))!.lastActivityAt;
    const page2 = await listCaseAuditLogs({
      caseId: a.id,
      limit: 2,
      cursor: page1.nextCursor,
    });
    expect(page2.items).toHaveLength(2);
    expect(page2.items[0]!.id).not.toBe(page1.items[0]!.id);
    const afterActivity = (await getCaseById(a.id))!.lastActivityAt;
    expect(afterActivity).toBe(beforeActivity);
  });
});
