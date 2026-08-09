/**
 * v1.5 M3 Workstream B：调查进度展示汇总（Client 呈现层）。
 *
 * 仅消费工作台已有数据：BusinessContext、Case checklist、complianceChecklist。
 * 不是 backend InvestigationProgress resolver；不推导最终 Case 结论 / RESOLVED。
 */
import { businessContextFieldNeedsAttention } from "@/components/BusinessContextPanel";
import type { BusinessContext, ChecklistItem } from "@/domain/types";
import type {
  CaseComplianceChecklistKind,
  CaseComplianceChecklistView,
} from "@/services/knowledge/caseComplianceChecklist";

/** 可滚动定位的工作台区域 id（与 UI 锚点一致） */
export const INVESTIGATION_SECTION_IDS = {
  progress: "investigation-progress",
  businessContext: "investigation-business-context",
  complianceChecklist: "investigation-compliance-checklist",
  evidence: "investigation-evidence",
  checklist: "investigation-checklist",
  humanReview: "investigation-human-review",
} as const;

/** BusinessContext 中可可靠判断「字段自身待补充」的键（含 UNKNOWN） */
export const BUSINESS_CONTEXT_PROGRESS_FIELDS = [
  "changeTicketId",
  "businessOwner",
  "businessJustification",
  "plannedTaskStatus",
  "changeTicketStatus",
  "ownerVerification",
  "businessLegitimacy",
] as const satisfies ReadonlyArray<keyof BusinessContext>;

export type InvestigationProgressCounts = {
  /** 待补充上下文：BC 字段待补充 + 合规 CONTEXT 建议条数（可能轻度重叠） */
  pendingContext: number;
  /** 待收集证据：合规 EVIDENCE 建议条数 */
  pendingEvidence: number;
  /** 待完成核查：Case checklist 未完成项 */
  pendingChecks: number;
  /** 已完成：Case checklist 已勾选完成项（非复杂 RESOLVED） */
  completedChecks: number;
  /** 仅 BC 字段级待补充（含 UNKNOWN），便于测试与说明 */
  pendingBusinessContextFields: number;
  /** 合规 CONTEXT 建议条数 */
  pendingContextSuggestions: number;
  /** 是否仍有明显待办（用于 HumanReview 提示，不阻止提交） */
  hasOutstandingWork: boolean;
};

export function countComplianceKind(
  view: CaseComplianceChecklistView,
  kind: CaseComplianceChecklistKind,
): number {
  return view.groups.find((g) => g.kind === kind)?.items.length ?? 0;
}

export function countBusinessContextPendingFields(
  ctx: BusinessContext,
): number {
  return BUSINESS_CONTEXT_PROGRESS_FIELDS.filter((field) =>
    businessContextFieldNeedsAttention(field, ctx),
  ).length;
}

/**
 * 从现有 Client 数据汇总调查进度计数。
 * UNKNOWN 只计入待补充，绝不计入已完成。
 */
export function summarizeInvestigationProgress(input: {
  businessContext: BusinessContext;
  checklist: readonly ChecklistItem[];
  complianceChecklist: CaseComplianceChecklistView;
}): InvestigationProgressCounts {
  const pendingBusinessContextFields = countBusinessContextPendingFields(
    input.businessContext,
  );
  const pendingContextSuggestions = countComplianceKind(
    input.complianceChecklist,
    "CONTEXT",
  );
  const pendingContext =
    pendingBusinessContextFields + pendingContextSuggestions;
  const pendingEvidence = countComplianceKind(
    input.complianceChecklist,
    "EVIDENCE",
  );
  const pendingChecks = input.checklist.filter((item) => !item.completed).length;
  const completedChecks = input.checklist.filter(
    (item) => item.completed,
  ).length;
  const hasOutstandingWork =
    pendingContext > 0 || pendingEvidence > 0 || pendingChecks > 0;

  return {
    pendingContext,
    pendingEvidence,
    pendingChecks,
    completedChecks,
    pendingBusinessContextFields,
    pendingContextSuggestions,
    hasOutstandingWork,
  };
}

export function scrollToInvestigationSection(
  sectionId: string,
): void {
  if (typeof document === "undefined") return;
  const el = document.getElementById(sectionId);
  if (!el) return;
  el.scrollIntoView({ behavior: "smooth", block: "start" });
}
