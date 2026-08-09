/**
 * v1.5 Milestone 3 Workstream A：Investigation Progress（Domain projection）。
 *
 * 只读、确定性聚合已有事实；不创建第二套 missing context / evidence / checklist 存储。
 * Investigation Progress ≠ Case 结论；不得自动提交 HumanReview 或关闭 Case。
 */
import type {
  CaseComplianceFinding,
  EvidenceSuggestion,
} from "@/domain/knowledge";
import {
  resolveInvestigationContextState,
  type InvestigationContextEntry,
  type InvestigationContextKey,
} from "@/domain/investigationContext";
import type {
  AnalysisResult,
  ChecklistItem,
  HumanReview,
  SecurityCase,
} from "@/domain/types";

export type InvestigationProgressKind = "CONTEXT" | "EVIDENCE" | "CHECKLIST";

export type InvestigationProgressStatus = "OPEN" | "RESOLVED";

export type InvestigationProgressSourceRef = {
  /** 稳定引用，如 context:dataCategory / evidence:db-audit / checklist:CL-1 */
  ref: string;
  /** 人类可读来源说明 */
  label: string;
};

export type InvestigationProgressItem = {
  /** 稳定去重键（catalog 顺序 + kind 前缀） */
  key: string;
  kind: InvestigationProgressKind;
  status: InvestigationProgressStatus;
  label: string;
  sourceRefs: InvestigationProgressSourceRef[];
  relatedRuleIds: string[];
  relatedControlCodes: string[];
};

export type InvestigationProgressSummary = {
  openCount: number;
  resolvedCount: number;
  openContextCount: number;
  openEvidenceCount: number;
  openChecklistCount: number;
  /** 是否仍存在阻碍人工最终研判的未解决调查事项（不含 HumanReview 自动判定） */
  hasUnresolvedInvestigationGaps: boolean;
  /** 人工最终结论是否已提交（事实陈述；不推导 Case 正常/异常） */
  humanReviewSubmitted: boolean;
};

export type InvestigationProgress = {
  contextItems: InvestigationProgressItem[];
  evidenceItems: InvestigationProgressItem[];
  checklistItems: InvestigationProgressItem[];
  unresolvedItems: InvestigationProgressItem[];
  resolvedItems: InvestigationProgressItem[];
  summary: InvestigationProgressSummary;
};

export type ResolveInvestigationProgressInput = {
  securityCase: SecurityCase;
  /** 可选：合规 findings 的 suggestedEvidence（复用已有 runtime 输出，不二次 resolve） */
  complianceFindings?: readonly CaseComplianceFinding[];
};

const CONTEXT_KEY_PREFIX = "context:";
const EVIDENCE_KEY_PREFIX = "evidence:";
const CHECKLIST_KEY_PREFIX = "checklist:";

function contextProgressKey(key: InvestigationContextKey): string {
  return `${CONTEXT_KEY_PREFIX}${key}`;
}

function evidenceProgressKey(sourceKey: string): string {
  return `${EVIDENCE_KEY_PREFIX}${sourceKey}`;
}

function checklistProgressKey(itemId: string): string {
  return `${CHECKLIST_KEY_PREFIX}${itemId}`;
}

function normalizeLabel(label: string): string {
  return label.trim();
}

function sortProgressItems(
  items: InvestigationProgressItem[],
): InvestigationProgressItem[] {
  return [...items].sort((a, b) => {
    const kindOrder =
      (a.kind === "CONTEXT" ? 0 : a.kind === "EVIDENCE" ? 1 : 2) -
      (b.kind === "CONTEXT" ? 0 : b.kind === "EVIDENCE" ? 1 : 2);
    if (kindOrder !== 0) return kindOrder;
    return a.key.localeCompare(b.key);
  });
}

