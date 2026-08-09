/**
 * v1.5 Milestone 3 Workstream A：Investigation Progress Service contract。
 *
 * 在 Investigation Context Catalog 之上聚合调查进度投影；
 * 复用已有 findings / checklist / HumanReview 事实，不引入第二套 resolver。
 */
import type { CaseComplianceFinding } from "@/domain/knowledge";
import {
  resolveInvestigationProgress,
  type InvestigationProgress,
  type InvestigationProgressItem,
  type InvestigationProgressKind,
  type InvestigationProgressStatus,
  type InvestigationProgressSummary,
  type ResolveInvestigationProgressInput,
} from "@/domain/investigationProgress";
import type { SecurityCase } from "@/domain/types";

export type ResolveInvestigationProgressOptions = {
  /** 合规 runtime findings（如 refreshCaseComplianceRuntime 输出） */
  complianceFindings?: readonly CaseComplianceFinding[];
};

export {
  resolveInvestigationProgress,
  type InvestigationProgress,
  type InvestigationProgressItem,
  type InvestigationProgressKind,
  type InvestigationProgressStatus,
  type InvestigationProgressSummary,
  type ResolveInvestigationProgressInput,
};

/**
 * 基于 SecurityCase 解析当前 Investigation Progress。
 * 只读投影：不修改 Case、Checklist、Report 或 HumanReview。
 */
export function loadInvestigationProgress(
  securityCase: SecurityCase,
  options?: ResolveInvestigationProgressOptions,
): InvestigationProgress {
  return resolveInvestigationProgress({
    securityCase,
    complianceFindings: options?.complianceFindings,
  });
}
