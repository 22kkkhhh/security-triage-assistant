/**
 * Step 6：合规建议 → Case ChecklistItem（纯函数）。
 * origin 仍为 MANUAL；provenance 走 sourceKind/sourceRef。
 */
import type {
  ChecklistItem,
  ChecklistSourceRef,
  SecurityDomain,
} from "@/domain/types";
import type { CaseComplianceChecklistItem } from "@/services/knowledge/caseComplianceChecklist";

export function isKnowledgeSuggestedChecklistItem(
  item: ChecklistItem,
): boolean {
  return (
    item.sourceKind === "KNOWLEDGE_SUGGESTED" &&
    typeof item.sourceRef?.suggestionKey === "string" &&
    item.sourceRef.suggestionKey.length > 0
  );
}

export function findChecklistItemBySuggestionKey(
  items: readonly ChecklistItem[],
  suggestionKey: string,
): ChecklistItem | undefined {
  return items.find(
    (item) =>
      isKnowledgeSuggestedChecklistItem(item) &&
      item.sourceRef!.suggestionKey === suggestionKey,
  );
}

export function hasSuggestionInChecklist(
  items: readonly ChecklistItem[],
  suggestionKey: string,
): boolean {
  return Boolean(findChecklistItemBySuggestionKey(items, suggestionKey));
}

/** 由关联控制粗映射 SecurityDomain（仅用于清单分类展示） */
export function categoryFromComplianceSuggestion(
  item: Pick<CaseComplianceChecklistItem, "controlCodes" | "kind">,
): SecurityDomain {
  const blob = item.controlCodes.join(" ");
  if (/CTRL-IAM/.test(blob)) return "IDENTITY";
  if (/CTRL-NETWORK/.test(blob)) return "NETWORK";
  if (/CTRL-DATA|CTRL-PRIVACY|CTRL-DATA-EXPORT|CTRL-DATA-CLASSIFY/.test(blob)) {
    return "DATA";
  }
  if (/CTRL-BUSINESS|CTRL-INCIDENT|CTRL-GOVERNANCE/.test(blob)) {
    return "BUSINESS";
  }
  if (item.kind === "EVIDENCE") return "DATA";
  return "BUSINESS";
}

export function buildSourceRefFromSuggestion(
  suggestion: CaseComplianceChecklistItem,
): ChecklistSourceRef {
  return {
    suggestionKey: suggestion.key,
    kind: suggestion.kind,
    controlCodes: [...suggestion.controlCodes].sort(),
    clauseRefs: suggestion.clauseRefs.map((r) => ({
      clauseKey: r.clauseKey,
      documentCanonicalCode: r.documentCanonicalCode,
    })),
    relevance: suggestion.relevance,
  };
}

/**
 * 从合规建议创建 MANUAL ChecklistItem（不写入 DB）。
 * id 含随机后缀，去重依赖 suggestionKey 而非 id。
 */
export function createChecklistItemFromComplianceSuggestion(
  suggestion: CaseComplianceChecklistItem,
  idSuffix: string = cryptoRandomSuffix(),
): ChecklistItem {
  const sourceRef = buildSourceRefFromSuggestion(suggestion);
  return {
    id: `CL-KS-${sanitizeIdPart(suggestion.key)}-${idSuffix}`,
    category: categoryFromComplianceSuggestion(suggestion),
    label: suggestion.label,
    completed: false,
    note: null,
    origin: "MANUAL",
    relatedRuleId: null,
    sourceKind: "KNOWLEDGE_SUGGESTED",
    sourceRef,
  };
}

function sanitizeIdPart(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 48);
}

function cryptoRandomSuffix(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID().slice(0, 8);
  }
  return `${Date.now().toString(36)}`;
}
