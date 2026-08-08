import type { AnalysisResult, Evidence, SecurityCaseDraft } from "@/domain/types";
import type { AnalysisRule } from "./types";
import { businessRules } from "./rules/businessRules";
import { dataRules } from "./rules/dataRules";
import { identityRules } from "./rules/identityRules";
import { networkRules } from "./rules/networkRules";

/** V1 全部静态规则 */
export const allRules: AnalysisRule[] = [
  ...dataRules,
  ...identityRules,
  ...networkRules,
  ...businessRules,
];

export interface RuleRunOutput {
  results: AnalysisResult[];
  evidences: Evidence[];
}

/**
 * 顺序执行规则并汇总结果。
 * 每条规则产出的证据统一分配 evidenceId（ruleId-E 序号），
 * 并把 evidenceId 回填到对应 AnalysisResult.evidenceIds。
 */
export function runRules(
  securityCase: SecurityCaseDraft,
  rules: AnalysisRule[] = allRules,
): RuleRunOutput {
  const results: AnalysisResult[] = [];
  const evidences: Evidence[] = [];

  for (const rule of rules) {
    const evaluation = rule.evaluate(securityCase);
    const evidenceIds: string[] = [];

    evaluation.evidences.forEach((draft, index) => {
      const evidenceId = `${rule.ruleId}-E${index + 1}`;
      evidenceIds.push(evidenceId);
      evidences.push({
        evidenceId,
        relatedRuleId: rule.ruleId,
        sourceType: draft.sourceType,
        timestamp: draft.timestamp,
        title: draft.title,
        summary: draft.summary,
        analystNote: null,
        includedInReport: true,
      });
    });

    results.push({
      ruleId: rule.ruleId,
      category: rule.category,
      status: evaluation.status,
      riskLevel: evaluation.riskLevel,
      title: rule.title,
      explanation: evaluation.explanation,
      evidenceIds,
      verificationActions: evaluation.verificationActions,
    });
  }

  return { results, evidences };
}
