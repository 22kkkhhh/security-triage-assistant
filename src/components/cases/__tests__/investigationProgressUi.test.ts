/**
 * v1.5 M3 Workstream C：Server Investigation Progress → Case UI。
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  toInvestigationProgressPanelView,
  type InvestigationProgressViewDto,
} from "@/components/cases/investigationProgressSummary";
import { caseA, caseB } from "@/domain/demo";
import { analyzeSecurityCase } from "@/services/analysis/analyzeSecurityCase";
import { completeChecklistItem } from "@/services/checklist/generateChecklist";
import { loadInvestigationProgress } from "@/services/knowledge/resolveInvestigationProgress";

const root = path.resolve(import.meta.dirname, "../../..");

function readSrc(rel: string): string {
  return readFileSync(path.join(root, rel), "utf8").replace(/\r\n/g, "\n");
}

function dtoFromSummary(
  summary: ReturnType<typeof loadInvestigationProgress>["summary"],
): InvestigationProgressViewDto {
  return { resolutionStatus: "SUCCESS", summary: { ...summary } };
}

describe("Server Progress DTO → UI view model", () => {
  it("server progress DTO 能映射进 Case UI 四类计数", () => {
    const progress = loadInvestigationProgress(analyzeSecurityCase(caseA));
    const view = toInvestigationProgressPanelView(dtoFromSummary(progress.summary));
    expect(view.pendingContext).toBe(progress.summary.openContextCount);
    expect(view.pendingEvidence).toBe(progress.summary.openEvidenceCount);
    expect(view.pendingChecks).toBe(progress.summary.openChecklistCount);
    expect(view.resolvedCount).toBe(progress.summary.resolvedCount);
    expect(view.hasOutstandingWork).toBe(
      progress.summary.hasUnresolvedInvestigationGaps,
    );
  });

  it("MISSING context → UI OPEN（待补充上下文 > 0）", () => {
    const sparse = analyzeSecurityCase({
      ...caseB,
      businessContext: {
        ...caseB.businessContext,
        changeTicketId: null,
        businessOwner: null,
        businessJustification: null,
        ownerVerification: "UNKNOWN",
      },
    });
    const progress = loadInvestigationProgress(sparse);
    const openContext = progress.contextItems.filter((i) => i.status === "OPEN");
    expect(openContext.length).toBeGreaterThan(0);
    const view = toInvestigationProgressPanelView(dtoFromSummary(progress.summary));
    expect(view.pendingContext).toBe(progress.summary.openContextCount);
    expect(view.pendingContext).toBe(openContext.length);
  });

  it("UNKNOWN context → UI 仍 OPEN", () => {
    const progress = loadInvestigationProgress(analyzeSecurityCase(caseB));
    const unknownOpen = progress.contextItems.filter(
      (i) => i.status === "OPEN" && i.key.includes("businessOwnerConfirmed"),
    );
    // caseB ownerVerification 常为 UNKNOWN → businessOwnerConfirmed OPEN
    expect(unknownOpen.length + progress.summary.openContextCount).toBeGreaterThan(0);
    const view = toInvestigationProgressPanelView(dtoFromSummary(progress.summary));
    expect(view.pendingContext).toBe(progress.summary.openContextCount);
    expect(view.resolvedCount).not.toBeLessThan(0);
  });

  it("Evidence OPEN 展示", () => {
    const progress = loadInvestigationProgress(analyzeSecurityCase(caseA));
    const view = toInvestigationProgressPanelView(dtoFromSummary(progress.summary));
    expect(view.pendingEvidence).toBe(progress.summary.openEvidenceCount);
    if (progress.summary.openEvidenceCount > 0) {
      expect(
        progress.evidenceItems.some((i) => i.status === "OPEN"),
      ).toBe(true);
    }
  });

  it("checklist completed → 对应 progress RESOLVED 计入已解决", () => {
    const analyzed = analyzeSecurityCase(caseA);
    const first = analyzed.checklist[0];
    expect(first).toBeTruthy();
    const completed = {
      ...analyzed,
      checklist: analyzed.checklist.map((item, idx) =>
        idx === 0 ? completeChecklistItem(item) : item,
      ),
    };
    const before = loadInvestigationProgress(analyzed);
    const after = loadInvestigationProgress(completed);
    expect(after.summary.resolvedCount).toBeGreaterThanOrEqual(
      before.summary.resolvedCount,
    );
    const afterItem = after.checklistItems.find(
      (i) => i.key === `checklist:${first!.id}`,
    );
    expect(afterItem?.status).toBe("RESOLVED");
    const view = toInvestigationProgressPanelView(dtoFromSummary(after.summary));
    expect(view.resolvedCount).toBe(after.summary.resolvedCount);
  });

  it("同一 gap 不重复计数：DTO 映射不做 BC+CONTEXT 相加", () => {
    const summarySrc = readSrc(
      "components/cases/investigationProgressSummary.ts",
    );
    expect(summarySrc).not.toContain("businessContextFieldNeedsAttention");
    expect(summarySrc).not.toContain("countBusinessContextPendingFields");
    expect(summarySrc).not.toContain("pendingContextSuggestions");
    expect(summarySrc).not.toContain("summarizeInvestigationProgress");
    expect(summarySrc).toContain("toInvestigationProgressPanelView");
  });

  it("全部 resolved 不等于 Case normal / 可结案", () => {
    const view = toInvestigationProgressPanelView({
      resolutionStatus: "SUCCESS",
      summary: {
        openCount: 0,
        resolvedCount: 12,
        openContextCount: 0,
        openEvidenceCount: 0,
        openChecklistCount: 0,
        hasUnresolvedInvestigationGaps: false,
        humanReviewSubmitted: false,
      },
    });
    expect(view.hasOutstandingWork).toBe(false);
    expect(view.humanReviewSubmitted).toBe(false);
    expect(view.disclaimer).toContain("不等于案件正常或可结案");
    expect(view.humanReviewFactLabel).toContain("尚未提交");
    const panel = readSrc("components/cases/InvestigationProgressPanel.tsx");
    expect(panel).not.toMatch(/案件正常|调查完成|可以结案/);
  });

  it("HumanReview 不被自动提交；仅事实状态", () => {
    const withHr = loadInvestigationProgress(
      analyzeSecurityCase({
        ...caseA,
        humanReview: {
          reviewer: "分析员甲",
          reviewedByUserId: "u1",
          finalConclusion: "SUSPECTED_SECURITY_INCIDENT",
          humanRiskLevel: "HIGH",
          conclusionNote: "疑似需进一步核查",
          adjustments: [],
          confirmedAt: "2026-08-08T12:00:00+08:00",
        },
      }),
    );
    expect(withHr.summary.humanReviewSubmitted).toBe(true);
    const view = toInvestigationProgressPanelView(dtoFromSummary(withHr.summary));
    expect(view.humanReviewFactLabel).toContain("已提交");
    expect(view.humanReviewFactLabel).toContain("非进度自动结案");
  });

  it("Case A/B regression：均可产出稳定 DTO 映射", () => {
    for (const draft of [caseA, caseB]) {
      const progress = loadInvestigationProgress(analyzeSecurityCase(draft));
      const view = toInvestigationProgressPanelView(dtoFromSummary(progress.summary));
      expect(view.pendingContext).toBe(progress.summary.openContextCount);
      expect(view.pendingEvidence).toBe(progress.summary.openEvidenceCount);
      expect(view.pendingChecks).toBe(progress.summary.openChecklistCount);
      expect(view.resolvedCount).toBe(progress.summary.resolvedCount);
    }
  });

  it("RESOLUTION_UNAVAILABLE 显式映射为不可用状态，不伪装为成功进度", () => {
    const view = toInvestigationProgressPanelView({
      resolutionStatus: "RESOLUTION_UNAVAILABLE",
    });

    expect(view.resolutionStatus).toBe("RESOLUTION_UNAVAILABLE");
    expect(view.isResolutionUnavailable).toBe(true);
    expect(view.hasOutstandingWork).toBe(true);
    expect(view.disclaimer).toContain("调查进度暂不可用");
    expect(view.humanReviewFactLabel).toContain("未能确认");
  });
});

describe("Investigation Progress UI 接线契约", () => {
  const panel = readSrc("components/cases/InvestigationProgressPanel.tsx");
  const summary = readSrc("components/cases/investigationProgressSummary.ts");
  const workbench = readSrc("components/cases/PersistedCaseWorkbench.tsx");
  const page = readSrc("app/(app)/cases/[id]/page.tsx");
  const loader = readSrc("app/(app)/cases/loadCaseWorkbenchRuntime.ts");
  const humanReview = readSrc("components/HumanReviewPanel.tsx");
  const bcPanel = readSrc("components/BusinessContextPanel.tsx");

  it("Server loader → page → workbench → panel", () => {
    expect(loader).toContain("loadInvestigationProgress");
    expect(loader).toContain("resolveCaseCompliance");
    expect(loader).toContain("loadCaseWorkbenchRuntimeViews");
    expect(page).toContain("loadCaseWorkbenchRuntimeViews");
    expect(page).toContain("investigationProgress={runtimeViews.investigationProgress}");
    expect(workbench).toContain("investigationProgress:");
    expect(workbench).toContain("toInvestigationProgressPanelView");
    expect(workbench).toContain("<InvestigationProgressPanel view={investigationProgressView}");
  });

  it("Client 不再独立 Progress 推导 / 不 import resolver", () => {
    expect(workbench).not.toContain("summarizeInvestigationProgress");
    expect(workbench).not.toContain("loadInvestigationProgress");
    expect(workbench).not.toContain("resolveInvestigationProgress");
    expect(workbench).not.toContain("resolveCaseCompliance");
    expect(panel).not.toContain("loadInvestigationProgress");
    expect(summary).not.toContain("loadInvestigationProgress");
    expect(summary).not.toContain("businessContextFieldNeedsAttention");
  });

  it("resolver 不可用时显示 fail-closed 提示，不渲染成功计数", () => {
    expect(loader).toContain('resolutionStatus: "RESOLUTION_UNAVAILABLE"');
    expect(panel).toContain('view.resolutionStatus === "RESOLUTION_UNAVAILABLE"');
    expect(panel).toContain("调查进度暂不可用");
    expect(panel).toContain("不得将当前状态视为已完成核查或全部已解决");
    expect(workbench).toContain("investigationProgressUnavailable");
    expect(humanReview).toContain("当前无法确认核查状态");
  });

  it("UI 文案：待补/证据/核查/已解决；非最终结论", () => {
    expect(panel).toContain("待补充上下文");
    expect(panel).toContain("待收集证据");
    expect(panel).toContain("待完成核查");
    expect(panel).toContain("已解决");
    expect(panel).toContain("非最终结论");
  });

  it("HumanReview 提示不 hard-block", () => {
    expect(workbench).toContain(
      "outstandingWorkHint={investigationProgressView.hasOutstandingWork}",
    );
    expect(humanReview).toContain(
      "当前仍有待核查事项，请结合现有证据完成人工研判。",
    );
    expect(humanReview).not.toMatch(/disabled=\{outstandingWorkHint\}/);
  });

  it("VIEWER readonly 仍由 capability 控制", () => {
    expect(workbench).toContain("canWriteBusinessContext");
    expect(workbench).toContain("canWriteHumanReview");
    expect(workbench).toContain(
      "if (structured && !capabilities.canWriteHumanReview) return;",
    );
  });

  it("M1 router.refresh regression：同时刷新 progress", () => {
    expect(workbench).toContain("router.refresh()");
    expect(workbench).toContain("refreshComplianceAfterContextPersist");
    expect(workbench).toContain("Investigation Progress");
  });

  it("M2 BusinessContext UI regression", () => {
    expect(bcPanel).toContain("待补充");
    expect(bcPanel).toContain("任务与变更");
    expect(workbench).toContain("saveState={saveState}");
    expect(workbench).toContain("onRetrySave={retrySave}");
  });

  it("Context 补齐路径依赖 router.refresh 重载 Server DTO（无第二套 client fetch）", () => {
    expect(workbench).not.toContain("fetch(");
    expect(workbench).not.toContain("loadCaseWorkbenchRuntimeViews");
    expect(page).toContain("loadCaseWorkbenchRuntimeViews(record)");
  });
});