function buildContextProgressItem(
  entry: InvestigationContextEntry,
): InvestigationProgressItem {
  const open = entry.status === "MISSING" || entry.status === "UNKNOWN";
  return {
    key: contextProgressKey(entry.key),
    kind: "CONTEXT",
    status: open ? "OPEN" : "RESOLVED",
    label: entry.label,
    sourceRefs: [
      {
        ref: `context:${entry.key}`,
        label: entry.sourceField,
      },
    ],
    relatedRuleIds: [],
    relatedControlCodes: [],
  };
}

function isChecklistSuggestionResolved(
  suggestionKey: string,
  label: string,
  checklist: readonly ChecklistItem[],
): boolean {
  return checklist.some(
    (item) =>
      item.completed &&
      (item.sourceRef?.suggestionKey === suggestionKey ||
        normalizeLabel(item.label) === normalizeLabel(label)),
  );
}

function isVerificationActionResolved(
  actionLabel: string,
  checklist: readonly ChecklistItem[],
): boolean {
  const normalized = normalizeLabel(actionLabel);
  return checklist.some(
    (item) => item.completed && normalizeLabel(item.label) === normalized,
  );
}

function collectSecurityEvidenceItems(
  results: readonly AnalysisResult[],
  checklist: readonly ChecklistItem[],
): InvestigationProgressItem[] {
  const byKey = new Map<string, InvestigationProgressItem>();

  for (const result of results) {
    if (result.status === "NORMAL") continue;
    for (const action of result.verificationActions) {
      const label = normalizeLabel(action);
      if (label.length === 0 || label === "无") continue;
      const sourceKey = `rule:${result.ruleId}:${label}`;
      const key = evidenceProgressKey(sourceKey);
      if (byKey.has(key)) continue;

      const resolved = isVerificationActionResolved(label, checklist);
      byKey.set(key, {
        key,
        kind: "EVIDENCE",
        status: resolved ? "RESOLVED" : "OPEN",
        label,
        sourceRefs: [
          {
            ref: `analysis:${result.ruleId}`,
            label: result.title,
          },
        ],
        relatedRuleIds: [result.ruleId],
        relatedControlCodes: [],
      });
    }
  }

  return sortProgressItems([...byKey.values()]);
}

function collectComplianceEvidenceItems(
  findings: readonly CaseComplianceFinding[],
  checklist: readonly ChecklistItem[],
): InvestigationProgressItem[] {
  const byKey = new Map<string, InvestigationProgressItem>();

  for (const finding of findings) {
    for (const suggestion of finding.suggestedEvidence) {
      appendEvidenceSuggestion(byKey, suggestion, finding, checklist);
    }
  }

  return sortProgressItems([...byKey.values()]);
}

function appendEvidenceSuggestion(
  byKey: Map<string, InvestigationProgressItem>,
  suggestion: EvidenceSuggestion,
  finding: CaseComplianceFinding,
  checklist: readonly ChecklistItem[],
): void {
  const sourceKey = suggestion.key;
  const key = evidenceProgressKey(sourceKey);
  const suggestionKey = `EVIDENCE:${sourceKey}`;
  const resolved = isChecklistSuggestionResolved(
    suggestionKey,
    suggestion.label,
    checklist,
  );

  const existing = byKey.get(key);
  if (existing) {
    if (!existing.relatedRuleIds.includes(finding.ruleId)) {
      existing.relatedRuleIds.push(finding.ruleId);
      existing.relatedRuleIds.sort();
    }
    if (!existing.relatedControlCodes.includes(finding.controlCode)) {
      existing.relatedControlCodes.push(finding.controlCode);
      existing.relatedControlCodes.sort();
    }
    if (resolved) existing.status = "RESOLVED";
    return;
  }

  byKey.set(key, {
    key,
    kind: "EVIDENCE",
    status: resolved ? "RESOLVED" : "OPEN",
    label: suggestion.label,
    sourceRefs: [
      {
        ref: suggestionKey,
        label: finding.controlCode,
      },
    ],
    relatedRuleIds: [finding.ruleId],
    relatedControlCodes: [finding.controlCode],
  });
}

