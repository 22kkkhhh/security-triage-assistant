import { buildSecurityVerificationSuggestionKey } from "@/domain/securityEvidenceIdentity";
import type {
  AnalysisResult,
  BusinessContext,
  ChecklistItem,
  SecurityDomain,
} from "@/domain/types";

/**
 * 根据 AnalysisResult 自动生成待核查事项。
 * - 仅为非 NORMAL 的结果生成核查项；
 * - 按 label 去重，同一核查事项不重复出现；
 * - UNKNOWN 结果的 verificationActions 即“建议补充的数据”，同样进入清单。
 */
export function generateChecklist(results: AnalysisResult[]): ChecklistItem[] {
  const seen = new Set<string>();
  const items: ChecklistItem[] = [];

  for (const result of results) {
    if (result.status === "NORMAL") continue;
    for (const action of result.verificationActions) {
      const label = action.label.trim();
      if (label.length === 0 || label === "无") continue;
      const suggestionKey = buildSecurityVerificationSuggestionKey(
        result.ruleId,
        action.id,
      );
      if (seen.has(suggestionKey)) continue;
      seen.add(suggestionKey);
      items.push({
        id: `CL-${items.length + 1}`,
        category: result.category,
        label: action.label,
        completed: false,
        note: null,
        origin: "SYSTEM",
        relatedRuleId: result.ruleId,
        sourceKind: "SECURITY_VERIFICATION",
        sourceRef: {
          suggestionKey,
          kind: "EVIDENCE",
          controlCodes: [],
          clauseRefs: [],
          relevance: "",
        },
      });
    }
  }

  return items;
}

/**
 * 业务上下文已确认的事项同步标记为已完成。
 * 例如工单已确认存在时，“查询变更工单”不得仍显示为未完成。
 */
export function applyBusinessContextCompletion(
  items: ChecklistItem[],
  businessContext: BusinessContext,
): ChecklistItem[] {
  const confirmations: [string, boolean][] = [
    ["核查计划任务", businessContext.plannedTaskStatus === "CONFIRMED"],
    ["查询变更工单", businessContext.changeTicketStatus === "CONFIRMED"],
    ["联系业务负责人", businessContext.ownerVerification === "CONFIRMED"],
  ];
  return items.map((item) => {
    const confirmed = confirmations.some(
      ([label, ok]) => item.label === label && ok,
    );
    if (!confirmed || item.completed) return item;
    return { ...item, completed: true, note: item.note ?? "业务上下文已确认" };
  });
}

/** 标记完成（返回新对象，不修改原数据） */
export function completeChecklistItem(
  item: ChecklistItem,
  note: string | null = item.note,
): ChecklistItem {
  return { ...item, completed: true, note };
}

/** 人工编辑备注（返回新对象，不修改原数据） */
export function editChecklistItemNote(
  item: ChecklistItem,
  note: string | null,
): ChecklistItem {
  return { ...item, note };
}

let manualSequence = 0;

/** 人工新增核查项 */
export function createManualChecklistItem(input: {
  category: SecurityDomain;
  label: string;
  note?: string | null;
}): ChecklistItem {
  manualSequence += 1;
  return {
    id: `CL-MANUAL-${manualSequence}`,
    category: input.category,
    label: input.label,
    completed: false,
    note: input.note ?? null,
    origin: "MANUAL",
    relatedRuleId: null,
  };
}
