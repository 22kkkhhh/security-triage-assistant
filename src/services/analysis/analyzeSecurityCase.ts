import type { SecurityCase, SecurityCaseDraft } from "@/domain/types";
import {
  applyBusinessContextCompletion,
  generateChecklist,
} from "@/services/checklist/generateChecklist";
import { runRules } from "./runRules";
import { buildSuggestedAssessment } from "./suggestedAssessment";

/**
 * 对案件草稿执行完整规则分析，返回填充了分析结果的 SecurityCase。
 * - 纯函数，不修改入参；
 * - humanReview 原样透传，系统分析绝不覆盖人工结论；
 * - 业务上下文已确认的核查事项自动标记为已完成。
 */
export function analyzeSecurityCase(draft: SecurityCaseDraft): SecurityCase {
  const { results, evidences } = runRules(draft);
  const checklist = applyBusinessContextCompletion(
    generateChecklist(results),
    draft.businessContext,
  );
  const suggestedAssessment = buildSuggestedAssessment({
    results,
    businessContext: draft.businessContext,
  });

  return {
    ...draft,
    analysisResults: results,
    evidences,
    checklist,
    suggestedAssessment,
  };
}
