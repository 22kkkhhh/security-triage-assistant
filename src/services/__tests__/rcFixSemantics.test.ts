/**
 * v1.2 RC Fix：Timeline/Audit 分离、SYSTEM Checklist 删除限制、用户可见时间格式。
 */
import { execSync } from "node:child_process";
import { systemActor } from "@/services/audit/auditEventBuilder";
import { existsSync, unlinkSync } from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { caseA, caseB } from "@/domain/demo";
import { analyzeSecurityCase } from "@/services/analysis/analyzeSecurityCase";
import {
  applyChecklistCommand,
  createCaseWithAudit,
  addTimelineEventCommand,
} from "@/services/caseCommands";
import { createManualChecklistItem } from "@/services/checklist/generateChecklist";
import { formatDateTimesInDisplayText } from "@/lib/formatDateTimeForDisplay";
import { resetPrismaClient } from "@/lib/prisma";
import { listCaseAuditLogs } from "@/services/persistence/auditRepository";
import { getCaseById } from "@/services/persistence/caseRepository";
import type { SaveCaseStateInput } from "@/services/persistence/types";

const TEST_DB_FILE = path.resolve("prisma/test-rc-fix.db");
const TEST_DB_URL = `file:${TEST_DB_FILE.replace(/\\/g, "/")}`;

function cleanDbFiles() {
  for (const suffix of ["", "-journal", "-wal", "-shm"]) {
    const file = `${TEST_DB_FILE}${suffix}`;
    if (existsSync(file)) unlinkSync(file);
  }
}

function toNextState(
  record: NonNullable<Awaited<ReturnType<typeof getCaseById>>>,
  patch: Partial<SaveCaseStateInput> = {},
): SaveCaseStateInput {
  return {
    caseData: record.caseState.caseData,
    businessContext: record.caseState.businessContext,
    checklist: record.caseState.checklist,
    humanReview: record.caseState.humanReview,
    timeline: record.caseState.timeline,
    suggestedRiskLevel: record.suggestedRiskLevel,
    status: record.status,
    ...patch,
  };
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

describe("RC Fix · Timeline / Audit", () => {
  it("Case A Timeline 不含「开始人工核查」；仍有事件事实", () => {
    const titles = caseA.timeline.map((e) => e.title);
    const types = caseA.timeline.map((e) => e.eventType);
    expect(titles.join("|")).not.toContain("开始人工核查");
    expect(types).not.toContain("人工处置");
    expect(caseA.timeline.length).toBeGreaterThanOrEqual(1);
    expect(caseA.timeline.some((e) => e.eventType === "告警")).toBe(true);
    expect(caseA.humanReview?.finalConclusion).toBe("NORMAL_BUSINESS");
  });

  it("Case B 标准安全事件 Timeline 保持", () => {
    const types = caseB.timeline.map((e) => e.eventType);
    expect(types).toEqual(
      expect.arrayContaining([
        "认证",
        "系统访问",
        "数据访问",
        "网络通信",
      ]),
    );
    expect(caseB.humanReview?.finalConclusion).toBe(
      "SUSPECTED_SECURITY_INCIDENT",
    );
  });

  it("人工补充 Timeline 仍产生 TIMELINE_EVENT_ADDED；Audit 不进入 Timeline", async () => {
    const analyzed = analyzeSecurityCase(caseA);
    const created = await createCaseWithAudit(
      {
        draft: caseA,
        checklist: analyzed.checklist,
        suggestedRiskLevel:
          analyzed.suggestedAssessment?.suggestedRiskLevel ?? null,
      },
      { operationId: "rc-tl-create", actor: systemActor()
},
    );
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const event = {
      id: "rc-human-tl-1",
      occurredAt: "2026-08-08T12:00:00+08:00",
      eventType: "系统访问",
      title: "补充访问 ERP",
      description: "02:15 账号访问 ERP 系统",
      operator: "王研判",
      source: "HUMAN" as const,
    };
    const nextTimeline = [...created.case.caseState.timeline, event];
    const result = await addTimelineEventCommand({
      caseId: created.case.id,
      eventId: event.id,
      operationId: "rc-tl-add",
      baseUpdatedAt: created.case.updatedAt,
      nextCaseState: toNextState(created.case, { timeline: nextTimeline }), actor: systemActor()
});
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.audit?.actionType).toBe("TIMELINE_EVENT_ADDED");

    const after = await getCaseById(created.case.id);
    expect(after!.caseState.timeline.some((e) => e.id === event.id)).toBe(true);
    // Audit 条目不得混入 Timeline
    expect(
      after!.caseState.timeline.some(
        (e) =>
          e.title.includes("TIMELINE_EVENT") ||
          e.description.includes("operationId"),
      ),
    ).toBe(false);

    const logs = await listCaseAuditLogs({ caseId: created.case.id });
    expect(
      logs.items.some((x) => x.actionType === "TIMELINE_EVENT_ADDED"),
    ).toBe(true);
  });
});

