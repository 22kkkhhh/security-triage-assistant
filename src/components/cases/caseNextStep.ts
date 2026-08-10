/**
 * Case 详情「建议下一步」：纯 UI 导航建议。
 * 只消费 Investigation Progress 展示模型；不写库、不改变 Case 状态、不重跑 resolver。
 */

import {
  INVESTIGATION_SECTION_IDS,
  type InvestigationProgressPanelView,
} from "./investigationProgressSummary";

export type CaseNextStepTarget =
  | typeof INVESTIGATION_SECTION_IDS.businessContext
  | typeof INVESTIGATION_SECTION_IDS.evidence
  | typeof INVESTIGATION_SECTION_IDS.checklist
  | typeof INVESTIGATION_SECTION_IDS.humanReview;

export type CaseNextStepSuggestion = {
  /** 主标题，例如「补充业务上下文」 */
  title: string;
  /** 补充说明；不含「可结案 / 已安全 / 调查完成」等语义 */
  detail: string;
  /** CTA 按钮文案 */
  ctaLabel: string;
  /** scroll 目标 section id */
  targetId: CaseNextStepTarget;
  /** fail-closed / unavailable 时为 true */
  isUnavailable: boolean;
};

/**
 * 根据已有 Progress 展示模型生成「建议下一步」。
 * SUCCESS：按 pendingContext → pendingEvidence → pendingChecks → HumanReview 顺序。
 * RESOLUTION_UNAVAILABLE：不得根据 0 数字生成「已完成」类下一步。
 */
export function resolveCaseNextStep(
  view: Pick<
    InvestigationProgressPanelView,
    | "resolutionStatus"
    | "pendingContext"
    | "pendingEvidence"
    | "pendingChecks"
    | "humanReviewSubmitted"
  >,
): CaseNextStepSuggestion {
  if (view.resolutionStatus === "RESOLUTION_UNAVAILABLE") {
    return {
      title: "调查进度暂不可用，请结合现有信息继续人工核查。",
      detail: "当前无法依据调查进度汇总给出待办优先级，请继续人工核查。",
      ctaLabel: "查看人工研判",
      targetId: INVESTIGATION_SECTION_IDS.humanReview,
      isUnavailable: true,
    };
  }

  if (view.pendingContext > 0) {
    return {
      title: "补充业务上下文",
      detail: `当前还有 ${view.pendingContext} 项上下文需要确认`,
      ctaLabel: "去处理",
      targetId: INVESTIGATION_SECTION_IDS.businessContext,
      isUnavailable: false,
    };
  }

  if (view.pendingEvidence > 0) {
    return {
      title: "继续核查相关证据",
      detail: `当前还有 ${view.pendingEvidence} 项证据相关事项待核查`,
      ctaLabel: "去处理",
      targetId: INVESTIGATION_SECTION_IDS.evidence,
      isUnavailable: false,
    };
  }

  if (view.pendingChecks > 0) {
    return {
      title: "完成待核查事项",
      detail: `当前还有 ${view.pendingChecks} 项核查事项待完成`,
      ctaLabel: "去处理",
      targetId: INVESTIGATION_SECTION_IDS.checklist,
      isUnavailable: false,
    };
  }

  if (!view.humanReviewSubmitted) {
    return {
      title: "完成人工最终研判",
      detail: "调查事项汇总已无未解决项，请进行人工最终研判确认",
      ctaLabel: "去研判",
      targetId: INVESTIGATION_SECTION_IDS.humanReview,
      isUnavailable: false,
    };
  }

  return {
    title: "复核人工研判结果",
    detail: "调查事项汇总已无未解决项，请复核已提交的人工研判",
    ctaLabel: "去复核",
    targetId: INVESTIGATION_SECTION_IDS.humanReview,
    isUnavailable: false,
  };
}