function collectChecklistProgressItems(
  checklist: readonly ChecklistItem[],
): InvestigationProgressItem[] {
  return sortProgressItems(
    checklist.map((item) => ({
      key: checklistProgressKey(item.id),
      kind: "CHECKLIST" as const,
      status: item.completed ? ("RESOLVED" as const) : ("OPEN" as const),
      label: item.label,
      sourceRefs: [
        {
          ref: item.sourceRef?.suggestionKey ?? `checklist:${item.id}`,
          label:
            item.sourceKind === "KNOWLEDGE_SUGGESTED"
              ? "KNOWLEDGE_SUGGESTED"
              : item.origin,
        },
      ],
      relatedRuleIds: item.relatedRuleId ? [item.relatedRuleId] : [],
      relatedControlCodes: item.sourceRef?.controlCodes ?? [],
    })),
  );
}

function buildSummary(
  items: InvestigationProgressItem[],
  humanReview: HumanReview | null,
): InvestigationProgressSummary {
  const openItems = items.filter((i) => i.status === "OPEN");
  const resolvedItems = items.filter((i) => i.status === "RESOLVED");

  return {
    openCount: openItems.length,
    resolvedCount: resolvedItems.length,
    openContextCount: openItems.filter((i) => i.kind === "CONTEXT").length,
    openEvidenceCount: openItems.filter((i) => i.kind === "EVIDENCE").length,
    openChecklistCount: openItems.filter((i) => i.kind === "CHECKLIST").length,
    hasUnresolvedInvestigationGaps: openItems.length > 0,
    humanReviewSubmitted: humanReview?.finalConclusion != null,
  };
}

/**
 * 解析 Case 当前 Investigation Progress（纯函数、确定性）。
 */
export function resolveInvestigationProgress(
  input: ResolveInvestigationProgressInput,
): InvestigationProgress {
  const { securityCase, complianceFindings = [] } = input;

  const contextState = resolveInvestigationContextState(securityCase);
  const contextItems = sortProgressItems(
    contextState.entries.map(buildContextProgressItem),
  );

  const securityEvidenceItems = collectSecurityEvidenceItems(
    securityCase.analysisResults,
    securityCase.checklist,
  );
  const complianceEvidenceItems = collectComplianceEvidenceItems(
    complianceFindings,
    securityCase.checklist,
  );

  const evidenceByKey = new Map<string, InvestigationProgressItem>();
  for (const item of [...securityEvidenceItems, ...complianceEvidenceItems]) {
    const existing = evidenceByKey.get(item.key);
    if (!existing) {
      evidenceByKey.set(item.key, item);
      continue;
    }
    if (item.status === "RESOLVED") existing.status = "RESOLVED";
    for (const ruleId of item.relatedRuleIds) {
      if (!existing.relatedRuleIds.includes(ruleId)) {
        existing.relatedRuleIds.push(ruleId);
      }
    }
    for (const code of item.relatedControlCodes) {
      if (!existing.relatedControlCodes.includes(code)) {
        existing.relatedControlCodes.push(code);
      }
    }
    existing.relatedRuleIds.sort();
    existing.relatedControlCodes.sort();
  }
  const evidenceItems = sortProgressItems([...evidenceByKey.values()]);

  const checklistItems = collectChecklistProgressItems(securityCase.checklist);

  const allItems = sortProgressItems([
    ...contextItems,
    ...evidenceItems,
    ...checklistItems,
  ]);
  const unresolvedItems = sortProgressItems(
    allItems.filter((i) => i.status === "OPEN"),
  );
  const resolvedItems = sortProgressItems(
    allItems.filter((i) => i.status === "RESOLVED"),
  );

  return {
    contextItems,
    evidenceItems,
    checklistItems,
    unresolvedItems,
    resolvedItems,
    summary: buildSummary(allItems, securityCase.humanReview),
  };
}
