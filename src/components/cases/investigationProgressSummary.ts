/**
 * v1.5 M3 Workstream C：Investigation Progress 展示适配。
 *
 * 职责仅限：Server DTO → UI view model / 锚点 / 文案。
 * Progress OPEN/RESOLVED 语义以 Hermes backend projection 为唯一 SoT；
 * 禁止在 Client 侧独立判断 Context missing / UNKNOWN / RESOLVED。
 */

/** 与 Server `InvestigationProgressViewDto` 对齐的只读形状（避免 Client import resolver） */
export type InvestigationProgressViewDto =
  | {
      resolutionStatus: "SUCCESS";
      summary: {
        openCount: number;
        resolvedCount: number;
        openContextCount: number;
        openEvidenceCount: number;
        openChecklistCount: number;
        hasUnresolvedInvestigationGaps: boolean;
        humanReviewSubmitted: boolean;
      };
    }
  | {
      resolutionStatus: "RESOLUTION_UNAVAILABLE";
    };

/** 可滚动定位的工作台区域 id */
export const INVESTIGATION_SECTION_IDS = {
  progress: "investigation-progress",
  businessContext: "investigation-business-context",
  complianceChecklist: "investigation-compliance-checklist",
  evidence: "investigation-evidence",
  checklist: "investigation-checklist",
  humanReview: "investigation-human-review",
} as const;

export type InvestigationProgressPanelView = {
  resolutionStatus: InvestigationProgressViewDto["resolutionStatus"];
  /** resolver 不可用时为 true；不能把未知当成「没有待办」。 */
  isResolutionUnavailable: boolean;
  pendingContext: number;
  pendingEvidence: number;
  pendingChecks: number;
  /** 调查事项 RESOLVED 数；≠ Case 正常 / 可结案 */
  resolvedCount: number;
  hasOutstandingWork: boolean;
  /** 人工结论是否已提交（事实）；不驱动 Progress 自动结案 */
  humanReviewSubmitted: boolean;
  disclaimer: string;
  humanReviewFactLabel: string;
};

export const INVESTIGATION_PROGRESS_DISCLAIMER =
  "调查进度为系统汇总概览，仅汇总尚未解决的调查事项；全部已解决不等于案件正常或可结案，最终结论须人工确认。";

/**
 * DTO → 面板展示模型。不做 BC missing + CONTEXT suggestion 二次计数。
 */
export function toInvestigationProgressPanelView(
  dto: InvestigationProgressViewDto,
): InvestigationProgressPanelView {
  if (dto.resolutionStatus === "RESOLUTION_UNAVAILABLE") {
    return {
      resolutionStatus: dto.resolutionStatus,
      isResolutionUnavailable: true,
      pendingContext: 0,
      pendingEvidence: 0,
      pendingChecks: 0,
      resolvedCount: 0,
      hasOutstandingWork: true,
      humanReviewSubmitted: false,
      disclaimer:
        "调查进度暂不可用，当前无法完成重新解析；请稍后刷新后继续核查。",
      humanReviewFactLabel: "人工研判结论：调查进度不可用，未能确认当前核查状态。",
    };
  }

  const s = dto.summary;
  return {
    resolutionStatus: dto.resolutionStatus,
    isResolutionUnavailable: false,
    pendingContext: s.openContextCount,
    pendingEvidence: s.openEvidenceCount,
    pendingChecks: s.openChecklistCount,
    resolvedCount: s.resolvedCount,
    hasOutstandingWork: s.hasUnresolvedInvestigationGaps,
    humanReviewSubmitted: s.humanReviewSubmitted,
    disclaimer: INVESTIGATION_PROGRESS_DISCLAIMER,
    humanReviewFactLabel: s.humanReviewSubmitted
      ? "人工研判结论：已提交（事实状态，非进度自动结案）"
      : "人工研判结论：尚未提交",
  };
}

export function scrollToInvestigationSection(sectionId: string): void {
  if (typeof document === "undefined") return;
  const el = document.getElementById(sectionId);
  if (!el) return;
  el.scrollIntoView({ behavior: "smooth", block: "start" });
}
