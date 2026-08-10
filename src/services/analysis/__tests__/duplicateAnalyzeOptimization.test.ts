/**
 * M3-01：消除同一条逻辑链内对相同 persisted state 的重复 analyze。
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { caseB } from "@/domain/demo";
import * as analyzeModule from "@/services/analysis/analyzeSecurityCase";
import { mergeChecklistOnRestore } from "@/services/persistence/caseMapper";
import type { PersistedCase } from "@/services/persistence/types";

const { loadCaseDetailPageData } = await import(
  "@/app/(app)/cases/loadCaseDetailPageData"
);
const { restoreWorkbenchFromPersisted } = await import(
  "@/services/persistence/restoreWorkbench"
);
const { loadCaseWorkbenchRuntimeViews } = await import(
  "@/app/(app)/cases/loadCaseWorkbenchRuntime"
);
const {
  buildInitialReportFromRecord,
  resolveComplianceSnapshotsForReport,
} = await import("@/services/persistence/reportDraftService");

function buildPersistedCase(): PersistedCase {
  const analyzed = analyzeModule.analyzeSecurityCase(caseB);
  return {
    id: caseB.id,
    caseNumber: "INC-20260808-002",
    title: caseB.name,
    status: "PENDING_VERIFICATION",
    suggestedRiskLevel: analyzed.suggestedAssessment?.suggestedRiskLevel ?? null,
    humanRiskLevel: caseB.humanReview?.humanRiskLevel ?? null,
    humanConclusion: caseB.humanReview?.finalConclusion ?? null,
    username: caseB.identityContext.accountName,
    sourceIp: caseB.identityContext.loginSourceIp,
    systemsSearchText: caseB.identityContext.accessedSystems.join("|"),
    pendingChecklistCount: analyzed.checklist.filter((item) => !item.completed)
      .length,
    hasReport: false,
    reportUpdatedAt: null,
    lastActivityAt: caseB.createdAt,
    createdAt: caseB.createdAt,
    updatedAt: caseB.createdAt,
    closedAt: null,
    reportDraft: null,
    caseState: {
      caseData: {
        name: caseB.name,
        createdAt: caseB.createdAt,
        alert: caseB.alert,
        dataContext: caseB.dataContext,
        networkContext: caseB.networkContext,
        identityContext: caseB.identityContext,
      },
      businessContext: caseB.businessContext,
      checklist: analyzed.checklist,
      humanReview: caseB.humanReview,
      timeline: caseB.timeline,
    },
  };
}

describe("M3 duplicate analyze optimization", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("Case 详情页加载：同一 record 只 analyze 一次（优化后）", async () => {
    const record = buildPersistedCase();
    const spy = vi.spyOn(analyzeModule, "analyzeSecurityCase");

    await loadCaseDetailPageData(record);

    expect(spy).toHaveBeenCalledTimes(1);
  });

  it("Case 详情页加载：旧路径 restore + runtime 会 analyze 两次", async () => {
    const record = buildPersistedCase();
    const spy = vi.spyOn(analyzeModule, "analyzeSecurityCase");

    restoreWorkbenchFromPersisted(record);
    await loadCaseWorkbenchRuntimeViews(record);

    expect(spy).toHaveBeenCalledTimes(2);
  });

  it("Case 详情页：优化前后 restore 输出一致", async () => {
    const record = buildPersistedCase();
    const optimized = (await loadCaseDetailPageData(record)).initial;
    const legacy = restoreWorkbenchFromPersisted(record);

    expect(optimized.initialChecklist).toEqual(legacy.initialChecklist);
    expect(optimized.suggestedRiskLevel).toBe(legacy.suggestedRiskLevel);
    expect(optimized.draft.businessContext).toEqual(legacy.draft.businessContext);
  });

  it("报告创建链：resolveCompliance + buildInitial 只 analyze 一次", async () => {
    const record = buildPersistedCase();
    const spy = vi.spyOn(analyzeModule, "analyzeSecurityCase");

    const analyzed = analyzeModule.analyzeSecurityCase(caseB);
    const complianceReferences = await resolveComplianceSnapshotsForReport(
      record,
      analyzed,
    );
    buildInitialReportFromRecord(record, { complianceReferences, analyzed });

    expect(spy).toHaveBeenCalledTimes(1);
  });

  it("报告创建链：未传 analyzed 时会重复 analyze（旧行为对照）", async () => {
    const record = buildPersistedCase();
    const spy = vi.spyOn(analyzeModule, "analyzeSecurityCase");

    const complianceReferences =
      await resolveComplianceSnapshotsForReport(record);
    buildInitialReportFromRecord(record, { complianceReferences });

    expect(spy).toHaveBeenCalledTimes(2);
  });

  it("structured BC 变更：useMemo 单路径与旧双 analyze checklist 一致", () => {
    const analyzedBase = analyzeModule.analyzeSecurityCase(caseB);
    const checklistBase = analyzedBase.checklist;
    const nextBusinessContext = {
      ...caseB.businessContext,
      plannedTaskStatus: "CONFIRMED" as const,
    };

    const legacyExplicit = mergeChecklistOnRestore(
      checklistBase,
      analyzeModule.analyzeSecurityCase({
        ...caseB,
        businessContext: nextBusinessContext,
      }).checklist,
    );

    const singleAnalyze = mergeChecklistOnRestore(
      checklistBase,
      analyzeModule.analyzeSecurityCase({
        ...caseB,
        businessContext: nextBusinessContext,
        humanReview: caseB.humanReview,
        timeline: caseB.timeline,
      }).checklist,
    );

    expect(singleAnalyze).toEqual(legacyExplicit);
  });
});
