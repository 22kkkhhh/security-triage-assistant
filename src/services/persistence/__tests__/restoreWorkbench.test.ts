import { runPrismaMigrateDeploy } from "@/test-utils/runPrismaMigrateDeploy";
import { existsSync, unlinkSync } from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { caseA, caseB } from "@/domain/demo";
import { displayCaseListRisk } from "@/components/cases/caseDisplay";
import { analyzeSecurityCase } from "@/services/analysis/analyzeSecurityCase";
import { createManualChecklistItem } from "@/services/checklist/generateChecklist";
import { resetPrismaClient } from "@/lib/prisma";
import {
  createCase,
  getCaseById,
  listCases,
  saveCaseState,
} from "@/services/persistence/caseRepository";
import {
  mergeTimelineOnRestore,
  restoreWorkbenchFromPersisted,
} from "@/services/persistence/restoreWorkbench";

const TEST_DB_FILE = path.resolve("prisma/test-restore.db");
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

describe("Workbench 恢复与持久化（Step 3）", () => {
  it("PersistedCaseState 可完整恢复为 Workbench 初始数据", async () => {
    const analyzed = analyzeSecurityCase(caseA);
    const created = await createCase({
      draft: caseA,
      checklist: analyzed.checklist,
      suggestedRiskLevel: analyzed.suggestedAssessment?.suggestedRiskLevel ?? null,
    });
    const restored = await getCaseById(created.id);
    const view = restoreWorkbenchFromPersisted(restored!);
    expect(view.caseId).toBe(created.id);
    expect(view.caseNumber).toBe(created.caseNumber);
    expect(view.draft.businessContext.changeTicketId).toBe("CHG-20260808-003");
    expect(view.draft.humanReview?.finalConclusion).toBe(
      caseA.humanReview?.finalConclusion,
    );
    expect(view.initialChecklist.length).toBeGreaterThan(0);
    expect(view.draft.timeline.length).toBe(caseA.timeline.length);
  });

  it("BusinessContext 保存并恢复", async () => {
    const analyzed = analyzeSecurityCase(caseB);
    const created = await createCase({
      draft: caseB,
      checklist: analyzed.checklist,
      suggestedRiskLevel: analyzed.suggestedAssessment?.suggestedRiskLevel ?? null,
    });
    await saveCaseState(created.id, {
      caseData: created.caseState.caseData,
      businessContext: {
        ...created.caseState.businessContext,
        changeTicketStatus: "CONFIRMED",
        changeTicketId: "CHG-TEST-001",
        businessOwner: "赵演示",
        ownerVerification: "CONFIRMED",
        businessLegitimacy: "AUTHORIZED",
        businessJustification: "已确认授权测试说明",
      },
      checklist: created.caseState.checklist,
      humanReview: created.caseState.humanReview,
      timeline: created.caseState.timeline,
      suggestedRiskLevel: created.suggestedRiskLevel,
    });
    const view = restoreWorkbenchFromPersisted((await getCaseById(created.id))!);
    expect(view.draft.businessContext.changeTicketId).toBe("CHG-TEST-001");
    expect(view.draft.businessContext.businessLegitimacy).toBe("AUTHORIZED");
  });

  it("Checklist completed / note / MANUAL 保存并恢复，且重跑分析不覆盖", async () => {
    const analyzed = analyzeSecurityCase(caseA);
    const manual = createManualChecklistItem({
      category: "BUSINESS",
      label: "人工补充核查项",
    });
    const checklist = [
      ...analyzed.checklist.map((item, index) =>
        index === 0
          ? { ...item, completed: true, note: "已电话核实" }
          : item,
      ),
      manual,
    ];
    const created = await createCase({
      draft: caseA,
      checklist,
      suggestedRiskLevel: analyzed.suggestedAssessment?.suggestedRiskLevel ?? null,
    });

    const view = restoreWorkbenchFromPersisted((await getCaseById(created.id))!);
    const firstId = checklist[0].id;
    expect(view.initialChecklist.find((i) => i.id === firstId)?.completed).toBe(
      true,
    );
    expect(view.initialChecklist.find((i) => i.id === firstId)?.note).toBe(
      "已电话核实",
    );
    expect(
      view.initialChecklist.some(
        (i) => i.origin === "MANUAL" && i.label === "人工补充核查项",
      ),
    ).toBe(true);

    // 再次分析后合并仍保留
    const reanalyzed = analyzeSecurityCase(view.draft);
    const { mergeChecklistOnRestore } = await import(
      "@/services/persistence/caseMapper"
    );
    const merged = mergeChecklistOnRestore(
      view.initialChecklist,
      reanalyzed.checklist,
    );
    expect(merged.find((i) => i.id === firstId)?.completed).toBe(true);
    expect(merged.some((i) => i.label === "人工补充核查项")).toBe(true);
  });

  it("HumanReview 保存并恢复，且 SuggestedAssessment 不覆盖", async () => {
    const analyzed = analyzeSecurityCase(caseB);
    const created = await createCase({
      draft: { ...caseB, humanReview: null },
      checklist: analyzed.checklist,
      suggestedRiskLevel: analyzed.suggestedAssessment?.suggestedRiskLevel ?? null,
    });
    await saveCaseState(created.id, {
      caseData: created.caseState.caseData,
      businessContext: created.caseState.businessContext,
      checklist: created.caseState.checklist,
      humanReview: {
        reviewer: "王研判",
        finalConclusion: "SUSPECTED_SECURITY_INCIDENT",
        humanRiskLevel: "CRITICAL",
        conclusionNote: "疑似账号异常，建议进一步核查",
        adjustments: ["人工上调风险"],
        confirmedAt: "2026-08-08T21:00:00+08:00",
      },
      timeline: created.caseState.timeline,
      suggestedRiskLevel: "HIGH",
    });
    const view = restoreWorkbenchFromPersisted((await getCaseById(created.id))!);
    expect(view.draft.humanReview?.humanRiskLevel).toBe("CRITICAL");
    expect(view.draft.humanReview?.finalConclusion).toBe(
      "SUSPECTED_SECURITY_INCIDENT",
    );
    // 重新分析后 draft 中 humanReview 仍来自持久化
    const reanalyzed = analyzeSecurityCase(view.draft);
    expect(reanalyzed.humanReview?.humanRiskLevel).toBe("CRITICAL");
    expect(reanalyzed.suggestedAssessment?.suggestedRiskLevel).toBe("HIGH");
    expect(reanalyzed.humanReview?.humanRiskLevel).not.toBe(
      reanalyzed.suggestedAssessment?.suggestedRiskLevel,
    );
  });

  it("Timeline 人工事件保存并恢复，且按 id 去重", async () => {
    const analyzed = analyzeSecurityCase(caseB);
    const created = await createCase({
      draft: caseB,
      checklist: analyzed.checklist,
      suggestedRiskLevel: analyzed.suggestedAssessment?.suggestedRiskLevel ?? null,
    });
    const humanEvent = {
      id: "human-tl-step3",
      occurredAt: "2026-08-08T21:10:00+08:00",
      eventType: "其他",
      title: "补充处置记录",
      description: "已通知业务方协助核查",
      operator: "王研判",
      source: "HUMAN" as const,
    };
    await saveCaseState(created.id, {
      caseData: created.caseState.caseData,
      businessContext: created.caseState.businessContext,
      checklist: created.caseState.checklist,
      humanReview: created.caseState.humanReview,
      timeline: [...created.caseState.timeline, humanEvent],
      suggestedRiskLevel: created.suggestedRiskLevel,
    });
    const view = restoreWorkbenchFromPersisted((await getCaseById(created.id))!);
    expect(view.draft.timeline.some((e) => e.id === "human-tl-step3")).toBe(
      true,
    );

    const merged = mergeTimelineOnRestore(view.draft.timeline, [
      view.draft.timeline[0],
      humanEvent,
    ]);
    expect(merged.filter((e) => e.id === "human-tl-step3")).toHaveLength(1);
  });

  it("CaseStatus 保存；CLOSED 设置 closedAt；重新打开清除 closedAt", async () => {
    const analyzed = analyzeSecurityCase(caseA);
    const created = await createCase({
      draft: caseA,
      checklist: analyzed.checklist,
      suggestedRiskLevel: analyzed.suggestedAssessment?.suggestedRiskLevel ?? null,
      status: "INVESTIGATING",
    });

    const closed = await saveCaseState(created.id, {
      caseData: created.caseState.caseData,
      businessContext: created.caseState.businessContext,
      checklist: created.caseState.checklist,
      humanReview: created.caseState.humanReview,
      timeline: created.caseState.timeline,
      suggestedRiskLevel: created.suggestedRiskLevel,
      status: "CLOSED",
    });
    expect(closed.status).toBe("CLOSED");
    expect(closed.closedAt).not.toBeNull();

    const reopened = await saveCaseState(created.id, {
      caseData: created.caseState.caseData,
      businessContext: created.caseState.businessContext,
      checklist: created.caseState.checklist,
      humanReview: created.caseState.humanReview,
      timeline: created.caseState.timeline,
      suggestedRiskLevel: created.suggestedRiskLevel,
      status: "INVESTIGATING",
    });
    expect(reopened.status).toBe("INVESTIGATING");
    expect(reopened.closedAt).toBeNull();
  });

  it("saveCaseState 后 pendingChecklistCount / HumanReview 索引 / systemsSearchText 同步", async () => {
    const analyzed = analyzeSecurityCase(caseB);
    const created = await createCase({
      draft: caseB,
      checklist: analyzed.checklist,
      suggestedRiskLevel: analyzed.suggestedAssessment?.suggestedRiskLevel ?? null,
    });
    const nextChecklist = created.caseState.checklist.map((item) => ({
      ...item,
      completed: true,
    }));
    const saved = await saveCaseState(created.id, {
      caseData: {
        ...created.caseState.caseData,
        identityContext: {
          ...created.caseState.caseData.identityContext,
          accessedSystems: ["HR", "ERP"],
        },
      },
      businessContext: created.caseState.businessContext,
      checklist: nextChecklist,
      humanReview: {
        reviewer: "王研判",
        finalConclusion: "SUSPECTED_SECURITY_INCIDENT",
        humanRiskLevel: "HIGH",
        conclusionNote: "疑似",
        adjustments: [],
        confirmedAt: "2026-08-08T21:20:00+08:00",
      },
      timeline: created.caseState.timeline,
      suggestedRiskLevel: created.suggestedRiskLevel,
      status: "PENDING_VERIFICATION",
    });
    expect(saved.pendingChecklistCount).toBe(0);
    expect(saved.humanRiskLevel).toBe("HIGH");
    expect(saved.humanConclusion).toBe("SUSPECTED_SECURITY_INCIDENT");
    expect(saved.systemsSearchText).toBe("HR|ERP");
    expect(saved.status).toBe("PENDING_VERIFICATION");
    const listed = await listCases({ search: saved.caseNumber });
    expect(listed[0]?.pendingChecklistCount).toBe(0);
    expect(listed[0]?.status).toBe("PENDING_VERIFICATION");
  });

  it("UNKNOWN / 无可用风险恢复后仍显示暂无法评级", async () => {
    const analyzed = analyzeSecurityCase(caseA);
    const created = await createCase({
      draft: { ...caseA, humanReview: null },
      checklist: analyzed.checklist,
      suggestedRiskLevel: null,
    });
    await saveCaseState(created.id, {
      caseData: created.caseState.caseData,
      businessContext: created.caseState.businessContext,
      checklist: created.caseState.checklist,
      humanReview: null,
      timeline: created.caseState.timeline,
      suggestedRiskLevel: null,
    });
    const record = await getCaseById(created.id);
    expect(
      displayCaseListRisk(record!.humanRiskLevel, record!.suggestedRiskLevel),
    ).toBe("暂无法评级");
    expect(
      displayCaseListRisk(record!.humanRiskLevel, record!.suggestedRiskLevel),
    ).not.toBe("低风险");
  });

  it("Case A 保存恢复后授权业务方向不变", async () => {
    const analyzed = analyzeSecurityCase(caseA);
    const created = await createCase({
      draft: caseA,
      checklist: analyzed.checklist,
      suggestedRiskLevel: analyzed.suggestedAssessment?.suggestedRiskLevel ?? null,
    });
    const view = restoreWorkbenchFromPersisted((await getCaseById(created.id))!);
    const reanalyzed = analyzeSecurityCase(view.draft);
    expect(view.draft.businessContext.businessLegitimacy).toBe("AUTHORIZED");
    expect(view.draft.businessContext.ownerVerification).toBe("CONFIRMED");
    expect(reanalyzed.suggestedAssessment?.businessLegitimacy).toBe(
      "AUTHORIZED",
    );
    expect(reanalyzed.dataContext.accessStatus).toBe("ABNORMAL");
    expect(reanalyzed.suggestedAssessment?.summary).toMatch(
      /授权|业务|工单|核查/,
    );
  });

  it("Case B 保存恢复后疑似事件方向不变", async () => {
    const analyzed = analyzeSecurityCase(caseB);
    const created = await createCase({
      draft: caseB,
      checklist: analyzed.checklist,
      suggestedRiskLevel: analyzed.suggestedAssessment?.suggestedRiskLevel ?? null,
    });
    const view = restoreWorkbenchFromPersisted((await getCaseById(created.id))!);
    const reanalyzed = analyzeSecurityCase(view.draft);
    expect(reanalyzed.suggestedAssessment?.suggestedRiskLevel).toBe("HIGH");
    expect(reanalyzed.suggestedAssessment?.summary).toMatch(/疑似|风险|核查/);
    expect(reanalyzed.identityContext.identityStatus).toBe("ABNORMAL");
  });
});
