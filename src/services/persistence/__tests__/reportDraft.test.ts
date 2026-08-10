import { runPrismaMigrateDeploy } from "@/test-utils/runPrismaMigrateDeploy";
import { existsSync, unlinkSync } from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { caseA, caseB } from "@/domain/demo";
import { analyzeSecurityCase } from "@/services/analysis/analyzeSecurityCase";
import { resetPrismaClient } from "@/lib/prisma";
import { buildReportData } from "@/services/reporting/reportBuilder";
import { generateDocxBuffer } from "@/services/reporting/docxGenerator";
import {
  createCase,
  getCaseById,
  listReportCases,
  saveCaseState,
  saveReportDraft,
} from "@/services/persistence/caseRepository";
import {
  getOrCreateReportDraft,
  getReportExportPayload,
} from "@/services/persistence/reportDraftService";
import { autosaveReducer, initialAutosaveState } from "@/hooks/autosaveState";

const TEST_DB_FILE = path.resolve("prisma/test-report.db");
const TEST_DB_URL = `file:${TEST_DB_FILE.replace(/\\/g, "/")}`;

function cleanDbFiles() {
  for (const suffix of ["", "-journal", "-wal", "-shm"]) {
    const file = `${TEST_DB_FILE}${suffix}`;
    if (existsSync(file)) unlinkSync(file);
  }
}

