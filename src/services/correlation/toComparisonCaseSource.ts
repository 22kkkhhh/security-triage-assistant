/**
 * PersistedCase + 分析结果 → ComparisonCaseSource（只读装配，无写入）。
 */

import { analyzePersistedCase } from "@/services/analysis/analyzePersistedCase";
import type { PersistedCase } from "@/services/persistence/types";
import type { ComparisonCaseSource } from "./buildCaseComparison";
import { extractCorrelationFacts } from "./extractCorrelationFacts";

export function toComparisonCaseSource(
  record: PersistedCase,
): ComparisonCaseSource {
  const { analyzed } = analyzePersistedCase(record);
  const state = record.caseState;
  return {
    id: record.id,
    caseNumber: record.caseNumber,
    title: record.title,
    status: record.status,
    hasReport: record.hasReport,
    suggestedRiskLevel: record.suggestedRiskLevel,
    humanRiskLevel: record.humanRiskLevel,
    alert: state.caseData.alert,
    identity: state.caseData.identityContext,
    network: state.caseData.networkContext,
    data: state.caseData.dataContext,
    business: state.businessContext,
    suggestedAssessment: analyzed.suggestedAssessment,
    humanReview: state.humanReview,
    correlationFacts: extractCorrelationFacts(record),
  };
}
