/**
 * Case Workbench Overview 派生计数：仅前端展示，不落库、不改 Domain。
 */

import type { AnalysisResult, ChecklistItem, RiskLevel } from "@/domain/types";

export type InvestigationOverviewStats = {
  abnormalCount: number;
  unknownCount: number;
  pendingChecklistCount: number;
  suggestedRiskLevel: RiskLevel | null;
};

export function deriveInvestigationOverviewStats(input: {
  analysisResults: readonly AnalysisResult[];
  checklist: readonly ChecklistItem[];
  suggestedRiskLevel: RiskLevel | null | undefined;
}): InvestigationOverviewStats {
  let abnormalCount = 0;
  let unknownCount = 0;
  for (const result of input.analysisResults) {
    if (result.status === "ABNORMAL") abnormalCount += 1;
    else if (result.status === "UNKNOWN") unknownCount += 1;
  }

  let pendingChecklistCount = 0;
  for (const item of input.checklist) {
    if (!item.completed) pendingChecklistCount += 1;
  }

  return {
    abnormalCount,
    unknownCount,
    pendingChecklistCount,
    suggestedRiskLevel: input.suggestedRiskLevel ?? null,
  };
}
