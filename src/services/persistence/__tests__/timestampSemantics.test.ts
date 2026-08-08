/**
 * 时间戳语义矩阵：updatedAt / reportUpdatedAt / lastActivityAt / Audit.createdAt
 */
import { execSync } from "node:child_process";
import { existsSync, unlinkSync } from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { caseA } from "@/domain/demo";
import { analyzeSecurityCase } from "@/services/analysis/analyzeSecurityCase";
import {
  changeCaseStatusCommand,
  createCaseWithAudit,
} from "@/services/caseCommands";
import {
  createReportDraftCommand,
  exportReportCommand,
  saveReportDraftCommand,
} from "@/services/caseCommands/reportCommands";
import { resetPrismaClient } from "@/lib/prisma";
import { listCaseAuditLogs } from "@/services/persistence/auditRepository";
import {
  getCaseById,
  saveCaseState,
  StaleCaseStateError,
} from "@/services/persistence/caseRepository";
import type { SaveCaseStateInput } from "@/services/persistence/types";

const TEST_DB_FILE = path.resolve("prisma/test-timestamp-semantics.db");
const TEST_DB_URL = `file:${TEST_DB_FILE.replace(/\\/g, "/")}`;

function cleanDbFiles() {
  for (const suffix of ["", "-journal", "-wal", "-shm"]) {
    const file = `${TEST_DB_FILE}${suffix}`;
    if (existsSync(file)) unlinkSync(file);
  }
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
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

describe("时间戳语义矩阵（v1.2 RC）", () => {
  it("case note autosave：updatedAt 变，lastActivityAt 不变", async () => {
    const analyzed = analyzeSecurityCase(caseA);
    const created = await createCaseWithAudit(
      {
        draft: caseA,
        checklist: analyzed.checklist,
        suggestedRiskLevel:
          analyzed.suggestedAssessment?.suggestedRiskLevel ?? null,
      },
      { operationId: "ts-create-1" },
    );
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const before = await getCaseById(created.case.id);
    expect(before).not.toBeNull();
    await sleep(15);
    const saved = await saveCaseState(
      before!.id,
      toNextState(before!, {
        businessContext: {
          ...before!.caseState.businessContext,
          businessJustification: "普通备注 autosave（Mock）",
        },
        baseUpdatedAt: before!.updatedAt,
      }),
    );
    expect(new Date(saved.updatedAt).getTime()).toBeGreaterThan(
      new Date(before!.updatedAt).getTime(),
    );
    expect(saved.lastActivityAt).toBe(before!.lastActivityAt);
  });

  it("report autosave：会话首次 audited；后续只动 reportUpdatedAt", async () => {
    const analyzed = analyzeSecurityCase(caseA);
    const created = await createCaseWithAudit(
      {
        draft: caseA,
        checklist: analyzed.checklist,
        suggestedRiskLevel:
          analyzed.suggestedAssessment?.suggestedRiskLevel ?? null,
      },
      { operationId: "ts-create-2" },
    );
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const report = await createReportDraftCommand({
      caseId: created.case.id,
      operationId: "ts-report-create",
    });
    expect(report.ok).toBe(true);
    if (!report.ok) return;

    const draft = report.case.reportDraft!;
    const first = await saveReportDraftCommand({
      caseId: created.case.id,
      reportDraft: { ...draft, title: `${draft.title}（修订1）` },
      baseReportUpdatedAt: report.case.reportUpdatedAt,
      auditOperationId: "ts-report-update-session",
    });
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    expect(first.audit?.actionType).toBe("REPORT_UPDATED");
    const activityAfterFirst = first.case.lastActivityAt;

    await sleep(15);
    const second = await saveReportDraftCommand({
      caseId: created.case.id,
      reportDraft: { ...draft, title: `${draft.title}（修订2）` },
      baseReportUpdatedAt: first.case.reportUpdatedAt,
      auditOperationId: null,
    });
    expect(second.ok).toBe(true);
    if (!second.ok) return;
    expect(second.audit).toBeNull();
    expect(second.case.lastActivityAt).toBe(activityAfterFirst);
    expect(second.case.reportUpdatedAt).not.toBe(first.case.reportUpdatedAt);
  });

  it("export：lastActivityAt 变，reportUpdatedAt 不变；Load More 全不变", async () => {
    const analyzed = analyzeSecurityCase(caseA);
    const created = await createCaseWithAudit(
      {
        draft: caseA,
        checklist: analyzed.checklist,
        suggestedRiskLevel:
          analyzed.suggestedAssessment?.suggestedRiskLevel ?? null,
      },
      { operationId: "ts-create-3" },
    );
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    await createReportDraftCommand({
      caseId: created.case.id,
      operationId: "ts-report-create-3",
    });
    const before = await getCaseById(created.case.id);
    expect(before?.reportUpdatedAt).not.toBeNull();

    await sleep(15);
    const exported = await exportReportCommand({
      caseId: created.case.id,
      operationId: "ts-export-1",
    });
    expect(exported.ok).toBe(true);
    if (!exported.ok) return;
    expect(exported.reportUpdatedAt).toBe(before!.reportUpdatedAt);
    expect(new Date(exported.lastActivityAt).getTime()).toBeGreaterThan(
      new Date(before!.lastActivityAt).getTime(),
    );

    const snap = await getCaseById(created.case.id);
    await listCaseAuditLogs({ caseId: created.case.id, limit: 10 });
    const afterList = await getCaseById(created.case.id);
    expect(afterList!.updatedAt).toBe(snap!.updatedAt);
    expect(afterList!.reportUpdatedAt).toBe(snap!.reportUpdatedAt);
    expect(afterList!.lastActivityAt).toBe(snap!.lastActivityAt);
  });

  it("双标签：旧 baseUpdatedAt / baseReportUpdatedAt 拒绝覆盖", async () => {
    const analyzed = analyzeSecurityCase(caseA);
    const created = await createCaseWithAudit(
      {
        draft: caseA,
        checklist: analyzed.checklist,
        suggestedRiskLevel:
          analyzed.suggestedAssessment?.suggestedRiskLevel ?? null,
      },
      { operationId: "ts-create-4" },
    );
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const v0 = await getCaseById(created.case.id);
    await changeCaseStatusCommand({
      caseId: created.case.id,
      nextStatus: "PENDING_VERIFICATION",
      operationId: "ts-status-a",
      nextCaseState: toNextState(v0!, { status: "PENDING_VERIFICATION" }),
    });
    const v1 = await getCaseById(created.case.id);
    await expect(
      saveCaseState(
        created.case.id,
        toNextState(v0!, {
          status: "RESPONDING",
          baseUpdatedAt: v0!.updatedAt,
        }),
      ),
    ).rejects.toBeInstanceOf(StaleCaseStateError);
    expect((await getCaseById(created.case.id))!.status).toBe(v1!.status);

    const report = await createReportDraftCommand({
      caseId: created.case.id,
      operationId: "ts-report-create-4",
    });
    expect(report.ok).toBe(true);
    if (!report.ok) return;
    const base0 = report.case.reportUpdatedAt;
    const draft = report.case.reportDraft!;
    const tabA = await saveReportDraftCommand({
      caseId: created.case.id,
      reportDraft: { ...draft, title: "Tab A 已保存" },
      baseReportUpdatedAt: base0,
      auditOperationId: "ts-ru-a",
    });
    expect(tabA.ok).toBe(true);
    if (!tabA.ok) return;
    const tabB = await saveReportDraftCommand({
      caseId: created.case.id,
      reportDraft: { ...draft, title: "Tab B 旧版" },
      baseReportUpdatedAt: base0,
      auditOperationId: "ts-ru-b",
    });
    expect(tabB.ok).toBe(false);
    const latest = await getCaseById(created.case.id);
    expect(latest!.reportDraft?.title).toBe("Tab A 已保存");
  });

  it("空库创建案件自动产生 CASE_CREATED（不依赖 Seed）", async () => {
    const { prisma } = await import("@/lib/prisma");
    expect(await prisma.caseAuditLog.count()).toBe(0);
    const analyzed = analyzeSecurityCase(caseA);
    const created = await createCaseWithAudit(
      {
        draft: caseA,
        checklist: analyzed.checklist,
        suggestedRiskLevel:
          analyzed.suggestedAssessment?.suggestedRiskLevel ?? null,
      },
      { operationId: "ts-clean-create", sourceType: "MANUAL" },
    );
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    expect(created.audit?.actionType).toBe("CASE_CREATED");
    const logs = await listCaseAuditLogs({ caseId: created.case.id });
    expect(logs.items).toHaveLength(1);
    expect(logs.items[0]!.actionType).toBe("CASE_CREATED");
  });
});
