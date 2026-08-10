import { describe, expect, it } from "vitest";
import { deriveInvestigationOverviewStats } from "@/components/cases/investigationOverviewStats";
import type { AnalysisResult, ChecklistItem } from "@/domain/types";

function result(status: AnalysisResult["status"]): AnalysisResult {
  return {
    ruleId: `R-${status}`,
    category: "DATA",
    status,
    riskLevel: status === "UNKNOWN" ? null : "MEDIUM",
    title: status,
    explanation: "test",
    evidenceIds: [],
    verificationActions: [],
  };
}

function checklistItem(completed: boolean): ChecklistItem {
  return {
    id: `c-${completed ? "done" : "open"}`,
    category: "DATA",
    label: "check",
    completed,
    note: null,
    origin: "SYSTEM",
    relatedRuleId: "R-1",
  };
}

describe("deriveInvestigationOverviewStats", () => {
  it("统计 ABNORMAL / UNKNOWN / 未完成 checklist，并透传建议风险", () => {
    const stats = deriveInvestigationOverviewStats({
      analysisResults: [
        result("ABNORMAL"),
        result("ABNORMAL"),
        result("UNKNOWN"),
        result("NORMAL"),
      ],
      checklist: [
        checklistItem(false),
        checklistItem(false),
        checklistItem(true),
      ],
      suggestedRiskLevel: "HIGH",
    });

    expect(stats.abnormalCount).toBe(2);
    expect(stats.unknownCount).toBe(1);
    expect(stats.pendingChecklistCount).toBe(2);
    expect(stats.suggestedRiskLevel).toBe("HIGH");
  });

  it("建议风险缺失时为 null", () => {
    const stats = deriveInvestigationOverviewStats({
      analysisResults: [],
      checklist: [],
      suggestedRiskLevel: undefined,
    });
    expect(stats.suggestedRiskLevel).toBeNull();
    expect(stats.abnormalCount).toBe(0);
    expect(stats.unknownCount).toBe(0);
    expect(stats.pendingChecklistCount).toBe(0);
  });
});
