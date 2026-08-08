import { execSync } from "node:child_process";
import { existsSync, unlinkSync } from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { caseA } from "@/domain/demo";
import { analyzeSecurityCase } from "@/services/analysis/analyzeSecurityCase";
import { resetPrismaClient } from "@/lib/prisma";
import {
  createCase,
  getCaseById,
  listReportCases,
  saveCaseState,
  saveReportDraft,
} from "@/services/persistence/caseRepository";
import { getOrCreateReportDraft } from "@/services/persistence/reportDraftService";

const TEST_DB_FILE = path.resolve("prisma/test-report-updated.db");
const TEST_DB_URL = `file:${TEST_DB_FILE.replace(/\\/g, "/")}`;

function cleanDbFiles() {
  for (const suffix of ["", "-journal", "-wal", "-shm"]) {
    const file = `${TEST_DB_FILE}${suffix}`;
    if (existsSync(file)) unlinkSync(file);
  }
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
  await prisma.caseRecord.deleteMany();
});

afterAll(async () => {
  const { prisma } = await import("@/lib/prisma");
  await prisma.$disconnect();
  cleanDbFiles();
});

describe("reportUpdatedAt 语义", () => {
  it("生成报告后 reportUpdatedAt 非空；编辑报告后更新", async () => {
    const analyzed = analyzeSecurityCase(caseA);
    const created = await createCase({
      draft: caseA,
      checklist: analyzed.checklist,
      suggestedRiskLevel: analyzed.suggestedAssessment?.suggestedRiskLevel ?? null,
    });
    expect(created.reportUpdatedAt).toBeNull();

    const bundle = await getOrCreateReportDraft(created.id);
    const afterCreate = await getCaseById(created.id);
    expect(afterCreate!.reportUpdatedAt).not.toBeNull();
    const t1 = afterCreate!.reportUpdatedAt!;

    await new Promise((r) => setTimeout(r, 30));
    await saveReportDraft(created.id, {
      ...bundle!.report,
      title: `${bundle!.report.title}-edit`,
    });
    const t2 = (await getCaseById(created.id))!.reportUpdatedAt!;
    expect(new Date(t2).getTime()).toBeGreaterThanOrEqual(new Date(t1).getTime());
  });

  it("修改 Checklist / CaseStatus 不改变 reportUpdatedAt", async () => {
    const analyzed = analyzeSecurityCase(caseA);
    const created = await createCase({
      draft: caseA,
      checklist: analyzed.checklist,
      suggestedRiskLevel: analyzed.suggestedAssessment?.suggestedRiskLevel ?? null,
    });
    await getOrCreateReportDraft(created.id);
    const reportTime = (await getCaseById(created.id))!.reportUpdatedAt;

    await saveCaseState(created.id, {
      caseData: created.caseState.caseData,
      businessContext: created.caseState.businessContext,
      checklist: created.caseState.checklist.map((item) => ({
        ...item,
        completed: true,
      })),
      humanReview: created.caseState.humanReview,
      timeline: created.caseState.timeline,
      suggestedRiskLevel: created.suggestedRiskLevel,
      status: "RESPONDING",
    });

    const after = await getCaseById(created.id);
    expect(after!.status).toBe("RESPONDING");
    expect(after!.pendingChecklistCount).toBe(0);
    expect(after!.reportUpdatedAt).toBe(reportTime);
  });

  it("/reports 列表使用 reportUpdatedAt", async () => {
    const analyzed = analyzeSecurityCase(caseA);
    const created = await createCase({
      draft: caseA,
      checklist: analyzed.checklist,
      suggestedRiskLevel: analyzed.suggestedAssessment?.suggestedRiskLevel ?? null,
    });
    await getOrCreateReportDraft(created.id);
    const listed = await listReportCases();
    const row = listed.find((item) => item.id === created.id);
    expect(row?.reportUpdatedAt).not.toBeNull();
    expect(row?.reportUpdatedAt).toBe(
      (await getCaseById(created.id))!.reportUpdatedAt,
    );
  });
});