describe("RC Fix · SYSTEM Checklist 删除", () => {
  it("Server 拒绝删除 SYSTEM；不改 state / 无 Audit / lastActivityAt 不变", async () => {
    const analyzed = analyzeSecurityCase(caseA);
    const created = await createCaseWithAudit(
      {
        draft: caseA,
        checklist: analyzed.checklist,
        suggestedRiskLevel:
          analyzed.suggestedAssessment?.suggestedRiskLevel ?? null,
      },
      { operationId: "rc-cl-create", actor: systemActor()
},
    );
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const systemItem = created.case.caseState.checklist.find(
      (x) => x.origin === "SYSTEM",
    );
    expect(systemItem).toBeTruthy();
    if (!systemItem) return;

    const before = await getCaseById(created.case.id);
    const deleted = before!.caseState.checklist.filter(
      (x) => x.id !== systemItem.id,
    );
    const result = await applyChecklistCommand({
      caseId: created.case.id,
      action: "delete",
      itemId: systemItem.id,
      operationId: "rc-cl-del-system",
      baseUpdatedAt: before!.updatedAt,
      nextCaseState: toNextState(before!, { checklist: deleted }), actor: systemActor()
});
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain("系统生成的核查事项不能删除");

    const after = await getCaseById(created.case.id);
    expect(after!.caseState.checklist.map((x) => x.id).sort()).toEqual(
      before!.caseState.checklist.map((x) => x.id).sort(),
    );
    expect(after!.lastActivityAt).toBe(before!.lastActivityAt);
    const logs = await listCaseAuditLogs({ caseId: created.case.id });
    expect(
      logs.items.filter((x) => x.actionType === "CHECKLIST_DELETED"),
    ).toHaveLength(0);
  });

  it("MANUAL 删除成功并产生 CHECKLIST_DELETED", async () => {
    const analyzed = analyzeSecurityCase(caseA);
    const created = await createCaseWithAudit(
      {
        draft: caseA,
        checklist: analyzed.checklist,
        suggestedRiskLevel:
          analyzed.suggestedAssessment?.suggestedRiskLevel ?? null,
      },
      { operationId: "rc-cl-create-2", actor: systemActor()
},
    );
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const manual = createManualChecklistItem({
      category: "BUSINESS",
      label: "RC Fix 人工核查项",
    });
    const withManual = [...created.case.caseState.checklist, manual];
    const added = await applyChecklistCommand({
      caseId: created.case.id,
      action: "add",
      itemId: manual.id,
      operationId: "rc-cl-add-manual",
      baseUpdatedAt: created.case.updatedAt,
      nextCaseState: toNextState(created.case, { checklist: withManual }), actor: systemActor()
});
    expect(added.ok).toBe(true);
    if (!added.ok) return;

    const mid = await getCaseById(created.case.id);
    const without = mid!.caseState.checklist.filter((x) => x.id !== manual.id);
    const deleted = await applyChecklistCommand({
      caseId: created.case.id,
      action: "delete",
      itemId: manual.id,
      operationId: "rc-cl-del-manual",
      baseUpdatedAt: mid!.updatedAt,
      nextCaseState: toNextState(mid!, { checklist: without }), actor: systemActor()
});
    expect(deleted.ok).toBe(true);
    if (!deleted.ok) return;
    expect(deleted.audit?.actionType).toBe("CHECKLIST_DELETED");
    expect(
      (await getCaseById(created.case.id))!.caseState.checklist.some(
        (x) => x.id === manual.id,
      ),
    ).toBe(false);
  });
});

describe("RC Fix · 用户可见时间", () => {
  it("DATA-003 Evidence summary 可读时间，无 ISO offset", () => {
    const analyzed = analyzeSecurityCase(caseA);
    const data003 = analyzed.evidences.find((e) =>
      e.evidenceId.includes("DATA-003"),
    );
    expect(data003).toBeTruthy();
    const summary = data003!.summary;
    expect(summary).toContain("2026-08-08 01:30:00");
    expect(summary).not.toContain("2026-08-08T01:30:00+08:00");
    expect(summary).not.toMatch(/T\d{2}:\d{2}/);
    expect(summary).not.toContain("+08:00");
    // timestamp 字段仍可为 ISO
    expect(data003!.timestamp).toContain("T");

    const displayed = formatDateTimesInDisplayText(summary);
    expect(displayed).toContain("2026-08-08 01:30:00");
    expect(displayed).not.toMatch(/\+08:00|T01:/);
  });

  it("用户可见 Evidence 文案扫描：无 ISO offset", () => {
    const analyzed = analyzeSecurityCase(caseA);
    const analyzedB = analyzeSecurityCase(caseB);
    for (const evidence of [...analyzed.evidences, ...analyzedB.evidences]) {
      const visible = formatDateTimesInDisplayText(evidence.summary);
      expect(visible).not.toMatch(/\d{4}-\d{2}-\d{2}T/);
      expect(visible).not.toMatch(/\+08:00/);
      expect(visible).not.toMatch(/Z\b/);
    }
  });
});
