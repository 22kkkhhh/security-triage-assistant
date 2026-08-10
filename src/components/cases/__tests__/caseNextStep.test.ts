import { describe, expect, it } from "vitest";
import { resolveCaseNextStep } from "@/components/cases/caseNextStep";
import { INVESTIGATION_SECTION_IDS } from "@/components/cases/investigationProgressSummary";

describe("resolveCaseNextStep", () => {
  it("pendingContext > 0 → Business Context", () => {
    const step = resolveCaseNextStep({
      resolutionStatus: "SUCCESS",
      pendingContext: 2,
      pendingEvidence: 5,
      pendingChecks: 3,
      humanReviewSubmitted: false,
    });
    expect(step.title).toBe("补充业务上下文");
    expect(step.detail).toContain("2");
    expect(step.targetId).toBe(INVESTIGATION_SECTION_IDS.businessContext);
    expect(step.isUnavailable).toBe(false);
    expect(step.title + step.detail).not.toMatch(/可结案|已安全|已正常|无风险|调查完成/);
  });

  it("context = 0, evidence > 0 → Evidence", () => {
    const step = resolveCaseNextStep({
      resolutionStatus: "SUCCESS",
      pendingContext: 0,
      pendingEvidence: 1,
      pendingChecks: 9,
      humanReviewSubmitted: false,
    });
    expect(step.title).toBe("继续核查相关证据");
    expect(step.targetId).toBe(INVESTIGATION_SECTION_IDS.evidence);
  });

  it("context/evidence = 0, checks > 0 → Checklist", () => {
    const step = resolveCaseNextStep({
      resolutionStatus: "SUCCESS",
      pendingContext: 0,
      pendingEvidence: 0,
      pendingChecks: 4,
      humanReviewSubmitted: false,
    });
    expect(step.title).toBe("完成待核查事项");
    expect(step.targetId).toBe(INVESTIGATION_SECTION_IDS.checklist);
  });

  it("all pending = 0 + humanReviewSubmitted=false → HumanReview", () => {
    const step = resolveCaseNextStep({
      resolutionStatus: "SUCCESS",
      pendingContext: 0,
      pendingEvidence: 0,
      pendingChecks: 0,
      humanReviewSubmitted: false,
    });
    expect(step.title).toBe("完成人工最终研判");
    expect(step.targetId).toBe(INVESTIGATION_SECTION_IDS.humanReview);
    expect(`${step.title}${step.detail}${step.ctaLabel}`).not.toMatch(
      /可结案|已安全|已正常|无风险|调查完成|无待办/,
    );
  });

  it("all pending = 0 + humanReviewSubmitted=true → HumanReview review", () => {
    const step = resolveCaseNextStep({
      resolutionStatus: "SUCCESS",
      pendingContext: 0,
      pendingEvidence: 0,
      pendingChecks: 0,
      humanReviewSubmitted: true,
    });
    expect(step.title).toBe("复核人工研判结果");
    expect(step.targetId).toBe(INVESTIGATION_SECTION_IDS.humanReview);
    expect(`${step.title}${step.detail}${step.ctaLabel}`).not.toMatch(
      /可结案|已安全|已正常|无风险|调查完成|无待办/,
    );
  });

  it("RESOLUTION_UNAVAILABLE → 不产生完成/无待办/可结案语义", () => {
    const step = resolveCaseNextStep({
      resolutionStatus: "RESOLUTION_UNAVAILABLE",
      pendingContext: 0,
      pendingEvidence: 0,
      pendingChecks: 0,
      humanReviewSubmitted: false,
    });
    expect(step.isUnavailable).toBe(true);
    expect(step.title).toContain("调查进度暂不可用");
    expect(step.ctaLabel).toBe("查看人工研判");
    expect(step.targetId).toBe(INVESTIGATION_SECTION_IDS.humanReview);
    const text = `${step.title}${step.detail}${step.ctaLabel}`;
    expect(text).not.toMatch(/可结案|已完成|无待办|已安全|调查完成/);
  });
});