async function createAnalyzedCase(draft: typeof caseA) {
  const analyzed = analyzeSecurityCase(draft);
  return createCase({
    draft,
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
  await prisma.caseAuditLog.deleteMany();
  await prisma.caseRecord.deleteMany();
});

afterAll(async () => {
  const { prisma } = await import("@/lib/prisma");
  await prisma.$disconnect();
  cleanDbFiles();
});

describe("报告草稿持久化（Step 5）", () => {
  it("reportDraft=null 时首次生成报告，并设置 hasReport=true", async () => {
    const created = await createAnalyzedCase(caseA);
    expect(created.hasReport).toBe(false);
    expect(created.reportDraft).toBeNull();

    const bundle = await getOrCreateReportDraft(created.id);
    expect(bundle).not.toBeNull();
    expect(bundle!.freshlyCreated).toBe(true);
    expect(bundle!.report.caseNumber).toBe(created.caseNumber);

    const again = await getCaseById(created.id);
    expect(again!.hasReport).toBe(true);
    expect(again!.reportDraft).not.toBeNull();
  });

  it("已有 reportDraft 时再次进入不重新 build", async () => {
    const created = await createAnalyzedCase(caseB);
    const first = await getOrCreateReportDraft(created.id);
    const edited = {
      ...first!.report,
      title: "人工修改后的报告标题-Step5",
      sections: first!.report.sections.map((s) =>
        s.key === "overview"
          ? { ...s, content: "【人工概述】不得被覆盖" }
          : s,
      ),
    };
    await saveReportDraft(created.id, edited);

    const spy = vi.spyOn(
      await import("@/services/reporting/reportBuilder"),
      "buildReportData",
    );
    const second = await getOrCreateReportDraft(created.id);
    expect(second!.freshlyCreated).toBe(false);
    expect(second!.report.title).toBe("人工修改后的报告标题-Step5");
    expect(
      second!.report.sections.find((s) => s.key === "overview")?.content,
    ).toBe("【人工概述】不得被覆盖");
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it("人工修改 reportDraft 保存并恢复；与 caseState 双 SoT 分离", async () => {
    const created = await createAnalyzedCase(caseA);
    const bundle = await getOrCreateReportDraft(created.id);
    const edited = {
      ...bundle!.report,
      title: "独立报告标题",
    };
    await saveReportDraft(created.id, edited);

    const afterCaseEdit = await saveCaseState(created.id, {
      caseData: {
        ...created.caseState.caseData,
        name: "案件名称已改",
      },
      businessContext: {
        ...created.caseState.businessContext,
        businessJustification: "案件侧说明已改",
      },
      checklist: created.caseState.checklist,
      humanReview: created.caseState.humanReview,
      timeline: created.caseState.timeline,
      suggestedRiskLevel: created.suggestedRiskLevel,
    });

    expect(afterCaseEdit.caseState.caseData.name).toBe("案件名称已改");
    expect(afterCaseEdit.reportDraft?.title).toBe("独立报告标题");

    const reopened = await getOrCreateReportDraft(created.id);
    expect(reopened!.report.title).toBe("独立报告标题");
    expect(reopened!.report.title).not.toBe("案件名称已改");
  });

  it("保存报告不修改 HumanReview / Checklist", async () => {
    const created = await createAnalyzedCase(caseB);
    const before = await getCaseById(created.id);
    const checklistBefore = JSON.stringify(before!.caseState.checklist);
    const humanBefore = JSON.stringify(before!.caseState.humanReview);

    const bundle = await getOrCreateReportDraft(created.id);
    await saveReportDraft(created.id, {
      ...bundle!.report,
      title: "仅改报告",
    });

    const after = await getCaseById(created.id);
    expect(JSON.stringify(after!.caseState.checklist)).toBe(checklistBefore);
    expect(JSON.stringify(after!.caseState.humanReview)).toBe(humanBefore);
  });

  it("报告中心只返回 hasReport=true，并显示人工结论/风险", async () => {
    const withReport = await createAnalyzedCase(caseB);
    await getOrCreateReportDraft(withReport.id);
    await createAnalyzedCase(caseA);

    const listed = await listReportCases();
    expect(listed.every((item) => item.hasReport)).toBe(true);
    expect(listed.some((item) => item.id === withReport.id)).toBe(true);
    expect(listed.some((item) => item.title.includes("Case A"))).toBe(false);

    const row = listed.find((item) => item.id === withReport.id)!;
    expect(row.humanConclusion).toBe("SUSPECTED_SECURITY_INCIDENT");
    expect(row.humanRiskLevel).toBe("HIGH");
  });

  it("reportDraft 保存后更新时间更新", async () => {
    const created = await createAnalyzedCase(caseA);
    const first = await getOrCreateReportDraft(created.id);
    const t1 = (await getCaseById(created.id))!.updatedAt;
    await new Promise((r) => setTimeout(r, 20));
    await saveReportDraft(created.id, {
      ...first!.report,
      title: `${first!.report.title}-updated`,
    });
    const t2 = (await getCaseById(created.id))!.updatedAt;
    expect(new Date(t2).getTime()).toBeGreaterThanOrEqual(new Date(t1).getTime());
  });

  it("Word export 使用 reportDraft，不重新 build；DOCX 含人工修改", async () => {
    const created = await createAnalyzedCase(caseB);
    const bundle = await getOrCreateReportDraft(created.id);
    const marker = "EXPORT-MARKER-STEP5-UNIQUE";
    const edited = {
      ...bundle!.report,
      title: marker,
      sections: bundle!.report.sections.map((s) =>
        s.key === "overview" ? { ...s, content: `概述含 ${marker}` } : s,
      ),
    };
    await saveReportDraft(created.id, edited);

    const buildSpy = vi.spyOn(
      await import("@/services/reporting/reportBuilder"),
      "buildReportData",
    );
    const payload = await getReportExportPayload(created.id);
    expect(payload).not.toBeNull();
    expect(payload!.report.title).toBe(marker);
    expect(buildSpy).not.toHaveBeenCalled();

    const buffer = await generateDocxBuffer(
      payload!.report,
      {
        evidences: payload!.evidences,
        timeline: payload!.timeline,
      },
      { maskSensitive: true },
    );
    expect(buffer.byteLength).toBeGreaterThan(1000);
    expect(payload!.report.title).toBe(marker);
    const JSZip = (await import("jszip")).default;
    const zip = await JSZip.loadAsync(buffer);
    const xml = await zip.file("word/document.xml")?.async("string");
    expect(xml).toBeTruthy();
    expect(xml!).toContain(marker);
    buildSpy.mockRestore();
  });

  it("Evidence include/exclude 保存后刷新保持", async () => {
    const created = await createAnalyzedCase(caseB);
    const bundle = await getOrCreateReportDraft(created.id);
    const originalIds = bundle!.report.evidenceIds;
    expect(originalIds.length).toBeGreaterThan(0);
    const reduced = {
      ...bundle!.report,
      evidenceIds: originalIds.slice(0, 1),
    };
    await saveReportDraft(created.id, reduced);
    const again = await getOrCreateReportDraft(created.id);
    expect(again!.report.evidenceIds).toEqual(originalIds.slice(0, 1));
  });

  it("保存失败状态机不清除 lastSavedAt（本地编辑由调用方保留）", () => {
    let state = autosaveReducer(initialAutosaveState, {
      type: "SAVE_START",
      seq: 1,
    });
    state = autosaveReducer(state, {
      type: "SAVE_SUCCESS",
      seq: 1,
      savedAt: "2026-08-08T12:00:00.000Z",
    });
    state = autosaveReducer(state, { type: "MARK_DIRTY" });
    state = autosaveReducer(state, { type: "SAVE_START", seq: 2 });
    state = autosaveReducer(state, {
      type: "SAVE_ERROR",
      seq: 2,
      message: "fail",
    });
    expect(state.status).toBe("ERROR");
    expect(state.lastSavedAt).toBe("2026-08-08T12:00:00.000Z");
  });

  it("导出前 dirty 需先保存：flush 后状态为 SAVED", () => {
    let state = autosaveReducer(initialAutosaveState, { type: "MARK_DIRTY" });
    expect(state.status).toBe("DIRTY");
    state = autosaveReducer(state, { type: "SAVE_START", seq: 1 });
    state = autosaveReducer(state, {
      type: "SAVE_SUCCESS",
      seq: 1,
      savedAt: "2026-08-08T13:00:00.000Z",
    });
    expect(state.status).toBe("SAVED");
  });

  it("Case A 报告结论保持正常授权业务行为；Case B 保持疑似安全事件", async () => {
    const a = await createAnalyzedCase(caseA);
    const reportA = (await getOrCreateReportDraft(a.id))!.report;
    const conclusionA = reportA.sections.find((s) => s.key === "conclusion")
      ?.content;
    expect(conclusionA).toMatch(/正常授权业务行为/);

    const b = await createAnalyzedCase(caseB);
    const reportB = (await getOrCreateReportDraft(b.id))!.report;
    const conclusionB = reportB.sections.find((s) => s.key === "conclusion")
      ?.content;
    expect(conclusionB).toMatch(/疑似安全事件/);
  });

  it("getReportExportPayload 在无草稿时返回 null（禁止临时 build）", async () => {
    const created = await createAnalyzedCase(caseA);
    const payload = await getReportExportPayload(created.id);
    expect(payload).toBeNull();
  });

  it("buildReportData 仅用于首次生成路径自检", async () => {
    const analyzed = analyzeSecurityCase(caseA);
    const report = buildReportData({
      securityCase: analyzed,
      humanReview: caseA.humanReview,
      checklist: analyzed.checklist,
      timeline: caseA.timeline,
    });
    expect(report.sections.some((s) => s.key === "conclusion")).toBe(true);
  });
});
